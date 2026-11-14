"""Origin Chat: conversations, messages and streamed generation.

Streaming protocol (Server-Sent Events) for send / edit / regenerate:

    event: user_message     {message}            the stored user message (send/edit only)
    event: assistant_start  {message}            assistant message row, status=streaming
    event: delta            {text}               one piece of generated text
    event: done             {message}            final stored assistant message

Generation runs in a worker thread that owns persistence, so the result is
saved even if the client disconnects. A disconnect cancels generation and the
partial text is stored with status=cancelled.
"""

from __future__ import annotations

import asyncio
import json
import logging
import threading
import time
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from origin_core.inference import GenerationParams, GenerationStats, Generator

from ..config import get_settings
from ..db import SessionLocal, get_db
from ..deps import current_user
from ..engine import ModelUnavailable, manager
from ..models import Conversation, File, Memory, Message, User, now
from ..rate_limit import RateLimiter
from ..schemas import (ConversationDetail, ConversationIn, ConversationOut, ConversationPatch, EditMessageIn,
                       GenerationOptions, MessageOut, RegenerateIn, SendMessageIn)
from .files import storage
from .projects import get_project

log = logging.getLogger("origin.chat")
router = APIRouter(prefix="/conversations", tags=["conversations"])
generation_limiter = RateLimiter(get_settings().generation_rate_limit, 60)

TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".py", ".js", ".ts", ".tsx", ".html", ".css", ".yaml", ".yml",
                   ".toml", ".xml", ".sql", ".sh", ".log", ".ini", ".rs", ".go", ".java", ".c", ".cpp", ".h"}
MAX_ATTACHMENT_CHARS = 64_000


def get_conversation(db: Session, user: User, conversation_id: str, with_messages: bool = False) -> Conversation:
    stmt = select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    if with_messages:
        stmt = stmt.options(selectinload(Conversation.messages))
    conv = db.scalar(stmt)
    if conv is None:
        raise HTTPException(404, "Conversation not found")
    return conv


def _like(q: str) -> str:
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


# ------------------------------------------------------------------ CRUD
@router.get("", response_model=list[ConversationOut])
def list_conversations(q: str = "", project_id: str = "", limit: int = 50, offset: int = 0,
                       user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Conversation).where(Conversation.user_id == user.id)
    if project_id:
        stmt = stmt.where(Conversation.project_id == project_id)
    if q.strip():
        pattern = _like(q.strip())
        in_messages = select(Message.conversation_id).where(Message.content.ilike(pattern, escape="\\"))
        stmt = stmt.where(or_(Conversation.title.ilike(pattern, escape="\\"), Conversation.id.in_(in_messages)))
    stmt = stmt.order_by(Conversation.pinned.desc(), Conversation.updated_at.desc())
    return db.scalars(stmt.limit(min(max(limit, 1), 200)).offset(max(offset, 0))).all()


