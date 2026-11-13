from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, current_user, require_admin
from ..engine import ModelUnavailable, manager
from ..models import SystemSetting, User

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
def list_models(user: User = Depends(current_user)) -> dict:
    manager.ensure_default()
    return {"models": manager.list_models(), "active": manager.active}


@router.get("/active")
def active_model(user: User = Depends(current_user)) -> dict:
    return manager.status()


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
