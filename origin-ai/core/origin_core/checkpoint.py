"""Checkpoint layout. A checkpoint is a self-contained directory:

    model.pt          weights + model config (+ optimizer state for resume)
    tokenizer.json    the exact tokenizer the weights were trained with
    model_card.json   name, size, training data, measured metrics, limits
    metrics.jsonl     training/eval log, one JSON object per line
"""

from __future__ import annotations

import json
from pathlib import Path

import torch

from .config import ModelConfig
from .model import OriginLM
from .tokenizer import Tokenizer

MODEL_FILE = "model.pt"
TOKENIZER_FILE = "tokenizer.json"
CARD_FILE = "model_card.json"
METRICS_FILE = "metrics.jsonl"


def save_checkpoint(out_dir: str | Path, model: OriginLM, tok: Tokenizer, step: int,
                    optimizer: torch.optim.Optimizer | None = None, extra: dict | None = None) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    payload = {"model_config": model.cfg.to_dict(), "state_dict": model.state_dict(), "step": step,
               "extra": extra or {}}
    if optimizer is not None:
        payload["optimizer"] = optimizer.state_dict()
    tmp = out / (MODEL_FILE + ".tmp")
    torch.save(payload, tmp)
    tmp.replace(out / MODEL_FILE)  # atomic: a crash never leaves a half-written file
    tok.save(out / TOKENIZER_FILE)


def load_checkpoint(ckpt_dir: str | Path, device: str = "cpu") -> tuple[OriginLM, Tokenizer, dict]:
    d = Path(ckpt_dir)
    # weights_only=True: never unpickle arbitrary objects from a checkpoint.
    payload = torch.load(d / MODEL_FILE, map_location=device, weights_only=True)
    model = OriginLM(ModelConfig(**payload["model_config"]))
    model.load_state_dict(payload["state_dict"])
    model.to(device)
    tok = Tokenizer.load(d / TOKENIZER_FILE)
    return model, tok, payload


def read_card(ckpt_dir: str | Path) -> dict:
    p = Path(ckpt_dir) / CARD_FILE
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}


def write_card(ckpt_dir: str | Path, card: dict) -> None:
    (Path(ckpt_dir) / CARD_FILE).write_text(json.dumps(card, indent=2), encoding="utf-8")
