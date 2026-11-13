from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets

# Argon2id is preferred. Where it cannot be installed (e.g. Termux/Android has
# no build for argon2-cffi-bindings) we fall back to scrypt from the standard
# library, which is also a memory-hard password hash. Hashes carry a prefix so
# either kind verifies regardless of which library is present.
try:
    from argon2 import PasswordHasher
    from argon2.exceptions import InvalidHashError, VerificationError
    _argon2: PasswordHasher | None = PasswordHasher()
except ImportError:  # pragma: no cover - exercised via test that disables it
    _argon2 = None

_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2**15, 8, 1


def _scrypt(password: str, salt: bytes) -> bytes:
    return hashlib.scrypt(password.encode(), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P,
                          maxmem=128 * 1024 * 1024, dklen=32)


def hash_password(password: str) -> str:
    if _argon2 is not None:
        return _argon2.hash(password)
    salt = os.urandom(16)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(_scrypt(password, salt)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    if password_hash.startswith("scrypt$"):
        try:
            _, salt_b64, digest_b64 = password_hash.split("$")
            return hmac.compare_digest(_scrypt(password, base64.b64decode(salt_b64)), base64.b64decode(digest_b64))
        except ValueError:
            return False
    if _argon2 is None:
        return False  # an argon2 hash exists but the library is not installed
    try:
        return _argon2.verify(password_hash, password)
    except (VerificationError, InvalidHashError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
