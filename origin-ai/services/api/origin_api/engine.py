"""Model registry and inference manager.

Two kinds of model can serve chat:

* ``origin``   — a checkpoint trained in this project (a directory holding
                 ``model.pt`` + ``tokenizer.json`` under the checkpoints dir),
                 loaded in-process with PyTorch.
* ``external`` — an open-model server (Ollama, llama.cpp, vLLM, ...) that an
                 administrator registered. Identified as ``ext:<id>``.

Nothing is answered by a fabricated reply: if nothing is available, chat says so.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from origin_core.checkpoint import CARD_FILE, METRICS_FILE, MODEL_FILE, TOKENIZER_FILE
from origin_core.inference import Generator

from .config import get_settings
from .db import SessionLocal
from .models import SystemSetting
from .remote import RemoteGenerator

BACKENDS_KEY = "model_backends"
EXT_PREFIX = "ext:"


class ModelUnavailable(Exception):
    pass


def _is_checkpoint(d: Path) -> bool:
    return d.is_dir() and (d / MODEL_FILE).exists() and (d / TOKENIZER_FILE).exists()


def load_backends() -> list[dict]:
    with SessionLocal() as db:
        row = db.get(SystemSetting, BACKENDS_KEY)
        return list(row.value.get("items", [])) if row else []


def save_backends(db, items: list[dict]) -> None:
    db.merge(SystemSetting(key=BACKENDS_KEY, value={"items": items}))


class ModelManager:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._generator = None
        self._active: str | None = None
        self.load_error: str | None = None

    @property
    def root(self) -> Path:
        return get_settings().checkpoints_path

    def _origin_dirs(self) -> list[Path]:
        return [d for d in sorted(self.root.iterdir()) if _is_checkpoint(d)] if self.root.exists() else []

    def list_models(self) -> list[dict]:
        out = []
        for d in self._origin_dirs():
            card = {}
            if (d / CARD_FILE).exists():
                try:
                    card = json.loads((d / CARD_FILE).read_text(encoding="utf-8"))
                except json.JSONDecodeError:
                    card = {}
            st = (d / MODEL_FILE).stat()
            out.append({"name": d.name, "kind": "origin", "display_name": d.name, "size_bytes": st.st_size,
                        "modified_at": st.st_mtime, "card": card, "active": d.name == self._active,
                        "loaded": d.name == self._active and self._generator is not None})
        for b in load_backends():
            name = EXT_PREFIX + b["id"]
            out.append({"name": name, "kind": "external", "display_name": b["name"], "size_bytes": 0,
                        "modified_at": b.get("created_at", 0),
                        "card": {"name": b["name"], "kind": "external", "remote_model": b["model"],
                                 "supports_system_prompt": True},
                        "active": name == self._active, "loaded": name == self._active})
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

    def _backend(self, name: str) -> dict:
        bid = name[len(EXT_PREFIX):]
        for b in load_backends():
            if b["id"] == bid:
                return b
        raise ModelUnavailable(f"Model server '{name}' was not found")

    def set_active(self, name: str | None) -> None:
        """Choose which model serves chat. Loading happens lazily."""
        with self._lock:
            if name is not None:
                self._backend(name) if name.startswith(EXT_PREFIX) else self._dir(name)
            if name != self._active:
                self._active, self._generator, self.load_error = name, None, None

    @property
    def active(self) -> str | None:
        return self._active

    def ensure_default(self) -> None:
        """If nothing is selected, or the selection vanished, pick an Origin checkpoint, else an external server."""
        names = [m["name"] for m in self.list_models()]
        if self._active not in names:
            origin = [m["name"] for m in self.list_models() if m["kind"] == "origin"]
            self.set_active((origin or names or [None])[0])

    def get(self):
        self.ensure_default()
        with self._lock:
            if self._active is None:
                raise ModelUnavailable(
                    "No model is available yet. Train an Origin checkpoint with `make bootstrap-model`, "
                    "or connect an open-model server under Models (administrator).")
            if self._generator is None:
                try:
                    if self._active.startswith(EXT_PREFIX):
                        self._generator = RemoteGenerator(self._backend(self._active))
                    else:
                        self._generator = Generator(self.root / self._active, device=get_settings().inference_device)
                    self.load_error = None
                except ModelUnavailable:
                    raise
                except Exception as exc:  # corrupt or incompatible checkpoint
                    self.load_error = f"{type(exc).__name__}: {exc}"
                    raise ModelUnavailable(f"Model '{self._active}' failed to load: {self.load_error}") from exc
            return self._generator

    def status(self) -> dict:
        self.ensure_default()
        base = {"available": False, "name": self._active, "loaded": self._generator is not None,
                "error": self.load_error}
        if self._active is None:
            return {**base, "reason": "No model is available."}
        m = next((m for m in self.list_models() if m["name"] == self._active), None)
        return {**base, "available": self.load_error is None, "kind": m["kind"] if m else None,
                "display_name": m["display_name"] if m else self._active, "card": m["card"] if m else {}}


manager = ModelManager()
