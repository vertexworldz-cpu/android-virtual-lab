from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth
class RegisterIn(BaseModel):
    email: str = Field(max_length=320)
    display_name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=10, max_length=256)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        local, _, domain = v.partition("@")
        if not local or "." not in domain or " " in v or domain.startswith(".") or domain.endswith("."):
            raise ValueError("Enter a valid email address")
        return v


class LoginIn(BaseModel):
    email: str = Field(max_length=320)
    password: str = Field(max_length=256)


class UserOut(ORM):
    id: str
    email: str
    display_name: str
    role: str
    is_active: bool
    preferences: dict
    created_at: datetime
    last_login_at: datetime | None = None


class ProfileIn(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    theme: Literal["light", "dark", "system"] | None = None


class PasswordIn(BaseModel):
    current_password: str = Field(max_length=256)
    new_password: str = Field(min_length=10, max_length=256)


# ---- projects
class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)


class ProjectOut(ORM):
    id: str
    name: str
    description: str
    created_at: datetime
    updated_at: datetime
    conversation_count: int = 0


# ---- files
class FileOut(ORM):
    id: str
    filename: str
    content_type: str
    size: int
    created_at: datetime


# ---- conversations
class MessageOut(ORM):
    id: str
    role: str
    content: str
    status: str
    error: str | None = None
    model: str | None = None
    usage: dict = {}
    created_at: datetime
    attachments: list[FileOut] = []


class ConversationOut(ORM):
    id: str
    title: str
    project_id: str | None = None
    pinned: bool
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationOut):
    messages: list[MessageOut] = []


class ConversationIn(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    project_id: str | None = None


class ConversationPatch(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    project_id: str | None = None
    clear_project: bool = False
    pinned: bool | None = None


class GenerationOptions(BaseModel):
    temperature: float | None = Field(default=None, ge=0, le=2)
    max_new_tokens: int | None = Field(default=None, ge=1, le=4096)


class SendMessageIn(BaseModel):
    content: str = Field(min_length=1)
    attachment_ids: list[str] = Field(default_factory=list, max_length=10)
    options: GenerationOptions = GenerationOptions()


class EditMessageIn(BaseModel):
    content: str = Field(min_length=1)
    options: GenerationOptions = GenerationOptions()


class RegenerateIn(BaseModel):
    options: GenerationOptions = GenerationOptions()


# ---- memory
class MemoryIn(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    kind: Literal["preference", "fact", "note"] = "note"
    project_id: str | None = None


class MemoryPatch(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=4000)
    kind: Literal["preference", "fact", "note"] | None = None
    enabled: bool | None = None


class MemoryOut(ORM):
    id: str
    kind: str
    content: str
    enabled: bool
    project_id: str | None = None
    created_at: datetime
    updated_at: datetime


# ---- admin
class AdminUserPatch(BaseModel):
    role: Literal["owner", "admin", "user"] | None = None
    is_active: bool | None = None


class AuditOut(ORM):
    id: int
    created_at: datetime
    user_id: str | None
    action: str
    target: str
    ip: str
    detail: dict
