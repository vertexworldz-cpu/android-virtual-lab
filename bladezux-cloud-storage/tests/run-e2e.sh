#!/usr/bin/env bash
# Starts the test services and runs the end-to-end suite.
#   RUNTIME=/tmp/bzx-runtime tests/run-e2e.sh        (LARGE_MB=1024 for a 1 GB upload)
# Requirements: PHP 8.2+ (pdo_mysql, curl, gd), MySQL/MariaDB with root socket access,
# Python 3, Node 18+ with Playwright + Chromium.
set -euo pipefail
cd "$(dirname "$0")/.."
export RUNTIME="${RUNTIME:-/tmp/bzx-runtime}"
mkdir -p "$RUNTIME/www" "$RUNTIME/mock" "$RUNTIME/mail" "$RUNTIME/private"
ln -sfn "$PWD/storage" "$RUNTIME/www/storage"

mysql -uroot -e "CREATE USER IF NOT EXISTS 'bzx'@'localhost' IDENTIFIED BY 'bzx-pass-123'; GRANT ALL ON bladezux.* TO 'bzx'@'localhost'; FLUSH PRIVILEGES;"
tests/reset-env.sh

pids=()
cleanup() { for p in "${pids[@]}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT
MOCK_STATE_DIR="$RUNTIME/mock" PHP_CLI_SERVER_WORKERS=4 php -d post_max_size=0 -d memory_limit=1G \
  -S 127.0.0.1:9100 tests/mock-google/router.php >"$RUNTIME/mock.log" 2>&1 & pids+=($!)
python3 tests/smtp_sink.py 2525 "$RUNTIME/mail" >"$RUNTIME/smtp.log" 2>&1 & pids+=($!)
BLADEZUX_PRIVATE_DIR="$RUNTIME/private" PHP_CLI_SERVER_WORKERS=6 php -d post_max_size=64M -d memory_limit=512M \
  -S 127.0.0.1:8080 -t "$RUNTIME/www" >"$RUNTIME/app.log" 2>&1 & pids+=($!)
sleep 1
node tests/e2e.js
