"""Inference engine: streaming autoregressive generation with a KV cache."""

from __future__ import annotations

import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import torch

from .chat_format import fit_context
from .checkpoint import load_checkpoint, read_card


@dataclass
class GenerationParams:
    max_new_tokens: int = 128
    temperature: float = 0.0   # 0 = greedy
    top_k: int = 0             # 0 = disabled
    top_p: float = 1.0
    seed: int | None = None


@dataclass
class GenerationStats:
    prompt_tokens: int = 0
    completion_tokens: int = 0
    dropped_messages: int = 0
    finish_reason: str = "stop"   # stop | length | cancelled


def pick_device(requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def sample_next(logits: torch.Tensor, p: GenerationParams, generator: torch.Generator | None) -> int:
    if p.temperature <= 0:
        return int(logits.argmax())
    logits = logits / p.temperature
    if p.top_k > 0:
        kth = torch.topk(logits, min(p.top_k, logits.numel())).values[-1]
        logits = logits.masked_fill(logits < kth, float("-inf"))
    probs = torch.softmax(logits, dim=-1)
    if p.top_p < 1.0:
        sorted_probs, order = probs.sort(descending=True)
        keep = sorted_probs.cumsum(0) - sorted_probs < p.top_p
        probs = torch.zeros_like(probs).scatter(0, order[keep], sorted_probs[keep])
        probs = probs / probs.sum()
    return int(torch.multinomial(probs.cpu(), 1, generator=generator))


class Generator:
    """Loads one checkpoint and serves streaming chat completions from it."""

    def __init__(self, ckpt_dir: str | Path, device: str = "auto"):
        self.ckpt_dir = Path(ckpt_dir)
        self.device = pick_device(device)
        self.model, self.tok, payload = load_checkpoint(self.ckpt_dir, self.device)
        self.model.eval()
        self.card = read_card(self.ckpt_dir)
        self.step = payload.get("step", 0)
        self.block_size = self.model.cfg.block_size
        self._stop_ids = {self.tok.token_id("<|end|>"), self.tok.token_id("<|eos|>")}
        self._lock = threading.Lock()  # one generation at a time per model instance

    @torch.inference_mode()
    def stream(self, messages: list[dict], params: GenerationParams | None = None,
               stats: GenerationStats | None = None, cancel: threading.Event | None = None) -> Iterator[str]:
        """Yield decoded text pieces. ``stats`` (if given) is filled in as generation proceeds."""
        p = params or GenerationParams()
        stats = stats if stats is not None else GenerationStats()
        max_new = max(1, min(p.max_new_tokens, self.block_size // 2))
        prompt, dropped = fit_context(self.tok, messages, self.block_size - max_new)
        stats.prompt_tokens, stats.dropped_messages = len(prompt), dropped
        rng = None
        if p.seed is not None:
            rng = torch.Generator().manual_seed(p.seed)
        decoder = self.tok.stream_decoder()
        with self._lock:
            idx = torch.tensor([prompt], dtype=torch.long, device=self.device)
            logits, _, cache = self.model(idx, return_cache=True)
            stats.finish_reason = "length"
            for _ in range(max_new):
                if cancel is not None and cancel.is_set():
                    stats.finish_reason = "cancelled"
                    break
                nxt = sample_next(logits[0, -1], p, rng)
                if nxt in self._stop_ids:
                    stats.finish_reason = "stop"
                    break
                stats.completion_tokens += 1
                text = decoder.push(nxt)
                if text:
                    yield text
                logits, _, cache = self.model(
                    torch.tensor([[nxt]], dtype=torch.long, device=self.device), cache=cache, return_cache=True)
        tail = decoder.flush()
        if tail:
            yield tail

    def complete(self, messages: list[dict], params: GenerationParams | None = None) -> str:
        return "".join(self.stream(messages, params))
