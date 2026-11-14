from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Memory, User
from ..schemas import MemoryIn, MemoryOut, MemoryPatch
from .projects import get_project

router = APIRouter(prefix="/memory", tags=["memory"])


def _get(db: Session, user: User, memory_id: str) -> Memory:
    m = db.get(Memory, memory_id)
    if m is None or m.user_id != user.id:
        raise HTTPException(404, "Memory not found")
    return m


@router.get("", response_model=list[MemoryOut])
def list_memories(q: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Memory).where(Memory.user_id == user.id)
    if q.strip():
        stmt = stmt.where(Memory.content.ilike(f"%{q.strip()}%", escape="\\"))
    return db.scalars(stmt.order_by(Memory.updated_at.desc())).all()


@router.post("", response_model=MemoryOut, status_code=201)
def create_memory(body: MemoryIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.project_id:
        get_project(db, user, body.project_id)
    m = Memory(user_id=user.id, content=body.content.strip(), kind=body.kind, project_id=body.project_id)
    db.add(m)
    db.commit()
    return m


@router.patch("/{memory_id}", response_model=MemoryOut)
def update_memory(memory_id: str, body: MemoryPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    m = _get(db, user, memory_id)
    for field in ("content", "kind", "enabled"):
        value = getattr(body, field)
        if value is not None:
            setattr(m, field, value)
    db.commit()
    return m


@router.delete("/{memory_id}", status_code=204)
def delete_memory(memory_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(_get(db, user, memory_id))
    db.commit()


@router.delete("", status_code=204)
def clear_memories(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(delete(Memory).where(Memory.user_id == user.id))
    db.commit()
