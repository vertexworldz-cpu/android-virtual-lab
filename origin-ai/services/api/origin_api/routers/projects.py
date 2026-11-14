from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user
from ..models import Conversation, Project, User
from ..schemas import ProjectIn, ProjectOut

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project(db: Session, user: User, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Project not found")
    return p


def _out(db: Session, p: Project) -> ProjectOut:
    out = ProjectOut.model_validate(p)
    out.conversation_count = db.scalar(
        select(func.count()).select_from(Conversation).where(Conversation.project_id == p.id)) or 0
    return out


@router.get("", response_model=list[ProjectOut])
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).where(Project.user_id == user.id).order_by(Project.updated_at.desc())).all()
    return [_out(db, p) for p in rows]


@router.post("", response_model=ProjectOut, status_code=201)
def create_project(body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = Project(user_id=user.id, name=body.name.strip(), description=body.description)
    db.add(p)
    db.commit()
    return _out(db, p)


@router.patch("/{project_id}", response_model=ProjectOut)
def update_project(project_id: str, body: ProjectIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = get_project(db, user, project_id)
    p.name, p.description = body.name.strip(), body.description
    db.commit()
    return _out(db, p)


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Deletes the project. Its conversations are kept and become unfiled."""
    p = get_project(db, user, project_id)
    for c in db.scalars(select(Conversation).where(Conversation.project_id == p.id)):
        c.project_id = None
    db.delete(p)
    db.commit()
