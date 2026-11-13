# Origin AI — Roadmap

Status key: ✅ done · 🟡 partly done · ⬜ not started. Detail lives in
`DEVELOPMENT_STATUS.md`.

## Phase 1 — Foundation 🟡
- ✅ Monorepo structure, architecture, design system
- ✅ API (FastAPI), database schema, auth, RBAC, audit log, rate limits
- ✅ Web shell: collapsible sidebar, light/dark themes, responsive layout
- ⬜ Alembic migrations
- ⬜ CI pipeline (tests, lint, build on every push)
- ⬜ Dockerfiles for api and web; verified compose stack

## Phase 2 — Origin Chat 🟡
- ✅ Conversations, history search, pin, rename, delete
- ✅ Streaming replies, stop, regenerate, edit-and-resend
- ✅ File attachments (text files are read by the model)
- ✅ Markdown, code blocks, tables
- ✅ Served by an independently trained Origin model
- ⬜ Conversation branching (keep history when editing)
- ⬜ PDF/DOCX text extraction for attachments
- ⬜ Move a conversation between projects from the chat header

## Phase 3 — Origin Core 🟡
- ✅ Tokenizer, transformer, datasets, training, evaluation, inference
- ✅ Bootstrap checkpoint trained from random weights and benchmarked
- ⬜ Licensed language corpus pipeline (download, dedupe, filter, shard)
- ⬜ Language pretraining run (micro → small) — **needs a GPU**
- ⬜ Instruction tuning with system-prompt support
- ⬜ Evaluation suite beyond the bootstrap benchmark
- ⬜ Multi-GPU (DDP) training, gradient accumulation, EMA
- ⬜ Quantised / compiled inference, batching, standalone inference server

## Phase 4 — Origin Agents ⬜
- ⬜ Tool framework (typed schema, permission scopes)
- ⬜ Execution engine: plan → act → observe → verify, with recovery
- ⬜ Approval requests in chat for sensitive/destructive actions
- ⬜ Tool-use training data and fine-tune (depends on Phase 3 language model)
- ⬜ Coding, research, document, data, automation agents; multi-agent

## Phase 5 — Origin Infrastructure 🟡
- ✅ Local compute discovery (CPU, RAM, disk, NVIDIA, PyTorch devices)
- ✅ Model registry with measured model cards and training logs
- ⬜ Training jobs launched and monitored from the UI (local runner)
- ⬜ Provider adapter interface + SSH adapter for user-owned GPU machines
- ⬜ Cloud adapters (only providers with official APIs; cost quote + approval)
- ⬜ Dataset upload, checkpoint sync, usage tracking
- ⬜ S3-compatible storage backend, file versioning
- ⬜ Origin Deploy: inference endpoints, API keys, usage metering

## Phase 6 — Advanced capabilities ⬜
- ⬜ Origin Code: editor, terminal, sandboxed execution, git, preview
- ⬜ Origin Research: sources, indexing (pgvector), reports
- ⬜ Origin Memory: embeddings and retrieval from Origin's own encoder
- ⬜ Document tools
- ⬜ Origin Create: generator interface, first image model

## Phase 7 — Production ⬜
- ⬜ Load and performance testing
- ⬜ External security review, dependency scanning
- ⬜ Backup and restore, observability (metrics, tracing)
- ⬜ User and operator documentation
- ⬜ Private beta

## Immediate next steps (in order)
1. Alembic migrations and CI.
2. Local training-job runner + Lab UI (start, watch, cancel a run).
3. Corpus pipeline and the first language pretraining run on a GPU
   (SSH adapter to a GPU machine you control).
4. Instruction tuning → a model that can hold a simple conversation.
5. Tool framework and approval flow (Agents).
