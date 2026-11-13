"""Runtime configuration. Every value can be set with an ORIGIN_* environment
variable or in a .env file; defaults give a zero-setup local install."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ORIGIN_", env_file=".env", extra="ignore")

    env: str = "development"                      # development | production
    data_dir: Path = REPO_ROOT / "data"
    # SQLite by default so the platform runs with no services; set to
    # postgresql+psycopg://user:pass@host/db for PostgreSQL.
    database_url: str = ""
    checkpoints_dir: Path | None = None
    uploads_dir: Path | None = None

    allowed_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    allow_registration: bool = True               # first account always allowed (becomes owner)
    session_ttl_days: int = 30
    cookie_secure: bool = False                   # set True behind HTTPS
    max_upload_mb: int = 25
    max_message_chars: int = 32_000

    auth_rate_limit: int = 10                     # attempts per window per IP
    auth_rate_window_seconds: int = 300
    generation_rate_limit: int = 30               # generations per minute per user

    inference_device: str = "auto"

    @property
    def db_url(self) -> str:
        return self.database_url or f"sqlite:///{self.data_dir / 'origin.db'}"

    @property
    def checkpoints_path(self) -> Path:
        return self.checkpoints_dir or self.data_dir / "checkpoints"

    @property
    def uploads_path(self) -> Path:
        return self.uploads_dir or self.data_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.data_dir.mkdir(parents=True, exist_ok=True)
    s.checkpoints_path.mkdir(parents=True, exist_ok=True)
    s.uploads_path.mkdir(parents=True, exist_ok=True)
    return s
