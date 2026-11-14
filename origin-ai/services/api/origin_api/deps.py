from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import get_db
from .models import AuditLog, AuthSession, User
from .security import hash_token

SESSION_COOKIE = "origin_session"


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""


def _token_from(request: Request) -> str | None:
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return request.cookies.get(SESSION_COOKIE)


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = _token_from(request)
    if not token:
        raise HTTPException(401, "Not authenticated")
    sess = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if sess is None or _aware(sess.expires_at) < datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    if not sess.user.is_active:
        raise HTTPException(403, "Account disabled")
    request.state.session_id = sess.id
    return sess.user


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role not in ("owner", "admin"):
        raise HTTPException(403, "Administrator access required")
    return user


def audit(db: Session, action: str, *, user_id: str | None = None, target: str = "",
          request: Request | None = None, detail: dict | None = None) -> None:
    """Append an audit record. The caller commits."""
    db.add(AuditLog(action=action, user_id=user_id, target=target,
                    ip=client_ip(request) if request else "", detail=detail or {}))
