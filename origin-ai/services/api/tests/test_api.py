import json

from sqlalchemy import select

from origin_api.config import get_settings
from origin_api.db import SessionLocal
from origin_api.engine import manager
from origin_api.models import AuthSession, Message

from conftest import PASSWORD

API = "/api/v1"


def sse(response):
    """Parse an SSE body into [(event, data)]."""
    events = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.split("\n"))
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def new_chat(client) -> str:
    return client.post(f"{API}/conversations", json={}).json()["id"]


# ------------------------------------------------------------------- auth
def test_first_user_is_owner_then_users(anon, owner, member):
    assert owner.get(f"{API}/auth/me").json()["role"] == "owner"
    assert member.get(f"{API}/auth/me").json()["role"] == "user"
    assert anon.get(f"{API}/auth/status").json() == {"has_users": True, "registration_open": True}


def test_auth_required_and_validation(anon):
    assert anon.get(f"{API}/auth/me").status_code == 401
    assert anon.get(f"{API}/conversations").status_code == 401
    bad = anon.post(f"{API}/auth/register", json={"email": "a@b.co", "display_name": "A", "password": "short"})
    assert bad.status_code == 422
    bad = anon.post(f"{API}/auth/register", json={"email": "not-an-email", "display_name": "A", "password": PASSWORD})
    assert bad.status_code == 422


def test_login_logout_and_duplicates(anon, owner):
    assert anon.post(f"{API}/auth/register", json={"email": "OWNER@example.com", "display_name": "X",
                                                   "password": PASSWORD}).status_code == 409
    assert anon.post(f"{API}/auth/login", json={"email": "owner@example.com", "password": "wrong"}).status_code == 401
    assert anon.post(f"{API}/auth/login", json={"email": "nobody@example.com", "password": "wrong"}).status_code == 401
    r = anon.post(f"{API}/auth/login", json={"email": "owner@example.com", "password": PASSWORD})
    assert r.status_code == 200 and "httponly" in r.headers["set-cookie"].lower()
    assert anon.get(f"{API}/auth/me").status_code == 200
    assert anon.post(f"{API}/auth/logout").status_code == 204
    assert anon.get(f"{API}/auth/me").status_code == 401


def test_session_tokens_are_stored_hashed(owner):
    token = owner.cookies.get("origin_session")
    with SessionLocal() as db:
        hashes = db.scalars(select(AuthSession.token_hash)).all()
    assert token and token not in hashes and len(hashes[0]) == 64


def test_login_rate_limit(anon, owner):
    codes = [anon.post(f"{API}/auth/login", json={"email": "owner@example.com", "password": "x"}).status_code
             for _ in range(get_settings().auth_rate_limit + 1)]
    assert codes[-1] == 429 and 401 in codes


