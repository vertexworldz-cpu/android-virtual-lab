"""Object storage abstraction. `LocalStorage` is the default backend; an
S3-compatible backend implements the same four methods."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import BinaryIO, Protocol


class TooLarge(Exception):
    pass


class Storage(Protocol):
    def save(self, key: str, stream: BinaryIO, max_bytes: int) -> tuple[int, str]: ...
    def path(self, key: str) -> Path: ...
    def read_text(self, key: str, max_bytes: int) -> str: ...
    def delete(self, key: str) -> None: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if not p.is_relative_to(self.root):
            raise ValueError("Invalid storage key")
        return p

    def save(self, key: str, stream: BinaryIO, max_bytes: int) -> tuple[int, str]:
        """Streams to disk, enforcing the size limit. Returns (size, sha256)."""
        dest = self.path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        digest, size = hashlib.sha256(), 0
        tmp = dest.with_suffix(".part")
        try:
            with open(tmp, "wb") as out:
                while chunk := stream.read(1 << 20):
                    size += len(chunk)
                    if size > max_bytes:
                        raise TooLarge()
                    digest.update(chunk)
                    out.write(chunk)
            tmp.replace(dest)
        finally:
            tmp.unlink(missing_ok=True)
        return size, digest.hexdigest()

    def read_text(self, key: str, max_bytes: int) -> str:
        with open(self.path(key), "rb") as fh:
            return fh.read(max_bytes).decode("utf-8", errors="replace")

    def delete(self, key: str) -> None:
        self.path(key).unlink(missing_ok=True)
