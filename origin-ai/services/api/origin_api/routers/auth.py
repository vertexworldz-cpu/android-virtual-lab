from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import SESSION_COOKIE, audit, client_ip, current_user
from ..models import AuthSession, User
from ..rate_limit import RateLimiter
from ..schemas import LoginIn, PasswordIn, ProfileIn, RegisterIn, UserOut
from ..security import hash_password, hash_token, new_session_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
_s = get_settings()
auth_limiter = RateLimiter(_s.auth_rate_limit, _s.auth_rate_window_seconds)
# Verified against when the email is unknown, so timing does not reveal which accounts exist.
_DUMMY_HASH = hash_password("origin-dummy-password")


def _start_session(db: Session, user: User, request: Request, response: Response) -> None:
    settings = get_settings()
    token = new_session_token()
    ttl = timedelta(days=settings.session_ttl_days)
    db.add(AuthSession(user_id=user.id, token_hash=hash_token(token), expires_at=datetime.now(timezone.utc) + ttl,
                       user_agent=request.headers.get("user-agent", "")[:400], ip=client_ip(request)))
    user.last_login_at = datetime.now(timezone.utc)
    response.set_cookie(SESSION_COOKIE, token, max_age=int(ttl.total_seconds()), httponly=True,
                        samesite="lax", secure=settings.cookie_secure, path="/")


def _limit(request: Request) -> None:
    if not auth_limiter.hit(client_ip(request)):
        raise HTTPException(429, "Too many attempts. Try again in a few minutes.")


@router.get("/status")
def auth_status(db: Session = Depends(get_db)) -> dict:
    """Public: tells the sign-in screen whether this install needs its first (owner) account."""
    has_users = (db.scalar(select(func.count()).select_from(User)) or 0) > 0
    return {"has_users": has_users, "registration_open": get_settings().allow_registration or not has_users}


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _limit(request)
    first = (db.scalar(select(func.count()).select_from(User)) or 0) == 0
    if not first and not get_settings().allow_registration:
        raise HTTPException(403, "Registration is closed on this installation")
    if db.scalar(select(User).where(User.email == body.email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=body.email, display_name=body.display_name.strip(),
                password_hash=hash_password(body.password), role="owner" if first else "user")
    db.add(user)
    db.flush()
    _start_session(db, user, request, response)
    audit(db, "auth.register", user_id=user.id, request=request, detail={"role": user.role})
    db.commit()
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    _limit(request)
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else _DUMMY_HASH)
    if not user or not ok:
        audit(db, "auth.login_failed", request=request, detail={"email": body.email[:320]})
        db.commit()
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "Account disabled")
    _start_session(db, user, request, response)
    audit(db, "auth.login", user_id=user.id, request=request)
    db.commit()
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(AuthSession).where(AuthSession.id == request.state.session_id))
    audit(db, "auth.logout", user_id=user.id, request=request)
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    user = db.merge(user)
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    if body.theme is not None:
        user.preferences = {**(user.preferences or {}), "theme": body.theme}
    db.commit()
    return user


@router.post("/password", status_code=204)
def change_password(body: PasswordIn, request: Request, user: User = Depends(current_user),
                    db: Session = Depends(get_db)):
    _limit(request)
    user = db.merge(user)
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    # Sign out every other session.
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.id != request.state.session_id))
    audit(db, "auth.password_changed", user_id=user.id, request=request)
    db.commit()
