#!/usr/bin/env bash
# Entrypoint backend prod-like : applique les migrations, seed (idempotent), lance uvicorn.
set -euo pipefail

echo "▶ Migrations Alembic…"
alembic upgrade head

echo "▶ Seed (idempotent)…"
python -m app.db.seed || echo "seed: non bloquant (déjà présent ou ignoré)"

echo "▶ Uvicorn sur :8000 (Ollama attendu sur host.docker.internal:11434)…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
