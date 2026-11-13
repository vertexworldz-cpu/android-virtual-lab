from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import audit, require_admin
from ..models import AuditLog, AuthSession, Conversation, File, Message, User
from ..schemas import AdminUserPatch, AuditOut, UserOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/overview")
def overview(admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    def count(model) -> int:
        return db.scalar(select(func.count()).select_from(model)) or 0
    return {"users": count(User), "conversations": count(Conversation), "messages": count(Message),
            "files": count(File), "storage_bytes": db.scalar(select(func.coalesce(func.sum(File.size), 0))) or 0,
            "active_sessions": count(AuthSession)}


@router.get("/users", response_model=list[UserOut])
def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.created_at)).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: AdminUserPatch, request: Request, admin: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    # Only owners may change owners or grant ownership.
    if admin.role != "owner" and (target.role == "owner" or body.role == "owner"):
        raise HTTPException(403, "Only an owner can manage owner accounts")
    removing_owner = target.role == "owner" and (
        (body.role is not None and body.role != "owner") or body.is_active is False)
    if removing_owner:
        owners = db.scalar(select(func.count()).select_from(User).where(User.role == "owner", User.is_active)) or 0
        if owners <= 1:
            raise HTTPException(400, "The installation must keep at least one active owner")
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
        if not body.is_active:
            db.execute(delete(AuthSession).where(AuthSession.user_id == target.id))
    audit(db, "admin.user_update", user_id=admin.id, target=target.id, request=request,
          detail=body.model_dump(exclude_none=True))
    db.commit()
    return target


@router.get("/audit", response_model=list[AuditOut])
def audit_log(limit: int = 100, offset: int = 0, action: str = "", admin: User = Depends(require_admin),
              db: Session = Depends(get_db)):
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action.startswith(action))
    return db.scalars(stmt.order_by(AuditLog.id.desc()).limit(min(max(limit, 1), 500)).offset(max(offset, 0))).all()
