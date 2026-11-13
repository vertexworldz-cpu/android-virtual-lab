"""Model registry and in-process inference manager.

The registry is the checkpoints directory: every sub-directory holding
``model.pt`` + ``tokenizer.json`` is a servable Origin model. Nothing here
calls any external AI service — if no checkpoint exists, the platform says
so instead of answering.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from origin_core.checkpoint import CARD_FILE, METRICS_FILE, MODEL_FILE, TOKENIZER_FILE
from origin_core.inference import Generator

from .config import get_settings


class ModelUnavailable(Exception):
    pass


def _is_checkpoint(d: Path) -> bool:
    return d.is_dir() and (d / MODEL_FILE).exists() and (d / TOKENIZER_FILE).exists()


class ModelManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._generator: Generator | None = None
        self._active: str | None = None
        self.load_error: str | None = None

    @property
    def root(self) -> Path:
        return get_settings().checkpoints_path

    def list_models(self) -> list[dict]:
        out = []
        for d in sorted(self.root.iterdir()) if self.root.exists() else []:
            if not _is_checkpoint(d):
                continue
            card = {}
            if (d / CARD_FILE).exists():
                try:
                    card = json.loads((d / CARD_FILE).read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    card = {}
            out.append({"name": d.name, "size_bytes": (d / MODEL_FILE).stat().st_size,
                        "modified_at": (d / MODEL_FILE).stat().st_mtime, "card": card,
                        "active": d.name == self._active, "loaded": d.name == self._active and self._generator is not None})
        return out

    def metrics(self, name: str, limit: int = 2000) -> list[dict]:
        d = self._dir(name)
        p = d / METRICS_FILE
        if not p.exists():
            return []
        rows = []
        for line in p.read_text(encoding="utf-8").splitlines()[-limit:]:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError:
                continue
        return rows

    def _dir(self, name: str) -> Path:
        d = (self.root / name).resolve()
        if d.parent != self.root.resolve() or not _is_checkpoint(d):
            raise ModelUnavailable(f"Model '{name}' was not found")
        return d

    def set_active(self, name: str | None) -> None:
        """Choose which model serves chat. Loading happens lazily."""
        with self._lock:
            if name is not None:
                self._dir(name)
            if name != self._active:
                self._active, self._generator, self.load_error = name, None, None

    @property
    def active(self) -> str | None:
        return self._active

    def ensure_default(self) -> None:
        """If no model is selected, or the selection vanished, pick the first available."""
        names = [m["name"] for m in self.list_models()]
        if self._active not in names:
            self.set_active(names[0] if names else None)

    def get(self) -> Generator:
        self.ensure_default()
        with self._lock:
            if self._active is None:
                raise ModelUnavailable(
                    "No Origin model checkpoint is available yet. Train one with "
                    "`make bootstrap-model`, then reload.")
            if self._generator is None:
                try:
                    self._generator = Generator(self.root / self._active, device=get_settings().inference_device)
                    self.load_error = None
                except Exception as exc:  # corrupt or incompatible checkpoint
                    self.load_error = f"{type(exc).__name__}: {exc}"
                    raise ModelUnavailable(f"Model '{self._active}' failed to load: {self.load_error}") from exc
            return self._generator

    def status(self) -> dict:
        self.ensure_default()
        base = {"available": False, "name": self._active, "loaded": self._generator is not None,
                "error": self.load_error}
        if self._active is None:
            return {**base, "reason": "No trained checkpoint found."}
        card = next((m["card"] for m in self.list_models() if m["name"] == self._active), {})
        return {**base, "available": self.load_error is None, "card": card}


manager = ModelManager()
