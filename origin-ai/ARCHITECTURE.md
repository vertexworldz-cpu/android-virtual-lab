# Origin AI — Architecture

> Your AI. Your Control. — Think. Create. Execute.

This document describes the system as designed. Where something is designed
but not yet built it is marked **(planned)**. `DEVELOPMENT_STATUS.md` is the
source of truth for what works today.

## 1. Principles

1. **Independence.** Runtime intelligence comes only from Origin models
   trained in this repository from random weights. No hosted AI API and no
   third-party model weights are used at runtime. Conventional libraries
   (PyTorch, FastAPI, Next.js) are tools, not intelligence.
2. **Honesty.** The platform never fabricates an answer, a metric, a GPU or a
   completed task. If there is no model, chat says so. Every number in the UI
   is measured.
3. **Local first.** One machine, no services, must be a complete install
   (SQLite + local disk + CPU). PostgreSQL, Redis, S3 and cloud GPUs are
   optional upgrades behind interfaces.
4. **Modular.** Frontend, API, model core, agents and compute are separate
   packages with explicit contracts, so each can be scaled or replaced.

## 2. System overview

```
 Browser ──HTTPS──▶ apps/web (Next.js)
                      │  /api/* proxied (same origin, httpOnly cookie)
                      ▼
                 services/api (FastAPI)
        ┌─────────────┼───────────────────────────────┐
        ▼             ▼                               ▼
   SQL database   Storage backend               ModelManager
   SQLite | PG    local disk | S3 (planned)     └─ origin_core.Generator
   (+pgvector,                                     (in-process, PyTorch)
    planned)                                          ▲
                                                      │ checkpoint directory
                       core/ (origin_core) ───────────┘
                       tokenizer · model · data · train · evaluate
```

Planned additions: an agent runtime (`services/agents`), a job runner for
training (`services/runner`) driven through compute provider adapters, and a
standalone inference server once models outgrow in-process serving.

## 3. Repository layout

```
origin-ai/
├── core/                    Origin Core — the model stack (Python package origin_core)
│   ├── origin_core/
│   │   ├── tokenizer.py     byte-level BPE, written from scratch
│   │   ├── model.py         decoder-only transformer (RoPE, RMSNorm, SwiGLU, KV cache)
│   │   ├── config.py        ModelConfig, TrainConfig, size presets nano → large
│   │   ├── chat_format.py   chat template, loss mask, context fitting
│   │   ├── data.py          PackedDataset (pretraining), ChatDataset (instruction tuning)
│   │   ├── train.py         training loop, schedule, checkpoints, metrics.jsonl
│   │   ├── evaluate.py      held-out loss, exact-match benchmark
│   │   ├── inference.py     streaming generation, sampling, cancellation
│   │   ├── checkpoint.py    checkpoint directory format, model card
│   │   ├── datasets/        dataset builders (bootstrap)
│   │   └── cli.py           `origin-core` command
│   └── tests/
├── services/api/            Platform API (Python package origin_api)
│   ├── origin_api/
│   │   ├── main.py          app factory, middleware, module status
│   │   ├── config.py        ORIGIN_* settings
│   │   ├── db.py models.py  SQLAlchemy engine and schema
│   │   ├── schemas.py       request/response contracts (Pydantic)
│   │   ├── deps.py security.py rate_limit.py   auth, RBAC, audit, hashing, limits
│   │   ├── storage.py       Storage protocol + LocalStorage
│   │   ├── engine.py        model registry + inference manager
│   │   └── routers/         auth, conversations, projects, files, memory, models, compute, admin
│   └── tests/
├── apps/web/                Web app (Next.js, React, TypeScript, Tailwind)
│   ├── app/(auth)/          sign-in, owner setup
│   ├── app/(app)/           authenticated shell and all module pages
│   ├── components/          design-system primitives and chat components
│   ├── lib/                 typed API client, SSE reader, auth context, hooks
│   └── e2e/smoke.mjs        browser end-to-end test
├── data/                    runtime data (git-ignored): database, uploads, checkpoints
├── docker-compose.yml       optional PostgreSQL/pgvector, Redis, MinIO
└── Makefile
```

## 4. Modules and boundaries

| Module | Owns | Talks to | State |
|---|---|---|---|
| **Origin Core** | tokenizer, model, training, eval, inference | filesystem only | built |
| **Origin Chat** | conversations, messages, streaming | Core (via ModelManager), Storage, Memory | built |
| **Origin Storage** | files, later datasets/weights/versions | Storage backend | local backend built |
| **Origin Memory** | user/project memories, later retrieval | DB (pgvector planned) | CRUD + search built |
| **Origin GPU** | compute discovery, provider adapters, jobs | local OS, provider APIs | local discovery built |
| **Origin Lab** | datasets, training jobs, experiments | Core, GPU, Storage | registry + metrics built; job launch is CLI |
| **Origin Admin** | users, roles, audit, health | DB | built (basic) |
| **Origin Agents** | tools, planning, approvals, verification | Core, sandbox | planned (phase 4) |
| **Origin Code** | editor, terminal, sandboxed execution | sandbox runtime | planned (phase 6) |
| **Origin Research** | sources, indexing, reports | Memory, Storage | planned (phase 6) |
| **Origin Create** | image/audio/video generators | specialised models | planned (phase 6) |
| **Origin Deploy** | endpoints, API keys, usage | Core | planned (phase 5) |

