#!/bin/bash
# (bash 3.2 de macOS compatible)
#
# zetis-import.sh — Restauration de ZETIS sur le Mac Studio
#
#   Usage :  cd /Volumes/T5/zetis && ./zetis-import.sh /Volumes/T5/zetis-migration-2026-08-10
#
# Prérequis : Docker Desktop démarré, node/pnpm/uv installés, le dépôt déjà
# placé dans /Volumes/T5/zetis (le script ne copie PAS le code, il restaure les
# données autour).
#
# ⚠️  DESTRUCTIF sur la base locale : il DROP puis recrée la base cible.
#
set -euo pipefail

SRC="${1:-}"
[ -n "$SRC" ] || { echo "Usage: $0 <dossier-export>"; exit 1; }
[ -f "$SRC/db/zetis.dump" ] || { echo "❌ $SRC/db/zetis.dump introuvable"; exit 1; }

ROOT="$(pwd)"
[ -f "$ROOT/docker-compose.yml" ] || {
  echo "❌ Lance le script depuis la racine du projet ZETIS (/Volumes/T5/zetis)."; exit 1; }

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

echo
cat "$SRC/INVENTAIRE.txt" 2>/dev/null | head -25 || true
echo
printf "Restaurer cet export dans %s ? La base locale sera ÉCRASÉE. [oui/non] " "$ROOT"
read -r rep
[ "$rep" = "oui" ] || { echo "Annulé."; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# 1. Secrets d'abord : le backend et compose en dépendent
# ─────────────────────────────────────────────────────────────────────────────
log "Restauration des .env"
if [ -d "$SRC/secrets" ]; then
  (cd "$SRC/secrets" && find . -type f -print0) | while IFS= read -r -d '' rel; do
    mkdir -p "$ROOT/$(dirname "$rel")"
    cp "$SRC/secrets/$rel" "$ROOT/$rel"
    echo "   ${rel#./}"
  done
  ok "secrets en place"
else
  warn "Pas de dossier secrets/ — le backend repartira sur ses défauts."
fi

# Garde-fou : le préfixe ZETIS_ est obligatoire, un DATABASE_URL nu est ignoré
if [ -f "$ROOT/.env" ]; then
  if grep -qE '^\s*DATABASE_URL=' "$ROOT/.env" && ! grep -qE '^\s*ZETIS_DATABASE_URL=' "$ROOT/.env"; then
    warn "Le .env définit DATABASE_URL sans préfixe : le backend l'IGNORERA."
    warn "Renomme-le en ZETIS_DATABASE_URL (Settings a env_prefix=\"ZETIS_\")."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Infra
# ─────────────────────────────────────────────────────────────────────────────
DBURL="$(grep -hE '^[[:space:]]*ZETIS_DATABASE_URL=' "$ROOT/.env" 2>/dev/null \
         | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
CLEAN="$(printf '%s' "$DBURL" | sed -E 's|^postgresql\+[a-z0-9]+://|postgresql://|; s|\?.*$||')"
PGUSER="$(printf '%s' "$CLEAN" | sed -n 's|^postgresql://\([^:@/]*\).*|\1|p')"
PGDB="$(printf '%s' "$CLEAN"  | sed -n 's|.*/\([^/?]*\)$|\1|p')"
PGUSER="${PGUSER:-zetis}"
PGDB="${PGDB:-zetis}"

PGSVC="$(docker compose config --services | grep -E '^(postgres|db|pg)$' | head -1 || true)"
PGSVC="${PGSVC:-postgres}"

log "Démarrage de l'infra (postgres, redis, minio)"
docker compose up -d "$PGSVC" >/dev/null
docker compose up -d redis minio >/dev/null 2>&1 || true

printf '   attente de postgres'
for i in $(seq 1 90); do
  if docker compose exec -T "$PGSVC" pg_isready -U "$PGUSER" >/dev/null 2>&1; then break; fi
  printf '.'; sleep 1
  [ "$i" -eq 90 ] && { echo; echo "❌ Postgres ne répond pas."; exit 1; }
done
echo
ok "postgres prêt (user=$PGUSER db=$PGDB)"

# Comparaison de version majeure : un dump ne remonte pas dans un serveur plus vieux
if [ -f "$SRC/db/PG_VERSION.txt" ]; then
  old="$(sed -n 's/^PostgreSQL \([0-9]*\).*/\1/p' "$SRC/db/PG_VERSION.txt")"
  new="$(docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d postgres -Atc 'select version()' \
         | sed -n 's/^PostgreSQL \([0-9]*\).*/\1/p')"
  echo "   postgres source=$old  cible=$new"
  if [ -n "$old" ] && [ -n "$new" ] && [ "$new" -lt "$old" ]; then
    echo "❌ Le serveur cible ($new) est plus ancien que la source ($old) : le restore échouera."
    echo "   Aligne le tag d'image dans docker-compose.yml puis relance."
    exit 1
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Restore Postgres — dans une base VIDE (pas par-dessus un schéma migré)
# ─────────────────────────────────────────────────────────────────────────────
log "Recréation de la base $PGDB"
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$PGDB' AND pid<>pg_backend_pid();" >/dev/null
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS \"$PGDB\";" >/dev/null
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d postgres -c "CREATE DATABASE \"$PGDB\" OWNER \"$PGUSER\";" >/dev/null

log "Restauration du dump"
# --no-owner : les rôles de la machine source ne sont pas forcément ceux d'ici.
# On tolère les warnings de pg_restore (extensions déjà présentes) sans avorter.
set +e
# pas de -e : on veut continuer malgré les erreurs bénignes (extensions déjà là)
docker compose exec -T "$PGSVC" pg_restore -U "$PGUSER" -d "$PGDB" \
  --no-owner --no-privileges < "$SRC/db/zetis.dump" 2> /tmp/zetis_restore.log
rc=$?
set -e
[ $rc -ne 0 ] && warn "pg_restore a signalé des avertissements (voir /tmp/zetis_restore.log)"

TABLES="$(docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -Atc \
  "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')"
VECT="$(docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -Atc \
  "select coalesce((select extversion from pg_extension where extname='vector'),'ABSENT');" | tr -d '\r')"
ALEMBIC="$(docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -Atc \
  "select version_num from alembic_version limit 1;" 2>/dev/null | tr -d '\r')"

ok "tables restaurées : $TABLES"
if [ "$VECT" = "ABSENT" ]; then
  warn "extension pgvector ABSENTE → le RAG ne fonctionnera pas."
  warn "Utilise une image pgvector/pgvector:pgXX dans docker-compose.yml."
else
  ok "pgvector : $VECT"
fi
ok "alembic_version : ${ALEMBIC:-(absente)}"
[ "$TABLES" -gt 0 ] || { echo "❌ Aucune table restaurée — arrêt."; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 4. Volumes (MinIO, etc.) + storage/
# ─────────────────────────────────────────────────────────────────────────────
log "Restauration des volumes Docker"
if [ -d "$SRC/minio" ]; then
  for f in "$SRC"/minio/*.tar.gz; do
    [ -e "$f" ] || continue
    v="$(basename "$f" .tar.gz)"
    case "$v" in *postgres*|*pgdata*|*_db_*) echo "   $v (ignoré : déjà restauré via le dump)"; continue;; esac
    echo "   $v"
    docker volume create "$v" >/dev/null
    docker run --rm -v "$v":/dst -v "$SRC/minio":/in alpine \
      sh -c "cd /dst && tar xzf /in/$(basename "$f")"
  done
  ok "volumes restaurés"
fi

if [ -d "$SRC/storage" ]; then
  log "Restauration de storage/"
  mkdir -p "$ROOT/storage"
  rsync -a "$SRC/storage/" "$ROOT/storage/"
  ok "storage/ ($(du -sh "$ROOT/storage" | cut -f1))"
fi

docker compose up -d >/dev/null 2>&1 || true

# ─────────────────────────────────────────────────────────────────────────────
# 5. Dépendances — recréées, JAMAIS copiées
#    (.venv contient les chemins absolus de la machine d'origine)
# ─────────────────────────────────────────────────────────────────────────────
log "Backend : recréation du virtualenv"
cd "$ROOT/apps/backend"
rm -rf .venv
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"
ok "venv prêt"

log "Alembic (no-op si le dump était déjà à jour)"
.venv/bin/alembic upgrade head
.venv/bin/alembic current

cd "$ROOT"
log "Frontends : pnpm install"
pnpm install

# ─────────────────────────────────────────────────────────────────────────────
# 6. Contrôles Ollama
# ─────────────────────────────────────────────────────────────────────────────
log "Vérification Ollama"
if curl -sf http://localhost:11434/api/tags > /tmp/zetis_ollama.json 2>/dev/null; then
  for m in qwen3.6:35b-a3b nomic-embed-text; do
    if grep -q "${m%%:*}" /tmp/zetis_ollama.json; then ok "modèle $m présent"
    else warn "modèle $m ABSENT → ollama pull $m"; fi
  done
else
  warn "Ollama injoignable sur :11434 — démarre-le (et vérifie le montage du SSD des modèles)."
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
ok "IMPORT TERMINÉ"
cat <<'EOF'

Vérifications manuelles (§7 du runbook) — à faire AVANT d'effacer le MacBook :

  pnpm dev
  curl -s http://localhost:8000/health
  apps/backend/.venv/bin/pytest -q

  puis dans le navigateur :
   • massimo/massimo1234 → XP et niveau corrects (pas remis à zéro)
   • papa/papa1234       → progression et journal peuplés
   • ouvrir une capsule ou une fiche existante  → valide MinIO
   • lancer une recherche RAG                    → valide pgvector + embeddings
   • générer un ELI5                             → valide Ollama
EOF