def test_cross_site_post_rejected(owner):
    r = owner.post(f"{API}/conversations", json={}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    assert owner.post(f"{API}/conversations", json={}, headers={"Origin": "http://localhost:3000"}).status_code == 201


def test_registration_can_be_closed(anon, owner, monkeypatch):
    monkeypatch.setattr(get_settings(), "allow_registration", False)
    r = anon.post(f"{API}/auth/register", json={"email": "x@example.com", "display_name": "X", "password": PASSWORD})
    assert r.status_code == 403


def test_profile_and_password_change(owner, anon):
    r = owner.patch(f"{API}/auth/me", json={"display_name": "New Name", "theme": "dark"})
    assert r.json()["display_name"] == "New Name" and r.json()["preferences"]["theme"] == "dark"
    assert owner.post(f"{API}/auth/password", json={"current_password": "nope", "new_password": "another long one"}).status_code == 400
    assert owner.post(f"{API}/auth/password", json={"current_password": PASSWORD, "new_password": "another long one"}).status_code == 204
    assert anon.post(f"{API}/auth/login", json={"email": "owner@example.com", "password": "another long one"}).status_code == 200


# ------------------------------------------------------------------- chat
def test_chat_streams_real_model_output_and_persists(owner):
    cid = new_chat(owner)
    r = owner.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = sse(r)
    kinds = [e for e, _ in events]
    assert kinds[0] == "user_message" and kinds[1] == "assistant_start" and kinds[-1] == "done"
    assert "".join(d["text"] for e, d in events if e == "delta") == "pong"
    final = events[-1][1]["message"]
    assert final["content"] == "pong" and final["status"] == "complete" and final["model"] == "test-model"
    assert final["usage"]["completion_tokens"] > 0 and final["usage"]["finish_reason"] == "stop"

    conv = owner.get(f"{API}/conversations/{cid}").json()
    assert conv["title"] == "ping"
    assert [(m["role"], m["content"]) for m in conv["messages"]] == [("user", "ping"), ("assistant", "pong")]


def test_chat_without_model_reports_unavailable_and_saves_nothing(owner, monkeypatch, tmp_path):
    monkeypatch.setattr(get_settings(), "checkpoints_dir", tmp_path)
    manager.set_active(None)
    cid = new_chat(owner)
    r = owner.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"})
    assert r.status_code == 503 and "checkpoint" in r.json()["detail"]
    assert owner.get(f"{API}/conversations/{cid}").json()["messages"] == []
    assert owner.get(f"{API}/models/active").json()["available"] is False


def test_regenerate_and_edit(owner):
    # The test model was trained on single-turn chats only, so exact answers are
    # asserted for single-turn prompts and structure for multi-turn ones.
    cid = new_chat(owner)
    owner.post(f"{API}/conversations/{cid}/messages", json={"content": "red"})
    events = sse(owner.post(f"{API}/conversations/{cid}/regenerate", json={}))
    assert events[0][0] == "assistant_start" and events[-1][1]["message"]["content"] == "blue"
    assert len(owner.get(f"{API}/conversations/{cid}").json()["messages"]) == 2

    owner.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"})
    msgs = owner.get(f"{API}/conversations/{cid}").json()["messages"]
    assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant"]
    assert msgs[3]["usage"]["prompt_tokens"] > msgs[1]["usage"]["prompt_tokens"]   # history is in the prompt

    events = sse(owner.post(f"{API}/conversations/{cid}/messages/{msgs[0]['id']}/edit", json={"content": "up"}))
    assert events[0][0] == "user_message" and events[-1][1]["message"]["content"] == "down"
    after = owner.get(f"{API}/conversations/{cid}").json()["messages"]
    assert [m["content"] for m in after] == ["up", "down"]             # later turns were discarded
    # editing an assistant message is not allowed
    assert owner.post(f"{API}/conversations/{cid}/messages/{after[1]['id']}/edit", json={"content": "x"}).status_code == 404


def test_oversized_prompt_is_reported_not_faked(owner):
    cid = new_chat(owner)
    events = sse(owner.post(f"{API}/conversations/{cid}/messages", json={"content": "word " * 400}))
    final = events[-1][1]["message"]
    assert final["status"] == "error" and "too long" in final["error"] and final["content"] == ""
    assert owner.post(f"{API}/conversations/{cid}/messages", json={"content": "   "}).status_code == 422


def test_conflict_while_streaming_and_restart_recovery(owner):
    from origin_api.routers.conversations import fail_interrupted_messages
    cid = new_chat(owner)
    with SessionLocal() as db:
        db.add(Message(conversation_id=cid, seq=0, role="assistant", status="streaming"))
        db.commit()
    assert owner.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"}).status_code == 409
    assert fail_interrupted_messages() == 1
    assert owner.get(f"{API}/conversations/{cid}").json()["messages"][0]["status"] == "error"


def test_conversation_crud_search_and_isolation(owner, member):
    cid = new_chat(owner)
    owner.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"})
    other = new_chat(owner)
    assert owner.patch(f"{API}/conversations/{other}", json={"title": "Budget 100%", "pinned": True}).json()["pinned"]
    listing = owner.get(f"{API}/conversations").json()
    assert [c["id"] for c in listing] == [other, cid]            # pinned first
    assert [c["id"] for c in owner.get(f"{API}/conversations", params={"q": "pong"}).json()] == [cid]  # message text
    assert [c["id"] for c in owner.get(f"{API}/conversations", params={"q": "100%"}).json()] == [other]
    assert owner.get(f"{API}/conversations", params={"q": "%"}).json()[0]["id"] == other and \
        len(owner.get(f"{API}/conversations", params={"q": "%"}).json()) == 1   # wildcard is escaped

    assert member.get(f"{API}/conversations").json() == []
    assert member.get(f"{API}/conversations/{cid}").status_code == 404
    assert member.post(f"{API}/conversations/{cid}/messages", json={"content": "ping"}).status_code == 404
    assert member.delete(f"{API}/conversations/{cid}").status_code == 404

    assert owner.delete(f"{API}/conversations/{cid}").status_code == 204
    assert owner.get(f"{API}/conversations/{cid}").status_code == 404
    with SessionLocal() as db:
        assert db.scalars(select(Message).where(Message.conversation_id == cid)).all() == []


# ------------------------------------------------------- projects / files
def test_projects(owner, member):
    p = owner.post(f"{API}/projects", json={"name": "Site", "description": "d"}).json()
    cid = owner.post(f"{API}/conversations", json={"project_id": p["id"]}).json()["id"]
    assert owner.get(f"{API}/projects").json()[0]["conversation_count"] == 1
    assert [c["id"] for c in owner.get(f"{API}/conversations", params={"project_id": p["id"]}).json()] == [cid]
    assert member.post(f"{API}/conversations", json={"project_id": p["id"]}).status_code == 404
    assert member.delete(f"{API}/projects/{p['id']}").status_code == 404
    assert owner.patch(f"{API}/projects/{p['id']}", json={"name": "Site 2"}).json()["name"] == "Site 2"
    assert owner.delete(f"{API}/projects/{p['id']}").status_code == 204
    assert owner.get(f"{API}/conversations/{cid}").json()["project_id"] is None   # chat survives


def test_files_and_attachments(owner, member):
    up = owner.post(f"{API}/files", files={"file": ("../../etc/notes.txt", b"ping", "text/plain")})
    assert up.status_code == 201
    f = up.json()
    assert f["filename"] == "notes.txt" and f["size"] == 4
    dl = owner.get(f"{API}/files/{f['id']}/download")
    assert dl.content == b"ping" and "attachment" in dl.headers["content-disposition"]
    assert member.get(f"{API}/files/{f['id']}/download").status_code == 404
    assert owner.post(f"{API}/files", files={"file": ("big.bin", b"x" * (1024 * 1024 + 1))}).status_code == 413
    assert owner.post(f"{API}/files", files={"file": ("empty.txt", b"")}).status_code == 400

    cid = new_chat(owner)
    img = owner.post(f"{API}/files", files={"file": ("pic.png", b"\x89PNG", "image/png")}).json()
    events = sse(owner.post(f"{API}/conversations/{cid}/messages",
                            json={"content": "ping", "attachment_ids": [img["id"]]}))
    assert events[0][1]["message"]["attachments"][0]["filename"] == "pic.png"
    assert events[-1][1]["message"]["usage"]["attachments_ignored"] == ["pic.png"]   # honest: model can't read images
    assert member.post(f"{API}/conversations/{new_chat(member)}/messages",
                       json={"content": "ping", "attachment_ids": [img["id"]]}).status_code == 404

    assert owner.delete(f"{API}/files/{f['id']}").status_code == 204
    assert owner.get(f"{API}/files/{f['id']}/download").status_code == 404
    assert len(owner.get(f"{API}/files").json()) == 1


def test_memory(owner, member):
    m = owner.post(f"{API}/memory", json={"content": "Prefers metric units", "kind": "preference"}).json()
    owner.post(f"{API}/memory", json={"content": "Works on Origin"})
    assert len(owner.get(f"{API}/memory").json()) == 2
    assert [x["id"] for x in owner.get(f"{API}/memory", params={"q": "metric"}).json()] == [m["id"]]
    assert owner.patch(f"{API}/memory/{m['id']}", json={"enabled": False}).json()["enabled"] is False
    assert member.get(f"{API}/memory").json() == []
    assert member.delete(f"{API}/memory/{m['id']}").status_code == 404
    assert owner.delete(f"{API}/memory").status_code == 204
    assert owner.get(f"{API}/memory").json() == []


# ------------------------------------------------ models / compute / admin
def test_models_registry_and_activation(owner, member):
    data = owner.get(f"{API}/models").json()
    assert data["active"] == "test-model" and data["models"][0]["card"]["name"] == "test-model"
    records = owner.get(f"{API}/models/test-model/metrics").json()["records"]
    assert records[0]["event"] == "start" and records[-1]["event"] == "done"
    assert owner.get(f"{API}/models/..%2F..%2Fetc/metrics").status_code == 404
    assert member.post(f"{API}/models/test-model/activate").status_code == 403
    assert owner.post(f"{API}/models/missing/activate").status_code == 400
    status = owner.post(f"{API}/models/test-model/activate").json()
    assert status["available"] and status["loaded"]


def test_compute_reports_real_local_hardware(owner):
    import psutil
    r = owner.get(f"{API}/compute/local").json()
    assert r["cpu"]["logical_cores"] == psutil.cpu_count() and r["memory"]["total_bytes"] == psutil.virtual_memory().total
    assert isinstance(r["gpus"], list)
    if not r["gpus"]:
        assert r["gpu_note"]


def test_admin_permissions_and_audit(owner, member):
    assert member.get(f"{API}/admin/users").status_code == 403
    users = owner.get(f"{API}/admin/users").json()
    owner_id = next(u["id"] for u in users if u["role"] == "owner")
    member_id = next(u["id"] for u in users if u["role"] == "user")
    assert owner.patch(f"{API}/admin/users/{owner_id}", json={"role": "user"}).status_code == 400      # last owner
    assert owner.patch(f"{API}/admin/users/{owner_id}", json={"is_active": False}).status_code == 400
    assert owner.patch(f"{API}/admin/users/{member_id}", json={"role": "admin"}).json()["role"] == "admin"
    assert member.patch(f"{API}/admin/users/{owner_id}", json={"role": "user"}).status_code == 403     # admin < owner
    assert member.patch(f"{API}/admin/users/{member_id}", json={"role": "owner"}).status_code == 403
    assert owner.patch(f"{API}/admin/users/{member_id}", json={"is_active": False}).json()["is_active"] is False
    assert member.get(f"{API}/auth/me").status_code == 401                                             # sessions revoked
    actions = [a["action"] for a in owner.get(f"{API}/admin/audit").json()]
    assert "admin.user_update" in actions and "auth.register" in actions
    assert owner.get(f"{API}/admin/overview").json()["users"] == 2


def test_health_and_module_status(anon):
    assert anon.get("/health").json()["database"] is True
    modules = {m["id"]: m["status"] for m in anon.get(f"{API}/system/status").json()["modules"]}
    assert modules["chat"] == "available" and modules["agents"] == "planned"


def test_cancelled_generation_is_stored_as_cancelled(owner):
    """Client disconnect sets the cancel event; the worker must persist a truthful 'cancelled' state."""
    import threading

    from origin_core.inference import GenerationParams
    from origin_api.routers.conversations import _worker

    cid = new_chat(owner)
    with SessionLocal() as db:
        msg = Message(conversation_id=cid, seq=0, role="assistant", status="streaming")
        db.add(msg)
        db.commit()
        mid = msg.id
    cancel = threading.Event()
    cancel.set()
    emitted = []
    _worker(manager.get(), [{"role": "user", "content": "ping"}], GenerationParams(max_new_tokens=8), mid, [],
            emitted.append, cancel)
    stored = owner.get(f"{API}/conversations/{cid}").json()["messages"][0]
    assert stored["status"] == "cancelled" and stored["usage"]["finish_reason"] == "cancelled"
    assert emitted[-1] is None and emitted[-2]["type"] == "done"
