#!/usr/bin/env bash
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
echo "=================================================="
echo "🚀 Starting Android Virtual Lab"
echo "=================================================="

# 1. Setup Java Environment
if [ -d "/usr/local/opt/openjdk@17" ]; then
    export JAVA_HOME="/usr/local/opt/openjdk@17"
    export PATH="$JAVA_HOME/bin:$PATH"
fi

# 2. Check Virtualenv
if [ ! -f "$DIR/backend/venv/bin/python" ]; then
    echo "Creating Python virtualenv..."
    /usr/local/bin/python3.12 -m venv "$DIR/backend/venv"
    "$DIR/backend/venv/bin/pip" install -r "$DIR/backend/requirements.txt"
fi

# 3. Build Frontend if dist not present
if [ ! -d "$DIR/frontend/dist" ]; then
    echo "Building frontend..."
    cd "$DIR/frontend"
    npm run build
fi

echo "--------------------------------------------------"
echo "🌐 Starting Backend & Unified Platform on Port 8000"
echo "   URL: http://localhost:8000"
echo "--------------------------------------------------"

cd "$DIR/backend"
exec "$DIR/backend/venv/bin/python" run.py
