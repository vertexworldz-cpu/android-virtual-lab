"""External open-model servers (Ollama-style, OpenAI-compatible), tested against a local fake server."""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import pytest

from origin_api.engine import manager

from conftest import make_user  # noqa: F401  (fixtures come from conftest)
from test_api import API, new_chat, sse


class FakeLLM(BaseHTTPRequestHandler):
    requests: list = []
    mode = "ok"

    def log_message(self, *a):
        pass

    def do_GET(self):
        body = json.dumps({"data": [{"id": "llama3.2:3b"}, {"id": "qwen2.5:7b"}]}).encode()
        self.send_response(200 if self.path == "/v1/models" else 404)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        FakeLLM.requests.append(payload)
        if FakeLLM.mode == "http500":
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b"model crashed")
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        for piece in ["Hello", " from", " Llama"]:
            chunk = {"choices": [{"delta": {"content": piece}}]}
            self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode())
        self.wfile.write(b'data: {"choices": [{"delta": {}, "finish_reason": "stop"}], '
                         b'"usage": {"prompt_tokens": 7, "completion_tokens": 3}}\n\n')
        self.wfile.write(b"data: [DONE]\n\n")


@pytest.fixture
def llm():
    FakeLLM.requests, FakeLLM.mode = [], "ok"
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeLLM)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{server.server_port}/v1"
    server.shutdown()


def add(owner, url, model="llama3.2:3b"):
    r = owner.post(f"{API}/models/backends", json={"name": "Local Llama", "base_url": url, "model": model})
    assert r.status_code == 201, r.text
    return r.json()


def test_backend_admin_only_and_url_validation(owner, member, llm):
    body = {"name": "x", "base_url": llm, "model": "m"}
    assert member.post(f"{API}/models/backends", json=body).status_code == 403
    assert member.get(f"{API}/models/backends").status_code == 403
    for bad in ["file:///etc/passwd", "ftp://localhost/v1", "http://user:pw@localhost/v1",
                "http://169.254.169.254/latest", "not a url", "http://no-such-host.invalid/v1"]:
        assert owner.post(f"{API}/models/backends", json={**body, "base_url": bad}).status_code == 422, bad
    b = add(owner, llm + "/")
    assert b["base_url"] == llm
    assert owner.get(f"{API}/models/backends").json()[0]["id"] == b["id"]


def test_connection_test(owner, llm):
    b = add(owner, llm)
    t = owner.post(f"{API}/models/backends/{b['id']}/test").json()
    assert t["ok"] and "qwen2.5:7b" in t["models"] and t["model_available"]
    missing = add(owner, llm, model="not-installed:1b")
    t = owner.post(f"{API}/models/backends/{missing['id']}/test").json()
    assert t["ok"] and not t["model_available"] and "not-installed" in t["error"]
    down = add(owner, "http://127.0.0.1:9/v1")
    t = owner.post(f"{API}/models/backends/{down['id']}/test").json()
    assert t["ok"] is False and "Cannot connect" in t["error"]


def test_chat_through_external_model_with_history_and_memory(owner, llm):
    b = add(owner, llm)
    owner.post(f"{API}/memory", json={"content": "Prefers metric units"})
    assert owner.post(f"{API}/models/ext:{b['id']}/activate").json()["kind"] == "external"
    cid = new_chat(owner)
    events = sse(owner.post(f"{API}/conversations/{cid}/messages", json={"content": "Hi there"}))
    final = events[-1][1]["message"]
    assert final["content"] == "Hello from Llama" and final["status"] == "complete"
    assert final["model"] == "Local Llama" and final["usage"]["completion_tokens"] == 3
    sent = FakeLLM.requests[-1]
    assert sent["model"] == "llama3.2:3b" and sent["stream"] is True
    assert sent["messages"][0]["role"] == "system" and "metric units" in sent["messages"][0]["content"]
    assert sent["messages"][-1] == {"role": "user", "content": "Hi there"}
    # second turn carries the history
    sse(owner.post(f"{API}/conversations/{cid}/messages", json={"content": "And again"}))
    roles = [m["role"] for m in FakeLLM.requests[-1]["messages"]]
    assert roles == ["system", "user", "assistant", "user"]
    assert owner.get(f"{API}/models/active").json()["display_name"] == "Local Llama"


def test_server_errors_are_reported_not_hidden(owner, llm):
    b = add(owner, llm)
    owner.post(f"{API}/models/ext:{b['id']}/activate")
    FakeLLM.mode = "http500"
    cid = new_chat(owner)
    final = sse(owner.post(f"{API}/conversations/{cid}/messages", json={"content": "hi"}))[-1][1]["message"]
    assert final["status"] == "error" and "HTTP 500" in final["error"] and "model crashed" in final["error"]

    down = add(owner, "http://127.0.0.1:9/v1")
    owner.post(f"{API}/models/ext:{down['id']}/activate")
    final = sse(owner.post(f"{API}/conversations/{new_chat(owner)}/messages", json={"content": "hi"}))[-1][1]["message"]
    assert final["status"] == "error" and "Cannot reach the model server" in final["error"] and final["content"] == ""


def test_delete_active_backend_falls_back_to_origin_model(owner, llm):
    b = add(owner, llm)
    owner.post(f"{API}/models/ext:{b['id']}/activate")
    assert manager.active == f"ext:{b['id']}"
    assert owner.delete(f"{API}/models/backends/{b['id']}").status_code == 204
    assert owner.get(f"{API}/models/active").json()["name"] == "test-model"
    assert owner.delete(f"{API}/models/backends/{b['id']}").status_code == 404
    assert owner.post(f"{API}/models/ext:gone/activate").status_code == 400
