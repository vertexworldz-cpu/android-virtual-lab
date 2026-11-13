#!/data/data/com.termux/files/usr/bin/bash
# Origin AI setup for Termux (Android). Run once:  bash scripts/termux-setup.sh
# NOT tested on a real phone by the author: if a step fails, the error tells
# you which one. Needs ~3 GB free storage and a good connection.
set -e
cd "$(dirname "$0")/.."

echo "==> System packages"
pkg update -y
pkg install -y python nodejs git clang make rust binutils libffi openssl \
  python-numpy tur-repo
pkg install -y python-psutil || true

echo "==> Python environment"
python -m venv --system-site-packages .venv
. .venv/bin/activate
pip install --upgrade pip

echo "==> PyTorch (from Termux repos; there are no official pip wheels for Android)"
if ! python -c "import torch" 2>/dev/null; then
  pkg install -y python-torch || {
    echo "!! Could not install PyTorch from Termux repos."
    echo "!! Origin's model cannot run without it. Stopping."; exit 1; }
fi
python -c "import torch; print('torch', torch.__version__)"

echo "==> API dependencies"
pip install fastapi "uvicorn" "sqlalchemy>=2" pydantic-settings python-multipart
# argon2 cannot be built on Android; the API falls back to scrypt automatically.
pip install --only-binary=:all: argon2-cffi 2>/dev/null || echo "(argon2 unavailable, using scrypt for passwords)"
python -c "import psutil" 2>/dev/null || pip install psutil
# --no-deps: the packages list psycopg[binary] (PostgreSQL), which has no Android build
# and is not needed on SQLite.
pip install --no-deps -e core -e services/api

echo "==> Model checkpoint (pre-trained, so no training on the phone)"
mkdir -p data/checkpoints
[ -d data/checkpoints/origin-nano-bootstrap ] || cp -r models/origin-nano-bootstrap data/checkpoints/

echo "==> Web app"
cd apps/web
npm install
NEXT_TELEMETRY_DISABLED=1 npm run build
echo
echo "Done. Start Origin with:  bash scripts/termux-run.sh"
