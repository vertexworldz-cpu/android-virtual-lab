#!/usr/bin/env bash
# Builds dist/bladezux-cloud-storage-v1.0.0.zip (no secrets, logs or runtime data).
set -euo pipefail
cd "$(dirname "$0")/.."
cp database/install.sql storage/install/install.sql
mkdir -p dist
OUT="dist/bladezux-cloud-storage-v1.0.0.zip"
rm -f "$OUT"
cd ..
zip -qr "bladezux-cloud-storage/$OUT" bladezux-cloud-storage \
  -x 'bladezux-cloud-storage/dist/*' 'bladezux-cloud-storage/storage/app/private/*' \
     'bladezux-cloud-storage/private/config.php' 'bladezux-cloud-storage/private/logs/*.log' \
     'bladezux-cloud-storage/storage/uploads/branding/logo-*' 'bladezux-cloud-storage/tests/.runtime/*'
echo "Built $OUT"
