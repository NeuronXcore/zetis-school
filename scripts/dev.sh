#!/usr/bin/env bash
# Lance toute la stack ZETIS en local : infra Docker + backend FastAPI + 2 frontends.
# Usage : pnpm dev   (ou   bash scripts/dev.sh)
# Arrêt : Ctrl+C (le backend lancé en arrière-plan est stoppé automatiquement).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BACKEND_DIR="$ROOT/apps/backend"
VENV_PY="$BACKEND_DIR/.venv/bin/python"
VENV_UVICORN="$BACKEND_DIR/.venv/bin/uvicorn"
VENV_ALEMBIC="$BACKEND_DIR/.venv/bin/alembic"

echo "▶ 1/4 Infra Docker (postgres / redis / minio)…"
docker compose up -d

echo "▶ 2/4 Attente de PostgreSQL…"
for _ in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U zetis >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "▶ 3/4 Migrations + seed (idempotent)…"
( cd "$BACKEND_DIR" && "$VENV_ALEMBIC" upgrade head && "$VENV_PY" -m app.db.seed )

echo "▶ 4/4 Backend (http://localhost:8000) + frontends…"
( cd "$BACKEND_DIR" && "$VENV_UVICORN" app.main:app --reload --port 8000 ) &
BACKEND_PID=$!
# Stoppe le backend quand on quitte (Ctrl+C).
trap 'echo; echo "⏹ Arrêt…"; kill "$BACKEND_PID" 2>/dev/null || true' EXIT INT TERM

echo "   Massimo → http://localhost:5173   Papa → http://localhost:5174"
# Les deux frontends en parallèle (au premier plan : garde le terminal vivant).
pnpm --parallel --filter "./apps/frontend-*" dev
