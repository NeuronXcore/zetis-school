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

# 🔴 REFUS SI LA PROD TOURNE — ajouté le 2026-08-18, et ce n'est pas du confort.
# La prod possède 8000 / 5173 / 5174. Si elle tourne, le backend de dev ne peut pas prendre 8000
# (il échoue), MAIS Vite démarre quand même et appelle 8000 : le frontend de dev parlerait alors à
# la PROD, et écrirait dans l'année réelle de Massimo. Le défaut est SILENCIEUX — l'écran a l'air
# normal. On refuse donc de démarrer, et on dit par quoi passer.
for _port in 8000 5173 5174; do
  if lsof -nP -iTCP:$_port -sTCP:LISTEN >/dev/null 2>&1; then
    echo "❌ Le port $_port est déjà pris — la prod tourne probablement (docker ps | grep zetis-prod)."
    echo "   \`pnpm dev\` viserait ces ports ET la base de PROD. Refus."
    echo "   → Pour développer à côté de la prod, employer une paire de .claude/launch.json :"
    echo "     backend-dev :8001 + massimo-dev :5176 + papa-dev :5175"
    echo "   → Ou arrêter la prod : pnpm prod:down"
    exit 1
  fi
done

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
# ⚠️ VITE_API_URL est posée EXPLICITEMENT : sans elle, les frontends dépendraient d'un `.env.local`
# (gitignoré, donc absent d'une machine neuve) ou du repli codé. Une variable d'environnement prime
# sur les fichiers `.env` de Vite — ce lancement-ci dit donc toujours la vérité sur SON backend.
VITE_API_URL="http://localhost:8000" pnpm --parallel --filter "./apps/frontend-*" dev
