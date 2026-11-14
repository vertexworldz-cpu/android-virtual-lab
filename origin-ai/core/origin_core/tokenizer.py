"""Origin byte-level BPE tokenizer, implemented from scratch.

Design
------
* Byte-level: any UTF-8 string round-trips losslessly, there is no <unk>.
* Pre-tokenisation splits text into chunks; merges never cross a chunk.
* Every digit is its own chunk, so numbers are always encoded digit by
  digit. This keeps arithmetic learnable and number encoding predictable.
* Special tokens occupy the lowest ids and are never produced from plain
  text unless ``allow_special=True`` is passed to :meth:`encode`.

Id layout: ``[special tokens][256 raw bytes][learned merges]``.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Iterable, Iterator

SPECIAL_TOKENS = [
    "<|pad|>",
    "<|bos|>",
    "<|eos|>",
    "<|system|>",
    "<|user|>",
    "<|assistant|>",
    "<|end|>",
    "<|tool_call|>",
    "<|tool_result|>",
]

# digit | (space?)letters | (space?)punctuation | whitespace run | anything else
_CHUNK_RE = re.compile(r"\d| ?[^\W\d_]+| ?[^\s\w]+|\s+|.", re.DOTALL)

FORMAT_VERSION = 1


class Tokenizer:
    def __init__(self, merges: list[tuple[int, int]] | None = None, special_tokens: list[str] | None = None):
        self.special_tokens = list(special_tokens if special_tokens is not None else SPECIAL_TOKENS)
        self.special_to_id = {tok: i for i, tok in enumerate(self.special_tokens)}
        self.byte_offset = len(self.special_tokens)
        self.merges: list[tuple[int, int]] = [tuple(m) for m in (merges or [])]
        self._rebuild()

    # ------------------------------------------------------------------ setup
    def _rebuild(self) -> None:
        first_merge_id = self.byte_offset + 256
        self.ranks = {pair: first_merge_id + i for i, pair in enumerate(self.merges)}
        self.vocab: dict[int, bytes] = {self.byte_offset + b: bytes([b]) for b in range(256)}
        for pair, idx in self.ranks.items():
            self.vocab[idx] = self.vocab[pair[0]] + self.vocab[pair[1]]
        self._cache: dict[str, list[int]] = {}
        if self.special_tokens:
            self._special_re = re.compile("(" + "|".join(re.escape(t) for t in self.special_tokens) + ")")
        else:
            self._special_re = None

    @property
    def vocab_size(self) -> int:
        return self.byte_offset + 256 + len(self.merges)

    def token_id(self, special: str) -> int:
        return self.special_to_id[special]

    @property
    def pad_id(self) -> int:
        return self.special_to_id["<|pad|>"]

    # --------------------------------------------------------------- training
    @classmethod
    def train(cls, texts: Iterable[str], vocab_size: int, special_tokens: list[str] | None = None,
              min_frequency: int = 2) -> "Tokenizer":
        """Learn BPE merges from an iterable of text until ``vocab_size`` is reached."""
        tok = cls(special_tokens=special_tokens)
        if vocab_size < tok.vocab_size:
            raise ValueError(f"vocab_size must be >= {tok.vocab_size}")
        chunk_counts: Counter[str] = Counter()
        for text in texts:
            chunk_counts.update(_CHUNK_RE.findall(text))

        off = tok.byte_offset
        words: list[list[int]] = []
        freqs: list[int] = []
        for chunk, freq in chunk_counts.items():
            ids = [off + b for b in chunk.encode("utf-8")]
            if len(ids) > 1:
                words.append(ids)
                freqs.append(freq)

        pair_counts: Counter[tuple[int, int]] = Counter()
        pair_words: dict[tuple[int, int], set[int]] = {}
        for wi, ids in enumerate(words):
            for pair in zip(ids, ids[1:]):
                pair_counts[pair] += freqs[wi]
                pair_words.setdefault(pair, set()).add(wi)

        merges: list[tuple[int, int]] = []
        next_id = tok.vocab_size
        while next_id < vocab_size and pair_counts:
            # Deterministic: highest count, ties broken by smallest pair.
            best = min(pair_counts, key=lambda p: (-pair_counts[p], p))
            if pair_counts[best] < min_frequency:
                break
            merges.append(best)
            for wi in list(pair_words.get(best, ())):
                ids, f = words[wi], freqs[wi]
                for pair in zip(ids, ids[1:]):
                    pair_counts[pair] -= f
                    if pair_counts[pair] <= 0:
                        del pair_counts[pair]
                    s = pair_words.get(pair)
                    if s is not None:
                        s.discard(wi)
                new_ids = _merge(ids, best, next_id)
                words[wi] = new_ids
                for pair in zip(new_ids, new_ids[1:]):
                    pair_counts[pair] += f
                    pair_words.setdefault(pair, set()).add(wi)
            pair_counts.pop(best, None)
            pair_words.pop(best, None)
            next_id += 1

        return cls(merges=merges, special_tokens=tok.special_tokens)

    # --------------------------------------------------------------- encoding
    def _encode_chunk(self, chunk: str) -> list[int]:
        cached = self._cache.get(chunk)
        if cached is not None:
            return cached
        ids = [self.byte_offset + b for b in chunk.encode("utf-8")]
        while len(ids) > 1:
            best = min(zip(ids, ids[1:]), key=lambda p: self.ranks.get(p, float("inf")))
            if best not in self.ranks:
                break
            ids = _merge(ids, best, self.ranks[best])
        if len(self._cache) < 200_000:
            self._cache[chunk] = ids
        return ids

    def _encode_plain(self, text: str) -> list[int]:
        out: list[int] = []
        for chunk in _CHUNK_RE.findall(text):
            out.extend(self._encode_chunk(chunk))
        return out

    def encode(self, text: str, allow_special: bool = False) -> list[int]:
        """Encode text. Special-token strings are only honoured when
        ``allow_special`` is True; otherwise they are encoded as plain bytes,
        so user-supplied text can never inject control tokens."""
        if not allow_special or self._special_re is None:
            return self._encode_plain(text)
        out: list[int] = []
        for part in self._special_re.split(text):
            if part in self.special_to_id:
                out.append(self.special_to_id[part])
            elif part:
                out.extend(self._encode_plain(part))
        return out

    # --------------------------------------------------------------- decoding
    def token_bytes(self, idx: int) -> bytes:
        if idx < self.byte_offset:
            return self.special_tokens[idx].encode("utf-8")
        return self.vocab[idx]

    def decode(self, ids: Iterable[int], skip_special: bool = True) -> str:
        buf = bytearray()
        for i in ids:
            if i < self.byte_offset and skip_special:
                continue
            buf.extend(self.token_bytes(i))
        return buf.decode("utf-8", errors="replace")

    def stream_decoder(self) -> "StreamDecoder":
        return StreamDecoder(self)

    # ------------------------------------------------------------ persistence
    def save(self, path: str | Path) -> None:
        payload = {
            "format": "origin-bpe",
            "version": FORMAT_VERSION,
            "special_tokens": self.special_tokens,
            "merges": [list(m) for m in self.merges],
        }
        Path(path).write_text(json.dumps(payload), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> "Tokenizer":
        payload = json.loads(Path(path).read_text(encoding="utf-8"))
        if payload.get("format") != "origin-bpe" or payload.get("version") != FORMAT_VERSION:
            raise ValueError(f"Unsupported tokenizer file: {path}")
        return cls(merges=[tuple(m) for m in payload["merges"]], special_tokens=payload["special_tokens"])


class StreamDecoder:
    """Incremental decoder that never emits a partial UTF-8 sequence."""

    def __init__(self, tokenizer: Tokenizer):
        self.tokenizer = tokenizer
        self._buf = bytearray()

    def push(self, idx: int) -> str:
        if idx < self.tokenizer.byte_offset:
            return ""
        self._buf.extend(self.tokenizer.token_bytes(idx))
        try:
            text = self._buf.decode("utf-8")
        except UnicodeDecodeError as exc:
            if exc.reason == "unexpected end of data" and len(self._buf) - exc.start < 4:
                text = self._buf[: exc.start].decode("utf-8", errors="replace")
                del self._buf[: exc.start]
                return text
            text = self._buf.decode("utf-8", errors="replace")
        self._buf.clear()
        return text

    def flush(self) -> str:
        text = self._buf.decode("utf-8", errors="replace")
        self._buf.clear()
        return text


def _merge(ids: list[int], pair: tuple[int, int], new_id: int) -> list[int]:
    out: list[int] = []
    i, n = 0, len(ids)
    while i < n:
        if i < n - 1 and ids[i] == pair[0] and ids[i + 1] == pair[1]:
            out.append(new_id)
            i += 2
        else:
            out.append(ids[i])
            i += 1
    return out


def iter_text_file(path: str | Path, chunk_chars: int = 1 << 20) -> Iterator[str]:
    """Yield a large text file in line-aligned pieces."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        while True:
            piece = fh.read(chunk_chars)
            if not piece:
                return
            piece += fh.readline()
            yield piece
