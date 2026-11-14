# Origin AI — Development Status

Last updated: 2026-11-13 · Version 0.1.0

Everything under **Working** was verified in the build session by the tests
listed at the bottom. Nothing is listed as working on the basis of code
alone.

## Working

### Origin Core (model stack)
- Byte-level BPE tokenizer written from scratch; lossless round-trip,
  digit-isolating pre-tokenisation, injection-proof control tokens.
- Decoder-only transformer (RoPE, RMSNorm, SwiGLU, KV cache), size presets
  nano → large.
- Training loop with warmup/cosine schedule, clipping, evaluation, atomic
  checkpoints, resume, JSONL metrics.
- Streaming inference with sampling controls and cancellation.
- `origin-core` CLI: `bootstrap`, `train-tokenizer`, `pack`, `pretrain`, `chat`.

### First trained model: `origin-nano-bootstrap`
Trained in this session from random weights. Measured results:

| | |
|---|---|
| Parameters | 1,869,504 |
| Training | 6,000 steps, 26.5 minutes, 4 CPU cores, no GPU |
| Data | 48,809 generated arithmetic chat examples |
| Held-out exact match | **99.4 %** (2,540 / 2,556 problems never seen in training) |
| Addition / subtraction (0–99) | 100 % / 100 % |
| Comparison | 98.9 % |
| Multiplication (0–20) | 89.6 % |

**What this model is:** proof that the whole pipeline works end to end with
answers anyone can check. **What it is not:** a general assistant. It cannot
converse, write, code or reason outside those tasks, and off-topic input
produces unreliable output. The UI states this on the dashboard and the
Models page. The 22 MB checkpoint is committed in `models/origin-nano-bootstrap/` (copy it to `data/checkpoints/`); it can also be reproduced with `make bootstrap-model`.

### Open-model servers (new)
- Administrators can connect any OpenAI-compatible server (Ollama, llama.cpp,
  vLLM) from **Models**, test the connection, choose it for chat, or remove it.
  Chat streams from it, includes conversation history and enabled memories,
  and shows the server's real errors (unreachable, HTTP errors) instead of
  inventing a reply. Origin's own model stays selectable alongside it.
- Verified against a fake OpenAI-style server in tests and the browser suite.
  **Not yet verified against a real Ollama install** (none available in the
  build environment).
- No API keys are stored (local servers need none). Adding keys needs the
  encrypted-credential store (roadmap).
- External models are not trained by Origin; their ability and licence are the
  publisher's. The UI labels them that way.

### Platform API
- Accounts: owner setup, registration (can be closed), login, logout,
  profile, password change. Argon2id, hashed server-side sessions.
- Roles (owner/admin/user), per-user data isolation, audit log, auth and
  generation rate limits, Origin check, security headers.
- Conversations: create, list, search (titles and message text), rename,
  pin, delete.
- Chat generation over SSE: send, stop, regenerate, edit-and-resend.
  Results persist even if the browser disconnects; failures are stored with
  the real reason; no model → HTTP 503, nothing invented.
- Projects, files (upload/download/delete, text attachments read by the
  model), memory (CRUD, search, enable/disable, clear).
- Model registry with model cards and training logs; admin model activation.
- Local compute report (CPU, RAM, disk, NVIDIA via `nvidia-smi`, PyTorch).
- Runs on SQLite (default) and PostgreSQL (same test suite passes on both).

### Web app
- White minimalist design system, light (default) / dark / system themes.
- Collapsible sidebar, mobile drawer, responsive layouts.
- Dashboard with greeting, composer (attachments, voice where the browser
  supports it), model-declared quick prompts, recent conversations.
- Chat with streaming, Markdown, code blocks with copy, tables, attachments,
  stop / regenerate / edit, rename / pin / delete.
- History, Projects, Files, Memory, GPU & Compute, Models, Settings, Admin.

## Not built (shown in the UI as "Not built yet", never simulated)
- **Agents** (phase 4), **Code**, **Research**, **Create** (phase 6),
  **Deploy** (phase 5).

## Partly built — known gaps
- **Memory**: stored and searchable, but the bootstrap model was not trained
  to use background context, so memories do not affect answers yet (the page
  says so). No embeddings/vector retrieval.
- **GPU & Compute**: local discovery only. No cloud adapters, job
  scheduling, or usage tracking.
- **Lab/Models**: training is started from the CLI, not the UI. No dataset
  manager or experiment comparison.
- **Storage**: local disk only; no S3 backend or versioning.
- **Attachments**: only text-like files are read; others are stored and
  flagged as not read. No PDF/DOCX extraction.
- **Editing a message** discards later turns (no branching).
- **Voice input** uses the browser's Web Speech API, which in some browsers
  sends audio to the browser vendor. It is optional and labelled.
- **Web/research toggle** in the composer: omitted, because there is no
  capability behind it.
- **Migrations**: tables are created with `create_all`; Alembic not set up.
- **Rate limiting** is in-process (single node); Redis backend not built.
- **Docker**: `docker-compose.yml` for data services is provided but was
  **not run** in the build session (no Docker daemon there). No Dockerfiles
  for api/web yet.
- **Encrypted credential storage**, backups, CI: not built.
- The design reference screenshot named in the brief was not received; the
  UI follows the written design direction.

## Blocked / needs the owner
- **A real language model needs a GPU and a corpus.** The build machine has
  4 CPU cores, 15 GB RAM and no GPU, and could not reach dataset hosts. See
  ROADMAP "Immediate next steps".
- **Cloud GPU providers**: which ones to support is the owner's call; each
  adapter will be checked against the vendor's current official API first.
  No paid resource will ever start without explicit approval.

## Verification performed (2026-11-13)
| Check | Result |
|---|---|
| `core` unit tests (tokenizer, model causality, KV-cache equivalence, training, checkpoints) | 16 passed |
| `services/api` tests on SQLite | 28 passed |
| `services/api` tests on PostgreSQL 16 | 22 passed (before the open-model tests were added) |
| Web: ESLint, TypeScript, production build | clean |
| Browser end-to-end (`apps/web/e2e/smoke.mjs`, Chromium, production build, final checkpoint) | 28 / 28 checks passed |
| Bootstrap model held-out benchmark | 2,540 / 2,556 |

Not verified: Docker compose stack, CUDA/MPS code paths (no such hardware
available), Safari/Firefox, load behaviour, the `pretrain` CLI path on a
real corpus (its components are unit-tested; no full run was done).
