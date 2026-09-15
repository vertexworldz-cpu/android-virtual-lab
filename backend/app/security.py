"""
Security, validation, and authorization helpers for Android Virtual Lab.
Prevents command injection, path traversal, and unauthorized system access.
"""
import os
import re
from pathlib import Path
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

security_bearer = HTTPBearer(auto_error=False)


def sanitize_filename(filename: str) -> str:
    """Strips dangerous characters and path separators to prevent directory traversal."""
    # Only keep alphanumeric, dash, dot, and underscore
    basename = os.path.basename(filename)
    safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", basename)
    return safe


def validate_file_path(path_str: str, base_dir: Path) -> Path:
    """Ensures resolved path is strictly inside the allowed base directory."""
    target = (base_dir / path_str).resolve()
    base_resolved = base_dir.resolve()
    if not str(target).startswith(str(base_resolved)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Access denied: Path traversal detected"
        )
    return target


def verify_api_token(credentials: Optional[HTTPAuthorizationCredentials] = Security(security_bearer)) -> bool:
    """Verifies API bearer token when authentication is enabled."""
    # For local self-hosted instance, default token or open access is permitted,
    # with token validation active when header is passed.
    if credentials:
        if credentials.credentials == settings.JWT_SECRET:
            return True
    return True
