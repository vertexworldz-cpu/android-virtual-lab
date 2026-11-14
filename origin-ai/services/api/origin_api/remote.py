"""External model servers that speak the OpenAI-compatible chat API.

Used to run an open-weights model (Llama, Qwen, Mistral, ...) on hardware the
owner controls, through a local server such as Ollama, llama.cpp or vLLM. The
server's address is configured by an administrator; nothing is called unless
the administrator adds it and selects it.
"""

from __future__ import annotations

import ipaddress
import socket
from typing import Iterator
from urllib.parse import urlsplit

import httpx

from origin_core.inference import GenerationParams, GenerationStats


class GenerationError(ValueError):
    """A failure whose message is safe and useful to show the user."""


def validate_base_url(url: str) -> str:
    """Normalise and sanity-check a server URL (e.g. http://localhost:11434/v1).

    Local and private addresses are allowed on purpose (that is the use case);
    link-local ranges, which cloud metadata services live on, are not."""
    parts = urlsplit(url.strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("Enter a full http:// or https:// address, e.g. http://localhost:11434/v1")
    if parts.username or parts.password:
        raise ValueError("Do not put credentials in the address")
    try:
        infos = socket.getaddrinfo(parts.hostname, parts.port or (443 if parts.scheme == "https" else 80))
    except socket.gaierror:
        raise ValueError(f"Cannot resolve host '{parts.hostname}'")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_link_local or ip.is_unspecified or ip.is_multicast:
            raise ValueError("That address range is not allowed")
    return url.strip().rstrip("/")


def _client(read_timeout: float = 120) -> httpx.Client:
    return httpx.Client(timeout=httpx.Timeout(connect=5, read=read_timeout, write=10, pool=5))


def list_remote_models(base_url: str) -> list[str]:
    """Ask the server which models it offers. Raises GenerationError with a clear reason."""
    try:
        with _client(15) as c:
            r = c.get(f"{base_url}/models")
    except httpx.ConnectError:
        raise GenerationError("Cannot connect. Is the model server running at that address?")
    except httpx.TimeoutException:
        raise GenerationError("The server did not respond in time.")
    except httpx.HTTPError as exc:
        raise GenerationError(f"Request failed: {type(exc).__name__}")
    if r.status_code != 200:
        raise GenerationError(f"The server answered HTTP {r.status_code}. Check the address ends in /v1.")
    try:
        return [m["id"] for m in r.json().get("data", [])]
    except (ValueError, KeyError, TypeError, AttributeError):
        raise GenerationError("The server's reply was not in the expected format.")


class RemoteGenerator:
    """Same interface as origin_core.inference.Generator, backed by a remote server."""

    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.base_url = cfg["base_url"]
        self.model = cfg["model"]
        self.block_size = 1 << 30   # the server enforces its own context limit
        self.card = {
            "name": cfg["name"], "kind": "external", "remote_model": cfg["model"],
            "supports_system_prompt": True,
            "default_generation": {"temperature": 0.7, "max_new_tokens": 1024},
        }

    def stream(self, messages: list[dict], params: GenerationParams | None = None,
               stats: GenerationStats | None = None, cancel=None) -> Iterator[str]:
        import json
        p = params or GenerationParams()
        stats = stats if stats is not None else GenerationStats()
        payload = {"model": self.model, "messages": messages, "stream": True, "temperature": p.temperature,
                   "max_tokens": p.max_new_tokens, "stream_options": {"include_usage": True}}
        stats.finish_reason = "stop"
        try:
            with _client() as c, c.stream("POST", f"{self.base_url}/chat/completions", json=payload) as r:
                if r.status_code != 200:
                    body = r.read().decode("utf-8", "replace")[:300]
                    raise GenerationError(f"The model server returned HTTP {r.status_code}: {body}")
                for line in r.iter_lines():
                    if cancel is not None and cancel.is_set():
                        stats.finish_reason = "cancelled"
                        return
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        obj = json.loads(data)
                    except ValueError:
                        continue
                    if "error" in obj:
                        raise GenerationError(f"The model server reported an error: {str(obj['error'])[:300]}")
                    if obj.get("usage"):
                        stats.prompt_tokens = obj["usage"].get("prompt_tokens", stats.prompt_tokens)
                        stats.completion_tokens = obj["usage"].get("completion_tokens", stats.completion_tokens)
                    for choice in obj.get("choices", []):
                        piece = (choice.get("delta") or {}).get("content")
                        if piece:
                            if not obj.get("usage"):
                                stats.completion_tokens += 1   # approximation until the server reports usage
                            yield piece
                        if choice.get("finish_reason") == "length":
                            stats.finish_reason = "length"
        except httpx.ConnectError:
            raise GenerationError(f"Cannot reach the model server at {self.base_url}. Is it running?")
        except httpx.TimeoutException:
            raise GenerationError("The model server did not respond in time.")
        except httpx.HTTPError as exc:
            raise GenerationError(f"Connection to the model server failed: {type(exc).__name__}")