@router.post("", response_model=ConversationOut, status_code=201)
def create_conversation(body: ConversationIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if body.project_id:
        get_project(db, user, body.project_id)
    conv = Conversation(user_id=user.id, title=(body.title or "New chat").strip() or "New chat",
                        project_id=body.project_id)
    db.add(conv)
    db.commit()
    return conv


@router.get("/{conversation_id}", response_model=ConversationDetail)
def read_conversation(conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_conversation(db, user, conversation_id, with_messages=True)


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(conversation_id: str, body: ConversationPatch, user: User = Depends(current_user),
                        db: Session = Depends(get_db)):
    conv = get_conversation(db, user, conversation_id)
    if body.title is not None:
        conv.title = body.title.strip()
    if body.pinned is not None:
        conv.pinned = body.pinned
    if body.clear_project:
        conv.project_id = None
    elif body.project_id is not None:
        get_project(db, user, body.project_id)
        conv.project_id = body.project_id
    db.commit()
    return conv


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(get_conversation(db, user, conversation_id, with_messages=True))
    db.commit()


# ------------------------------------------------------------ generation
def _is_text_file(f: File) -> bool:
    return f.content_type.startswith("text/") or PurePosixPath(f.filename).suffix.lower() in TEXT_EXTENSIONS


def _build_prompt(db: Session, conv: Conversation, user: User, gen: Generator) -> tuple[list[dict], list[str]]:
    """Conversation history -> model messages. Returns (messages, ignored_attachment_names)."""
    prompt: list[dict] = []
    ignored: list[str] = []
    if gen.card.get("supports_system_prompt"):
        memories = db.scalars(select(Memory).where(Memory.user_id == user.id, Memory.enabled).where(
            or_(Memory.project_id.is_(None), Memory.project_id == conv.project_id))).all()
        if memories:
            prompt.append({"role": "system", "content": "Known about the user:\n" + "\n".join(
                f"- {m.content}" for m in memories)})
    for m in conv.messages:
        if m.role == "assistant" and (m.status not in ("complete", "cancelled") or not m.content):
            continue
        content = m.content
        for f in m.attachments:
            if _is_text_file(f):
                try:
                    text = storage().read_text(f.storage_key, MAX_ATTACHMENT_CHARS)
                    content += f"\n\n[Attached file: {f.filename}]\n{text}"
                    continue
                except OSError:
                    pass
            ignored.append(f.filename)
        prompt.append({"role": m.role, "content": content})
    return prompt, ignored


def _params(gen: Generator, options: GenerationOptions) -> GenerationParams:
    defaults = gen.card.get("default_generation", {})
    return GenerationParams(
        max_new_tokens=options.max_new_tokens or defaults.get("max_new_tokens", 256),
        temperature=options.temperature if options.temperature is not None else defaults.get("temperature", 0.7),
        top_k=defaults.get("top_k", 50), top_p=defaults.get("top_p", 0.95))


def _worker(gen: Generator, prompt: list[dict], params: GenerationParams, assistant_id: str,
            ignored: list[str], emit, cancel: threading.Event) -> None:
    stats, parts = GenerationStats(), []
    status, error, t0 = "complete", None, time.monotonic()
    try:
        for piece in gen.stream(prompt, params, stats, cancel):
            parts.append(piece)
            emit({"type": "delta", "text": piece})
        if stats.finish_reason == "cancelled":
            status = "cancelled"
    except ValueError as exc:   # e.g. prompt does not fit the model's context
        status, error = "error", str(exc)
    except Exception as exc:
        log.exception("generation failed")
        status, error = "error", f"Generation failed: {type(exc).__name__}"
    final = None
    try:
        with SessionLocal() as db:
            msg = db.get(Message, assistant_id)
            if msg is not None:
                msg.content, msg.status, msg.error = "".join(parts), status, error
                msg.usage = {"prompt_tokens": stats.prompt_tokens, "completion_tokens": stats.completion_tokens,
                             "finish_reason": stats.finish_reason if status != "error" else "error",
                             "seconds": round(time.monotonic() - t0, 3),
                             "dropped_messages": stats.dropped_messages, "attachments_ignored": ignored}
                msg.conversation.updated_at = now()
                db.commit()
                final = MessageOut.model_validate(msg).model_dump(mode="json")
    except Exception:
        log.exception("failed to persist assistant message")
    emit({"type": "done", "message": final})
    emit(None)


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _acquire_model(user: User) -> Generator:
    if not generation_limiter.hit(user.id):
        raise HTTPException(429, "You are sending messages too quickly. Wait a moment and try again.")
    try:
        return manager.get()
    except ModelUnavailable as exc:
        raise HTTPException(503, str(exc))


def _ensure_idle(conv: Conversation) -> None:
    if any(m.status == "streaming" for m in conv.messages):
        raise HTTPException(409, "A response is already being generated in this conversation")


def _next_seq(conv: Conversation) -> int:
    return (conv.messages[-1].seq + 1) if conv.messages else 0


def _stream_response(db: Session, conv: Conversation, user: User, gen: Generator, options: GenerationOptions,
                     user_message: Message | None) -> StreamingResponse:
    prompt, ignored = _build_prompt(db, conv, user, gen)
    assistant = Message(conversation_id=conv.id, seq=_next_seq(conv), role="assistant", content="",
                        status="streaming", model=gen.card.get("name") or manager.active)
    conv.messages.append(assistant)
    conv.updated_at = now()
    db.commit()
    first_events = []
    if user_message is not None:
        first_events.append(_sse("user_message", {"message": MessageOut.model_validate(user_message).model_dump(mode="json")}))
    first_events.append(_sse("assistant_start", {"message": MessageOut.model_validate(assistant).model_dump(mode="json")}))
    params, assistant_id = _params(gen, options), assistant.id

    async def events():
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        cancel = threading.Event()

        def emit(item) -> None:
            try:
                loop.call_soon_threadsafe(queue.put_nowait, item)
            except RuntimeError:   # loop already closed; the worker still persists the result
                pass

        threading.Thread(target=_worker, args=(gen, prompt, params, assistant_id, ignored, emit, cancel),
                         daemon=True, name="origin-generate").start()
        try:
            for ev in first_events:
                yield ev
            while True:
                item = await queue.get()
                if item is None:
                    break
                yield _sse(item.pop("type"), item)
        finally:
            cancel.set()   # client went away (or we finished): stop generating

    return StreamingResponse(events(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


def _check_length(content: str) -> str:
    limit = get_settings().max_message_chars
    if len(content) > limit:
        raise HTTPException(413, f"Message is longer than the {limit:,} character limit")
    if not content.strip():
        raise HTTPException(422, "Message is empty")
    return content


@router.post("/{conversation_id}/messages")
def send_message(conversation_id: str, body: SendMessageIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    content = _check_length(body.content)
    conv = get_conversation(db, user, conversation_id, with_messages=True)
    _ensure_idle(conv)
    files = []
    for fid in dict.fromkeys(body.attachment_ids):
        f = db.get(File, fid)
        if f is None or f.user_id != user.id:
            raise HTTPException(404, "Attachment not found")
        files.append(f)
    gen = _acquire_model(user)
    msg = Message(conversation_id=conv.id, seq=_next_seq(conv), role="user", content=content, attachments=files)
    conv.messages.append(msg)
    if conv.title == "New chat":
        first_line = content.strip().splitlines()[0]
        conv.title = first_line[:60] + ("…" if len(first_line) > 60 else "")
    db.flush()
    return _stream_response(db, conv, user, gen, body.options, msg)


@router.post("/{conversation_id}/messages/{message_id}/edit")
def edit_message(conversation_id: str, message_id: str, body: EditMessageIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    """Replace a user message, discard everything after it, and generate a new reply."""
    content = _check_length(body.content)
    conv = get_conversation(db, user, conversation_id, with_messages=True)
    _ensure_idle(conv)
    target = next((m for m in conv.messages if m.id == message_id), None)
    if target is None or target.role != "user":
        raise HTTPException(404, "User message not found")
    gen = _acquire_model(user)
    target.content = content
    for m in [m for m in conv.messages if m.seq > target.seq]:
        conv.messages.remove(m)
    db.flush()
    return _stream_response(db, conv, user, gen, body.options, target)


@router.post("/{conversation_id}/regenerate")
def regenerate(conversation_id: str, body: RegenerateIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Discard the last assistant reply and generate a new one."""
    conv = get_conversation(db, user, conversation_id, with_messages=True)
    _ensure_idle(conv)
    if not conv.messages:
        raise HTTPException(400, "Nothing to regenerate")
    gen = _acquire_model(user)
    if conv.messages[-1].role == "assistant":
        conv.messages.remove(conv.messages[-1])
    if not conv.messages or conv.messages[-1].role != "user":
        raise HTTPException(400, "Nothing to regenerate")
    db.flush()
    return _stream_response(db, conv, user, gen, body.options, None)


def fail_interrupted_messages() -> int:
    """On startup: any message still marked streaming was cut off by a restart."""
    with SessionLocal() as db:
        rows = db.scalars(select(Message).where(Message.status == "streaming")).all()
        for m in rows:
            m.status, m.error = "error", "Interrupted: the server restarted during generation."
        db.commit()
        return len(rows)
