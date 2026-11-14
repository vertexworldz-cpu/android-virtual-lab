"""Dataset pipeline: turn raw text or chat records into training batches.

Two dataset kinds share one interface (``get_batch(split) -> (x, y)``):

* :class:`PackedDataset` — pretraining. One long token stream stored as a
  uint16/uint32 memmap; batches are random windows. Scales to corpora far
  larger than RAM.
* :class:`ChatDataset` — instruction tuning. One padded sequence per
  conversation; loss is applied only to assistant tokens.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterable

import numpy as np
import torch

from .chat_format import encode_chat_with_mask
from .tokenizer import Tokenizer, iter_text_file


def read_jsonl(path: str | Path) -> list[dict]:
    with open(path, "r", encoding="utf-8") as fh:
        return [json.loads(line) for line in fh if line.strip()]


def write_jsonl(path: str | Path, rows: Iterable[dict]) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        for row in rows:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def pack_text_files(tok: Tokenizer, files: list[str | Path], out_path: str | Path) -> int:
    """Tokenise text files into a flat binary token stream. Returns token count."""
    dtype = np.uint16 if tok.vocab_size <= 65536 else np.uint32
    eos = tok.token_id("<|eos|>")
    total = 0
    with open(out_path, "wb") as out:
        for f in files:
            for piece in iter_text_file(f):
                ids = np.asarray(tok.encode(piece), dtype=dtype)
                ids.tofile(out)
                total += len(ids)
            np.asarray([eos], dtype=dtype).tofile(out)
            total += 1
    Path(str(out_path) + ".meta.json").write_text(
        json.dumps({"dtype": np.dtype(dtype).name, "tokens": total, "vocab_size": tok.vocab_size}))
    return total


class PackedDataset:
    def __init__(self, train_bin: str | Path, val_bin: str | Path, block_size: int, seed: int = 0):
        self.block_size = block_size
        self.data = {"train": self._open(train_bin), "val": self._open(val_bin)}
        self.rng = np.random.default_rng(seed)

    @staticmethod
    def _open(path: str | Path) -> np.memmap:
        meta = json.loads(Path(str(path) + ".meta.json").read_text())
        return np.memmap(path, dtype=meta["dtype"], mode="r")

    def get_batch(self, split: str, batch_size: int, device: str) -> tuple[torch.Tensor, torch.Tensor]:
        d = self.data[split]
        starts = self.rng.integers(0, len(d) - self.block_size - 1, size=batch_size)
        x = np.stack([d[s:s + self.block_size].astype(np.int64) for s in starts])
        y = np.stack([d[s + 1:s + 1 + self.block_size].astype(np.int64) for s in starts])
        return torch.from_numpy(x).to(device), torch.from_numpy(y).to(device)


class ChatDataset:
    def __init__(self, tok: Tokenizer, train: list[dict], val: list[dict], block_size: int, seed: int = 0):
        self.pad = tok.pad_id
        self.block_size = block_size
        self.skipped = 0
        self.data = {"train": self._encode(tok, train), "val": self._encode(tok, val)}
        self.rng = np.random.default_rng(seed)

    def _encode(self, tok: Tokenizer, examples: list[dict]) -> list[tuple[np.ndarray, np.ndarray]]:
        out = []
        for ex in examples:
            ids, mask = encode_chat_with_mask(tok, ex["messages"])
            if len(ids) > self.block_size + 1:
                self.skipped += 1
                continue
            ids_a = np.asarray(ids, dtype=np.int64)
            targets = np.where(np.asarray(mask), ids_a, -100)
            out.append((ids_a[:-1], targets[1:]))
        if not out:
            raise ValueError("No examples fit within block_size")
        return out

    def get_batch(self, split: str, batch_size: int, device: str) -> tuple[torch.Tensor, torch.Tensor]:
        d = self.data[split]
        picks = self.rng.integers(0, len(d), size=batch_size)
        width = max(len(d[i][0]) for i in picks)
        x = np.full((batch_size, width), self.pad, dtype=np.int64)
        y = np.full((batch_size, width), -100, dtype=np.int64)
        for row, i in enumerate(picks):
            xi, yi = d[i]
            x[row, :len(xi)] = xi
            y[row, :len(yi)] = yi
        return torch.from_numpy(x).to(device), torch.from_numpy(y).to(device)
