from __future__ import annotations

import time

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, current_user, require_admin
from ..engine import EXT_PREFIX, ModelUnavailable, load_backends, manager, save_backends
from ..models import SystemSetting, User, new_id
from ..remote import GenerationError, list_remote_models, validate_base_url

router = APIRouter(prefix="/models", tags=["models"])


class BackendIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    base_url: str = Field(min_length=1, max_length=400)
    model: str = Field(min_length=1, max_length=200)


@router.get("")
def list_models(user: User = Depends(current_user)) -> dict:
    manager.ensure_default()
    return {"models": manager.list_models(), "active": manager.active}


@router.get("/active")
def active_model(user: User = Depends(current_user)) -> dict:
    return manager.status()


# ---- external model servers (administrators only). Declared before /{name}/... routes.
@router.get("/backends")
def list_backends(admin: User = Depends(require_admin)) -> list[dict]:
    return load_backends()


@router.post("/backends", status_code=201)
def add_backend(body: BackendIn, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)) -> dict:
    try:
        url = validate_base_url(body.base_url)
    except ValueError as exc:
        raise HTTPException(422, str(exc))
    item = {"id": new_id()[:8], "name": body.name.strip(), "base_url": url, "model": body.model.strip(),
            "created_at": time.time()}
    save_backends(db, [*load_backends(), item])
    audit(db, "model.backend_add", user_id=admin.id, target=item["id"], request=request,
          detail={"name": item["name"], "base_url": url, "model": item["model"]})
    db.commit()
    return item


@router.delete("/backends/{backend_id}", status_code=204)
def delete_backend(backend_id: str, request: Request, admin: User = Depends(require_admin),
                   db: Session = Depends(get_db)) -> None:
    items = load_backends()
    if not any(b["id"] == backend_id for b in items):
        raise HTTPException(404, "Model server not found")
    save_backends(db, [b for b in items if b["id"] != backend_id])
    audit(db, "model.backend_delete", user_id=admin.id, target=backend_id, request=request)
    db.commit()
    if manager.active == EXT_PREFIX + backend_id:
        manager.set_active(None)   # ensure_default picks another model on the next request


@router.post("/backends/{backend_id}/test")
def test_backend(backend_id: str, admin: User = Depends(require_admin)) -> dict:
    """Contact the server and list its models. Always answers 200; `ok` says whether it worked."""
    b = next((b for b in load_backends() if b["id"] == backend_id), None)
    if b is None:
        raise HTTPException(404, "Model server not found")
    try:
        models = list_remote_models(b["base_url"])
    except GenerationError as exc:
        return {"ok": False, "error": str(exc), "models": []}
    names = {m.split(":")[0] for m in models}
    present = b["model"] in models or b["model"].split(":")[0] in names and ":" not in b["model"]
    return {"ok": True, "models": models, "model_available": present,
            "error": None if present else f"Connected, but the server does not list a model named '{b['model']}'."}


@router.get("/{name}/metrics")
def model_metrics(name: str, user: User = Depends(current_user)) -> dict:
    try:
        return {"name": name, "records": manager.metrics(name)}
    except ModelUnavailable as exc:
        raise HTTPException(404, str(exc))


@router.post("/{name}/activate")
def activate(name: str, request: Request, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    try:
        manager.set_active(name)
        manager.get()  # load now so a broken checkpoint is reported immediately
    except ModelUnavailable as exc:
        raise HTTPException(400, str(exc))
    db.merge(SystemSetting(key="active_model", value={"name": name}))
    audit(db, "model.activate", user_id=user.id, target=name, request=request)
    db.commit()
    return manager.status()
