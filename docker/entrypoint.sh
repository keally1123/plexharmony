#!/bin/sh
set -e

echo "Starting PlexHarmony..."

# Validate required env vars
if [ -z "$PLEX_TOKEN" ]; then
  echo "ERROR: PLEX_TOKEN environment variable is required."
  exit 1
fi

if [ -z "$ADMIN_PASSWORD_HASH" ]; then
  echo "ERROR: ADMIN_PASSWORD_HASH environment variable is required."
  echo "Run: python backend/generate_password_hash.py to generate one."
  exit 1
fi

cd /app/backend

exec uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2 \
  --no-access-log \
  --proxy-headers \
  --forwarded-allow-ips "*"
