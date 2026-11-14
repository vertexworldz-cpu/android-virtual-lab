import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="origin-test-"))
os.environ["ORIGIN_DATA_DIR"] = str(_TMP)
os.environ.setdefault("ORIGIN_DATABASE_URL", "")  # set to a PostgreSQL URL to run the suite against Postgres
os.environ["ORIGIN_MAX_UPLOAD_MB"] = "1"
os.environ["ORIGIN_GENERATION_RATE_LIMIT"] = "1000"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from origin_core.checkpoint import write_card  # noqa: E402
from origin_core.config import ModelConfig, TrainConfig  # noqa: E402
from origin_core.data import ChatDataset  # noqa: E402
from origin_core.tokenizer import Tokenizer  # noqa: E402
from origin_core.train import train  # noqa: E402

from origin_api.config import get_settings  # noqa: E402
from origin_api.db import Base, engine  # noqa: E402
from origin_api.engine import manager  # noqa: E402
from origin_api.main import app  # noqa: E402
from origin_api.routers.auth import auth_limiter  # noqa: E402

PASSWORD = "correct horse battery"


@pytest.fixture(scope="session", autouse=True)
def tiny_model():
    """A real model, trained from random weights during the test session, that maps ping -> pong."""
    pairs = [("ping", "pong"), ("red", "blue"), ("up", "down")]
    ex = [{"messages": [{"role": "user", "content": q}, {"role": "assistant", "content": a}]} for q, a in pairs]
    tok = Tokenizer.train([q + " " + a for q, a in pairs], vocab_size=280)
    cfg = ModelConfig(vocab_size=tok.vocab_size, block_size=48, n_layer=2, n_head=2, d_model=48)
    out = get_settings().checkpoints_path / "test-model"
    train(cfg, TrainConfig(out_dir=str(out), max_steps=150, batch_size=8, warmup_steps=10, learning_rate=3e-3,
                           eval_interval=150, eval_batches=2, device="cpu"), ChatDataset(tok, ex, ex, 48), tok)
    write_card(out, {"name": "test-model", "default_generation": {"temperature": 0.0, "max_new_tokens": 16},
                     "suggested_prompts": ["ping"]})
    return out


@pytest.fixture(autouse=True)
def clean_state():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    auth_limiter.reset()
    manager.set_active(None)
    yield


@pytest.fixture
def anon():
    with TestClient(app) as c:
        yield c


def make_user(email: str, name: str = "Test User") -> TestClient:
    c = TestClient(app)
    c.__enter__()
    r = c.post("/api/v1/auth/register", json={"email": email, "display_name": name, "password": PASSWORD})
    assert r.status_code == 201, r.text
    return c


@pytest.fixture
def owner():
    c = make_user("owner@example.com", "Owner")
    yield c
    c.__exit__(None, None, None)


@pytest.fixture
def member(owner):
    c = make_user("member@example.com", "Member")
    yield c
    c.__exit__(None, None, None)
