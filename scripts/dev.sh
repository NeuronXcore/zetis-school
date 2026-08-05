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

echo "▶ 4/5 Worker de production…"
# ⚠️ **Il manquait ici, et c'est ce qui a fait croire à une panne le 2026-08-05.**
#
# Le backend n'exécute JAMAIS un lot : il l'accepte en `202` et l'enfile sur Redis (ADR-0031 §3).
# Sans ce processus, ZETIS accepte tout et ne produit rien — la file grossit en silence, l'écran
# affiche « en file d'attente » (littéralement vrai), et Papa reclique. Quatre lots identiques ont
# attendu six heures avant qu'on cherche du côté du code.
#
# Un dispositif dont une pièce doit être lancée à la main finit toujours par tourner sans elle.
( cd "$BACKEND_DIR" && "$VENV_PY" -m app.production_worker ) &
WORKER_PID=$!

echo "▶ 5/5 Backend (http://localhost:8000) + frontends…"
( cd "$BACKEND_DIR" && "$VENV_UVICORN" app.main:app --reload --port 8000 ) &
BACKEND_PID=$!
# Stoppe le backend ET le worker quand on quitte (Ctrl+C). Un worker orphelin continuerait de
# consommer la file avec l'ancien code, ce qui est pire qu'un worker absent : ça marche presque.
trap 'echo; echo "⏹ Arrêt…"; kill "$BACKEND_PID" "$WORKER_PID" 2>/dev/null || true' EXIT INT TERM

echo "   Massimo → http://localhost:5173   Papa → http://localhost:5174"
# Les deux frontends en parallèle (au premier plan : garde le terminal vivant).
pnpm --parallel --filter "./apps/frontend-*" dev
