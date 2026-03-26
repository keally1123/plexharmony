# ── Stage 1: Build frontend ───────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy lock file first for better layer caching
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY frontend/ .
RUN npm run build

# ── Stage 2: Python backend + serve built frontend ────────────────────────────
FROM python:3.12-slim AS final

# Security: non-root user
RUN groupadd -r plexharmony && useradd -r -g plexharmony plexharmony

WORKDIR /app

# System deps
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

# Python deps
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Backend source
COPY backend/ ./backend/

# Built frontend static files
COPY --from=frontend-builder /app/frontend/dist ./backend/static/

# Entrypoint
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Create data directory
RUN mkdir -p /app/data && chown -R plexharmony:plexharmony /app

USER plexharmony

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:8000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
