#!/usr/bin/env bash
# Resets the local test environment (database, private config, mock Drive, mailbox).
set -euo pipefail
R="${RUNTIME:?set RUNTIME}"
mysql -uroot -e "DROP DATABASE IF EXISTS bladezux; CREATE DATABASE bladezux CHARACTER SET utf8mb4;"
for d in private mock mail shots; do
  if [ -d "$R/$d" ]; then find "$R/$d" -mindepth 1 -delete; fi
done
mkdir -p "$R/private" "$R/mock" "$R/mail"
