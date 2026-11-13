# Origin AI — developer commands. Run `make setup` once, then `make dev`.
SHELL := /bin/bash
PY := .venv/bin/python
export NEXT_TELEMETRY_DISABLED := 1

.PHONY: setup bootstrap-model api web dev test test-core test-api test-web build

setup:               ## install Python and Node dependencies
	python3 -m venv .venv
	.venv/bin/pip install -e core -e "services/api[dev]"
	cd apps/web && npm install

bootstrap-model:     ## train the first Origin checkpoint from random weights (CPU: ~25 min)
	.venv/bin/origin-core bootstrap --out data/checkpoints/origin-nano-bootstrap

api:                 ## run the API on :8000
	.venv/bin/uvicorn origin_api.main:app --host 127.0.0.1 --port 8000

web:                 ## run the web app on :3000 (development mode)
	cd apps/web && npm run dev

dev:                 ## run API and web together
	@trap 'kill 0' EXIT; $(MAKE) api & $(MAKE) web & wait

build:               ## production build of the web app
	cd apps/web && npm run build

test: test-core test-api test-web

test-core:
	cd core && ../$(PY) -m pytest -q

test-api:
	cd services/api && ../../$(PY) -m pytest -q

test-web:
	cd apps/web && npm run lint && npx tsc --noEmit