Rules: the web app only calls the HTTP API. The API never imports training
code paths at request time except `origin_core.inference`. Core has no
knowledge of the API or database.

## 5. Origin Core

**Tokenizer.** Byte-level BPE. Lossless for any UTF-8. Pre-tokenisation keeps
every digit as its own token (predictable numbers, learnable arithmetic).
Control tokens (`<|user|>`, `<|assistant|>`, `<|end|>`, `<|tool_call|>` …)
have reserved ids and cannot be produced from user text.

**Model.** Decoder-only transformer, pre-norm, RMSNorm, rotary position
embeddings, SwiGLU MLP, tied embeddings, scaled residual init. One
architecture across the size ladder:

| Preset | Layers × width | Context | ≈ Params | Realistic hardware |
|---|---|---|---|---|
| nano | 4 × 192 | 256 | 2 M | CPU, minutes |
| micro | 6 × 384 | 512 | 15 M | CPU hours / any GPU |
| small | 8 × 640 | 1024 | 50 M | one 8–12 GB GPU |
| base | 12 × 768 | 2048 | 125 M | one 24 GB GPU, days |
| medium | 24 × 1024 | 2048 | 350 M | multi-GPU / cloud |
| large | 32 × 1728 | 4096 | 1.3 B | GPU cluster, weeks |

**Training.** AdamW, warmup + cosine decay, gradient clipping, bf16 autocast
on CUDA, periodic held-out evaluation, atomic checkpoints, resume. Two data
paths: packed token streams (pretraining) and masked chat examples
(instruction tuning; loss only on assistant tokens).

**Checkpoint = directory**: `model.pt`, `tokenizer.json`, `model_card.json`
(size, data, measured metrics, capabilities, limitations), `metrics.jsonl`.
Loaded with `weights_only=True`.

**Inference.** KV-cached streaming generation, greedy/temperature/top-k/top-p,
cooperative cancellation, context fitting that drops oldest turns and reports
how many were dropped.

### Honest training strategy

A useful general assistant needs (a) billions of tokens of licensed text and
(b) GPU-weeks. Neither exists on a 4-core CPU box. The staged plan:

1. **Bootstrap (done):** nano model on generated arithmetic chat — proves
   tokenizer → training → eval → serving → UI with checkable answers.
2. **Language pretraining:** micro/small on an openly licensed corpus
   (e.g. TinyStories, Wikipedia, permissively licensed code). Needs a GPU.
3. **Instruction tuning:** openly licensed instruction datasets plus
   first-party data; system-prompt and memory support.
4. **Tool use and reasoning:** training on tool-call traces produced by the
   agent runtime; this is what unlocks Agents.
5. **Scale:** base → large as compute and data allow.

Expectation setting: a 125 M model trained on one GPU will write coherent
simple text; it will not match frontier assistants, which use 3–5 orders of
magnitude more compute. Capability grows with the ladder, not by decree.

## 6. API contract (v1)

Base path `/api/v1`. JSON. Auth by `origin_session` httpOnly cookie or
`Authorization: Bearer <token>`. Errors: `{"detail": "message"}`.
Interactive docs at `/api/docs` in development.

| Area | Endpoints |
|---|---|
| Auth | `GET /auth/status` · `POST /auth/register` · `POST /auth/login` · `POST /auth/logout` · `GET/PATCH /auth/me` · `POST /auth/password` |
| Conversations | `GET/POST /conversations` (`q`, `project_id`, `limit`, `offset`) · `GET/PATCH/DELETE /conversations/{id}` |
| Generation (SSE) | `POST /conversations/{id}/messages` · `POST /conversations/{id}/messages/{mid}/edit` · `POST /conversations/{id}/regenerate` |
| Projects | `GET/POST /projects` · `PATCH/DELETE /projects/{id}` |
| Files | `GET/POST /files` · `GET /files/{id}/download` · `DELETE /files/{id}` |
| Memory | `GET/POST/DELETE /memory` · `PATCH/DELETE /memory/{id}` |
| Models | `GET /models` · `GET /models/active` · `GET /models/{name}/metrics` · `POST /models/{name}/activate` (admin) |
| Compute | `GET /compute/local` |
| Admin | `GET /admin/overview` · `GET /admin/users` · `PATCH /admin/users/{id}` · `GET /admin/audit` |
| System | `GET /system/status` · `GET /health` |

**Streaming protocol** (`text/event-stream`):
`user_message {message}` → `assistant_start {message}` → `delta {text}`* →
`done {message}`. Generation runs in a worker thread that owns persistence:
the reply is stored even if the client disconnects; disconnect cancels
generation and stores the partial text as `cancelled`. Failures are stored as
`error` with the real reason. With no model: HTTP 503 and nothing is stored.

