#!/data/data/com.termux/files/usr/bin/bash
# Start Origin AI on Termux. Then open http://localhost:3000 in the phone's browser.
cd "$(dirname "$0")/.."
. .venv/bin/activate
termux-wake-lock 2>/dev/null || true   # keeps Termux alive with the screen off (needs Termux:API; optional)
trap 'kill 0' EXIT
uvicorn origin_api.main:app --host 127.0.0.1 --port 8000 &
cd apps/web && NEXT_TELEMETRY_DISABLED=1 npx next start -H 127.0.0.1 -p 3000 &
wait
