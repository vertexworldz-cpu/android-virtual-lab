"""Training loop: AdamW, warmup + cosine decay, gradient clipping, mixed
precision on CUDA, periodic evaluation, atomic checkpoints and resume.

Progress is appended to ``metrics.jsonl`` as it happens, so any reader
(CLI, API, UI) sees real numbers from the actual run.
"""

from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Callable

import torch

from .checkpoint import METRICS_FILE, MODEL_FILE, save_checkpoint
from .config import ModelConfig, TrainConfig
from .evaluate import estimate_loss, perplexity
from .inference import pick_device
from .model import OriginLM
from .tokenizer import Tokenizer


def lr_at(step: int, cfg: TrainConfig) -> float:
    if step < cfg.warmup_steps:
        return cfg.learning_rate * (step + 1) / cfg.warmup_steps
    progress = min(1.0, (step - cfg.warmup_steps) / max(1, cfg.max_steps - cfg.warmup_steps))
    return cfg.min_lr + 0.5 * (cfg.learning_rate - cfg.min_lr) * (1 + math.cos(math.pi * progress))


def build_optimizer(model: OriginLM, cfg: TrainConfig) -> torch.optim.AdamW:
    decay = [p for p in model.parameters() if p.requires_grad and p.dim() >= 2]
    no_decay = [p for p in model.parameters() if p.requires_grad and p.dim() < 2]
    return torch.optim.AdamW(
        [{"params": decay, "weight_decay": cfg.weight_decay}, {"params": no_decay, "weight_decay": 0.0}],
        lr=cfg.learning_rate, betas=cfg.betas)


def train(model_cfg: ModelConfig, train_cfg: TrainConfig, dataset, tok: Tokenizer, resume: bool = False,
          on_log: Callable[[dict], None] | None = None) -> dict:
    """Train a model from random initialisation (or resume). Returns a summary dict."""
    device = pick_device(train_cfg.device)
    if train_cfg.num_threads:
        torch.set_num_threads(train_cfg.num_threads)
    torch.manual_seed(train_cfg.seed)
    out_dir = Path(train_cfg.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    metrics_path = out_dir / METRICS_FILE

    model = OriginLM(model_cfg).to(device)
    optimizer = build_optimizer(model, train_cfg)
    start_step, best_val = 0, float("inf")
    if resume and (out_dir / MODEL_FILE).exists():
        payload = torch.load(out_dir / MODEL_FILE, map_location=device, weights_only=True)
        model.load_state_dict(payload["state_dict"])
        if "optimizer" in payload:
            optimizer.load_state_dict(payload["optimizer"])
        start_step = payload.get("step", 0)
        best_val = payload.get("extra", {}).get("best_val", best_val)
    elif metrics_path.exists():
        metrics_path.unlink()

    run_model = torch.compile(model) if train_cfg.compile else model
    use_amp = train_cfg.amp and device == "cuda"
    scaler = torch.amp.GradScaler("cuda", enabled=use_amp)

    def log(record: dict) -> None:
        with open(metrics_path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record) + "\n")
        if on_log:
            on_log(record)

    log({"event": "start", "step": start_step, "device": device, "parameters": model.num_parameters(),
         "model_config": model_cfg.to_dict(), "train_config": train_cfg.to_dict(), "time": time.time()})

    model.train()
    t0 = time.time()
    last_log_t, last_log_step = t0, start_step
    step = start_step
    final_eval: dict = {}
    while step < train_cfg.max_steps:
        lr = lr_at(step, train_cfg)
        for group in optimizer.param_groups:
            group["lr"] = lr
        x, y = dataset.get_batch("train", train_cfg.batch_size, device)
        with torch.autocast(device_type="cuda", dtype=torch.bfloat16, enabled=use_amp):
            _, loss = run_model(x, y)
        optimizer.zero_grad(set_to_none=True)
        scaler.scale(loss).backward()
        if train_cfg.grad_clip > 0:
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), train_cfg.grad_clip)
        scaler.step(optimizer)
        scaler.update()
        step += 1

        if not math.isfinite(loss.item()):
            log({"event": "error", "step": step, "message": "loss became non-finite; stopping"})
            raise RuntimeError(f"Non-finite loss at step {step}")

        if step % train_cfg.log_interval == 0:
            now = time.time()
            log({"event": "train", "step": step, "loss": round(loss.item(), 5), "lr": lr,
                 "steps_per_sec": round((step - last_log_step) / max(now - last_log_t, 1e-9), 3),
                 "elapsed": round(now - t0, 1)})
            last_log_t, last_log_step = now, step

        if step % train_cfg.eval_interval == 0 or step == train_cfg.max_steps:
            losses = estimate_loss(model, dataset, train_cfg.batch_size, train_cfg.eval_batches, device)
            final_eval = {"train_loss": round(losses["train"], 5), "val_loss": round(losses["val"], 5),
                          "val_perplexity": round(perplexity(losses["val"]), 4)}
            improved = losses["val"] < best_val
            best_val = min(best_val, losses["val"])
            log({"event": "eval", "step": step, **final_eval, "best": improved, "elapsed": round(time.time() - t0, 1)})
            save_checkpoint(out_dir, model, tok, step, optimizer, extra={"best_val": best_val})

    summary = {"steps": step, "device": device, "parameters": model.num_parameters(),
               "train_seconds": round(time.time() - t0, 1), "best_val_loss": round(best_val, 5), **final_eval}
    log({"event": "done", **summary, "time": time.time()})
    return summary