## 7. Database schema

Implemented (SQLAlchemy, portable SQLite/PostgreSQL; UUID string keys):

- `users` — email (unique), display_name, password_hash (Argon2id), role
  (`owner|admin|user`), is_active, preferences (JSON), timestamps
- `auth_sessions` — user_id, token_hash (SHA-256, unique), expires_at, ip, user_agent
- `projects` — user_id, name, description
- `conversations` — user_id, project_id?, title, pinned; index (user_id, updated_at)
- `messages` — conversation_id, seq, role, content, status
  (`streaming|complete|cancelled|error`), error, model, usage (JSON)
- `files` — user_id, project_id?, filename, content_type, size, sha256, storage_key
- `message_attachments` — (message_id, file_id)
- `memories` — user_id, project_id?, kind, content, enabled
- `audit_logs` — time, user_id, action, target, ip, detail (JSON)
- `system_settings` — key, value (JSON)

Planned tables: `memory_embeddings` (pgvector), `documents`/`document_chunks`,
`datasets`, `training_jobs`, `compute_providers` (encrypted credentials),
`compute_usage`, `agent_runs`/`agent_steps`/`approvals`, `api_keys`,
`deployments`, `file_versions`. Migrations: Alembic **(planned — tables are
currently created with `create_all`, acceptable only until the first
release with user data)**.

## 8. Security model

- Passwords: Argon2id. Sessions: 256-bit random token, only its SHA-256 is
  stored; httpOnly, SameSite=Lax, Secure when configured; server-side
  revocation (logout, password change, account disable).
- CSRF: SameSite cookie plus Origin allow-list on state-changing requests.
- RBAC: owner > admin > user. Every resource query is scoped to its owner.
  The last active owner cannot be removed.
- Rate limits on auth (per IP) and generation (per user).
- Uploads: size-capped streaming, basename-only filenames, served only as
  attachments with `nosniff`, storage keys confined to the storage root.
- Model output is rendered as Markdown without raw HTML.
- Audit log for auth, admin, file and model actions.
- No credential or API URL is present in frontend code; the browser talks
  only to its own origin.

Planned: encrypted provider credentials (envelope encryption), sandboxed code
execution (rootless containers / gVisor, no network by default), per-tool
agent permissions with approval prompts, backups, Redis-backed limits.

## 9. Compute (Origin GPU)

Today: local discovery (`psutil`, `nvidia-smi`, PyTorch device probes).

Planned adapter interface — every provider implements the same contract:

```python
class ComputeProvider(Protocol):
    id: str
    billing: Literal["free", "limited", "paid"]
    def discover(self) -> list[Resource]: ...
    def quote(self, spec: JobSpec) -> CostEstimate: ...      # shown before approval
    def launch(self, spec: JobSpec, approval: Approval) -> JobHandle: ...
    def status(self, job: JobHandle) -> JobStatus: ...
    def logs(self, job: JobHandle) -> Iterator[str]: ...
    def cancel(self, job: JobHandle) -> None: ...
    def sync_checkpoints(self, job: JobHandle, dest: Path) -> None: ...
```

Rules: `launch` on a paid provider requires a signed, single-use `Approval`
created by an explicit user action that displayed the quote. Only providers
with an official, documented API/SDK get an adapter (each verified against
current vendor docs at implementation time). Free notebook services without
a job API are not automated. SSH to a user-owned machine is the first remote
adapter, since it needs no vendor API.

## 10. UI design system

Pure white, minimal, restrained green. Tokens live in `apps/web/app/globals.css`.

| Token | Light | Use |
|---|---|---|
| `bg` | `#ffffff` | page |
| `surface` / `surface-2` | `#fafafa` / `#f4f4f3` | sidebar, hover, user bubble, code |
| `fg` / `fg-2` / `muted` | `#1a1a1a` / `#4a4a48` / `#8a8a86` | text hierarchy |
| `line` / `line-strong` | `#ececea` / `#dcdcd8` | hairline borders |
| `brand` / `brand-soft` | `#0f7b53` / `#eef7f2` | primary action, active state |
| `danger`, `warn` | `#b42318`, `#a15c07` | status only |

- Type: Geist Sans / Geist Mono (self-hosted). 15 px body in chat, 13–14 px UI.
- Radius: 8 px controls, 12 px cards, 16 px composer and bubbles.
- Shadows: three soft levels; borders do most of the separation.
- Motion: 200–240 ms fades only; honours `prefers-reduced-motion`.
- Green is reserved for the primary action, active navigation and the logo.
- Dark theme re-maps the same tokens; light is the default.
- Layout: collapsible 264 px sidebar (60 px rail), 720–768 px reading column,
  mobile drawer under 768 px.

The reference screenshot mentioned in the brief was not available in the
build session; the system above follows the written design direction and
should be reconciled with the screenshot when it is provided.
