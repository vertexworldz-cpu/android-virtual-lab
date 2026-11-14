from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from . import __version__
from .config import get_settings
from .db import SessionLocal, engine, init_db
from .engine import ModelUnavailable, manager
from .models import SystemSetting
from .routers import admin, auth, compute, conversations, files, memory, models, projects

log = logging.getLogger("origin")

# What exists today. The UI renders this list verbatim, so it must stay true.
MODULES = [
    {"id": "chat", "name": "Origin Chat", "status": "available", "phase": 2},
    {"id": "core", "name": "Origin Core", "status": "available", "phase": 3,
     "note": "Tokenizer, transformer, training, evaluation and inference. Current checkpoint is a narrow bootstrap model."},
    {"id": "storage", "name": "Origin Storage", "status": "partial", "phase": 1, "note": "Local file storage. S3 backend and versioning not built."},
    {"id": "memory", "name": "Origin Memory", "status": "partial", "phase": 6, "note": "Saved memories with search. Vector retrieval not built."},
    {"id": "gpu", "name": "Origin GPU", "status": "partial", "phase": 5, "note": "Local compute discovery. Cloud adapters and scheduling not built."},
    {"id": "lab", "name": "Origin Lab", "status": "partial", "phase": 5, "note": "Model registry and training metrics. Training is launched from the CLI."},
    {"id": "admin", "name": "Origin Admin", "status": "partial", "phase": 1, "note": "Users, roles, audit log."},
    {"id": "agents", "name": "Origin Agents", "status": "planned", "phase": 4},
    {"id": "code", "name": "Origin Code", "status": "planned", "phase": 6},
    {"id": "research", "name": "Origin Research", "status": "planned", "phase": 6},
    {"id": "create", "name": "Origin Create", "status": "planned", "phase": 6},
    {"id": "deploy", "name": "Origin Deploy", "status": "planned", "phase": 5},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    interrupted = conversations.fail_interrupted_messages()
    if interrupted:
        log.warning("marked %d interrupted message(s) as failed", interrupted)
    with SessionLocal() as db:
        saved = db.get(SystemSetting, "active_model")
    try:
        manager.set_active(saved.value.get("name") if saved else None)
    except ModelUnavailable:
        manager.set_active(None)
    manager.ensure_default()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    docs = settings.env != "production"
    app = FastAPI(title="Origin AI API", version=__version__, lifespan=lifespan,
                  docs_url="/api/docs" if docs else None, openapi_url="/api/openapi.json" if docs else None,
                  redoc_url=None)
    app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"])

    @app.middleware("http")
    async def guard(request: Request, call_next):
        # CSRF defence in depth (on top of SameSite=Lax cookies): browsers send
        # Origin on cross-site state-changing requests; reject unknown origins.
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin not in settings.allowed_origins:
                return JSONResponse({"detail": "Origin not allowed"}, status_code=403)
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "same-origin")
        return response

    for r in (auth, conversations, projects, files, memory, models, compute, admin):
        app.include_router(r.router, prefix="/api/v1")

    @app.get("/api/v1/system/status", tags=["system"])
    def system_status() -> dict:
        return {"version": __version__, "modules": MODULES}

    @app.get("/health", tags=["system"])
    def health() -> JSONResponse:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            db_ok = True
        except Exception:
            db_ok = False
        status = manager.status()
        body = {"status": "ok" if db_ok else "degraded", "database": db_ok,
                "model": {"available": status["available"], "name": status["name"]}}
        return JSONResponse(body, status_code=200 if db_ok else 503)

    return app


app = create_app()
