from __future__ import annotations

import re
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..deps import audit, current_user
from ..models import File, User, new_id
from ..schemas import FileOut
from ..storage import LocalStorage, TooLarge

router = APIRouter(prefix="/files", tags=["files"])


def storage() -> LocalStorage:
    return LocalStorage(get_settings().uploads_path)


def clean_filename(name: str) -> str:
    """Keep only the final path component and strip control characters."""
    name = re.split(r"[/\\]", (name or "").strip())[-1]
    name = re.sub(r"[\x00-\x1f]", "_", name).strip(". ")
    return name[:255] or "file"


def get_file(db: Session, user: User, file_id: str) -> File:
    f = db.get(File, file_id)
    if f is None or f.user_id != user.id:
        raise HTTPException(404, "File not found")
    return f


@router.get("", response_model=list[FileOut])
def list_files(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return db.scalars(select(File).where(File.user_id == user.id).order_by(File.created_at.desc())).all()


@router.post("", response_model=FileOut, status_code=201)
def upload_file(file: UploadFile, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    settings = get_settings()
    file_id = new_id()
    key = f"{user.id}/{file_id}"
    try:
        size, digest = storage().save(key, file.file, settings.max_upload_mb * 1024 * 1024)
    except TooLarge:
        raise HTTPException(413, f"File is larger than the {settings.max_upload_mb} MB limit")
    if size == 0:
        storage().delete(key)
        raise HTTPException(400, "File is empty")
    row = File(id=file_id, user_id=user.id, filename=clean_filename(file.filename or ""),
               content_type=(file.content_type or "application/octet-stream")[:127],
               size=size, sha256=digest, storage_key=key)
    db.add(row)
    audit(db, "file.upload", user_id=user.id, target=file_id, request=request, detail={"size": size})
    db.commit()
    return row


@router.get("/{file_id}/download")
def download_file(file_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = get_file(db, user, file_id)
    path = storage().path(f.storage_key)
    if not path.exists():
        raise HTTPException(410, "File content is missing from storage")
    # Always served as a download with nosniff: uploads are never rendered in our origin.
    return FileResponse(path, media_type="application/octet-stream", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(f.filename)}",
        "X-Content-Type-Options": "nosniff"})


@router.delete("/{file_id}", status_code=204)
def delete_file(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = get_file(db, user, file_id)
    storage().delete(f.storage_key)
    db.delete(f)
    audit(db, "file.delete", user_id=user.id, target=file_id, request=request)
    db.commit()
