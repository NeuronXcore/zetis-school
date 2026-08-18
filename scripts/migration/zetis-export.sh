#!/bin/bash
# (bash 3.2 de macOS compatible — ni mapfile, ni tableaux associatifs)
#
# zetis-export.sh — Export complet de ZETIS depuis le MacBook Pro
#
#   Usage :  ./zetis-export.sh /Volumes/T5/zetis-migration-$(date +%F)
#
# À lancer DEPUIS LA RACINE du projet ZETIS, Docker Desktop démarré.
# Ne modifie rien : il ne fait que lire et écrire dans le dossier de destination.
#
set -euo pipefail

NOREPO=0
if [ "${1:-}" = "--no-repo" ]; then NOREPO=1; shift; fi
DEST="${1:-}"
[[ -n "$DEST" ]] || { echo "Usage: $0 [--no-repo] <dossier-destination>"; exit 1; }

ROOT="$(pwd)"
[[ -f "$ROOT/docker-compose.yml" ]] || {
  echo "❌ Pas de docker-compose.yml ici. Lance le script depuis la racine du projet ZETIS."; exit 1;
}

# macOS livre parfois un rsync ancien (2.6.9) qui ignore --info=progress2
if rsync --info=progress2 --version >/dev/null 2>&1; then RSPROG="--info=progress2"; else RSPROG="--progress"; fi

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

mkdir -p "$DEST"/{db,minio,secrets,repo}
INV="$DEST/INVENTAIRE.txt"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Inventaire — c'est ce qui te permettra de comparer les deux machines
# ─────────────────────────────────────────────────────────────────────────────
log "Inventaire de la machine source"
{
  echo "# Inventaire export ZETIS — $(date -u +%FT%TZ)"
  echo "host        : $(hostname)"
  echo "macos       : $(sw_vers -productVersion) ($(uname -m))"
  echo "projet      : $ROOT"
  echo
  echo "## git"
  git -C "$ROOT" log --oneline -1 2>/dev/null || echo "(pas un dépôt git)"
  echo "branche     : $(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  echo "état        :"; git -C "$ROOT" status --short 2>/dev/null || true
  echo "stash       :"; git -C "$ROOT" stash list 2>/dev/null || true
  echo
  echo "## versions"
  for c in node pnpm python3 uv docker git; do
    printf '%-10s : %s\n' "$c" "$(command -v "$c" >/dev/null && "$c" --version 2>&1 | head -1 || echo 'absent')"
  done
  echo
  echo "## images docker-compose"
  grep -E '^\s*image:' "$ROOT/docker-compose.yml" || true
  echo
  echo "## ollama"
  ollama list 2>/dev/null || echo "(ollama injoignable)"
} > "$INV"
ok "$INV"

# git propre ? on avertit, on ne bloque pas (tu peux vouloir exporter un WIP)
if [[ -n "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ]]; then
  warn "Le dépôt a des modifications non commitées — elles seront copiées telles quelles."
fi

# ─────────────────────────────────────────────────────────────────────────────
# 2. Secrets (git-ignorés → invisibles pour git, donc à copier à la main)
# ─────────────────────────────────────────────────────────────────────────────
log "Copie des fichiers .env"
found=0
ENVLIST="$(find "$ROOT" -maxdepth 3 \( -name ".env" -o -name ".env.*" \) \
             ! -name ".env.example" ! -path "*/node_modules/*" 2>/dev/null || true)"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  rel="${f#$ROOT/}"
  mkdir -p "$DEST/secrets/$(dirname "$rel")"
  cp "$f" "$DEST/secrets/$rel"
  echo "   $rel"
  found=$((found + 1))
done <<< "$ENVLIST"
if [ "$found" -gt 0 ]; then ok "$found fichier(s) de secrets"
else warn "Aucun .env trouvé — vérifie à la main."; fi

# ─────────────────────────────────────────────────────────────────────────────
# 3. Postgres — dump DEPUIS le conteneur (client et serveur de même version)
# ─────────────────────────────────────────────────────────────────────────────
log "Dump PostgreSQL"

# On lit ZETIS_DATABASE_URL depuis le .env racine ; sinon défauts de dev.
# ZETIS_DATABASE_URL = postgresql+psycopg://user:pass@host:port/dbname
# On retire le driver SQLAlchemy (+psycopg) puis on extrait user et dbname.
DBURL="$(grep -hE '^[[:space:]]*ZETIS_DATABASE_URL=' "$ROOT/.env" 2>/dev/null \
         | tail -1 | cut -d= -f2- | tr -d '"'"'"' ' || true)"
CLEAN="$(printf '%s' "$DBURL" | sed -E 's|^postgresql\+[a-z0-9]+://|postgresql://|; s|\?.*$||')"
PGUSER="$(printf '%s' "$CLEAN" | sed -n 's|^postgresql://\([^:@/]*\).*|\1|p')"
PGDB="$(printf '%s' "$CLEAN"  | sed -n 's|.*/\([^/?]*\)$|\1|p')"
PGUSER="${PGUSER:-zetis}"
PGDB="${PGDB:-zetis}"

# Nom du service compose qui porte Postgres (postgres | db | …)
PGSVC="$(docker compose config --services | grep -E '^(postgres|db|pg)$' | head -1 || true)"
PGSVC="${PGSVC:-postgres}"

docker compose up -d "$PGSVC" >/dev/null
for i in $(seq 1 60); do
  docker compose exec -T "$PGSVC" pg_isready -U "$PGUSER" >/dev/null 2>&1 && break
  sleep 1
  [[ $i -eq 60 ]] && { echo "❌ Postgres ne répond pas"; exit 1; }
done

docker compose exec -T "$PGSVC" pg_dump -U "$PGUSER" -d "$PGDB" -Fc --no-owner --no-privileges \
  > "$DEST/db/zetis.dump"
# Un second dump en SQL lisible : inutile pour restaurer, précieux pour diagnostiquer.
docker compose exec -T "$PGSVC" pg_dump -U "$PGUSER" -d "$PGDB" --schema-only \
  > "$DEST/db/zetis.schema.sql"
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -Atc \
  "select version()" > "$DEST/db/PG_VERSION.txt"

{ echo; echo "## postgres"; echo "service : $PGSVC"; echo "user/db : $PGUSER/$PGDB";
  echo "version : $(cat "$DEST/db/PG_VERSION.txt")"; } >> "$INV"

ok "db/zetis.dump ($(du -h "$DEST/db/zetis.dump" | cut -f1)) — user=$PGUSER db=$PGDB"
[[ -s "$DEST/db/zetis.dump" ]] || { echo "❌ Dump vide !"; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
# 4. MinIO + Redis — les volumes nommés ne sont pas des dossiers du Mac.
#    On monte le volume dans un conteneur jetable pour en sortir un tar.
# ─────────────────────────────────────────────────────────────────────────────
log "Archivage des volumes Docker"
PROJ="$(basename "$ROOT" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
VOLS="$(docker volume ls -q --filter "name=${PROJ}_" 2>/dev/null || true)"
if [ -z "$VOLS" ]; then
  # repli : les volumes déclarés dans compose, préfixés par le nom de projet
  VOLS="$(docker compose config --volumes 2>/dev/null | sed "s|^|${PROJ}_|")"
fi
nvol=0
while IFS= read -r v; do
  [ -n "$v" ] || continue
  docker volume inspect "$v" >/dev/null 2>&1 || continue
  echo "   $v"
  docker run --rm -v "$v":/src:ro -v "$DEST/minio":/out alpine \
    tar czf "/out/${v}.tar.gz" -C /src . 2>/dev/null
  nvol=$((nvol + 1))
done <<< "$VOLS"
if [ "$nvol" -eq 0 ]; then
  warn "Aucun volume archivé — vérifie 'docker volume ls' et le nom de projet compose."
else
  ls -lh "$DEST/minio" | tail -n +2
fi
{ echo; echo "## volumes"; echo "$VOLS"; } >> "$INV"

# Cas bind-mount : ./storage à la racine du projet
if [[ -d "$ROOT/storage" ]]; then
  log "Copie de storage/"
  rsync -a "$ROOT/storage/" "$DEST/storage/"
  ok "storage/ ($(du -sh "$DEST/storage" | cut -f1))"
fi

# ─────────────────────────────────────────────────────────────────────────────
# 5. Le dépôt — .git compris, dérivés exclus (ils se régénèrent, et un .venv
#    copié embarque les chemins absolus de CETTE machine : il casserait).
# ─────────────────────────────────────────────────────────────────────────────
if [ "$NOREPO" -eq 1 ]; then
  log "Dépôt NON copié (--no-repo) — il sera tiré directement par rsync réseau"
  rmdir "$DEST/repo" 2>/dev/null || true
else
log "Copie du dépôt (sans node_modules / .venv / dist)"
rsync -aH $RSPROG \
  --exclude 'node_modules/' \
  --exclude '.venv/' \
  --exclude '__pycache__/' \
  --exclude '.pytest_cache/' \
  --exclude '.ruff_cache/' \
  --exclude 'dist/' \
  --exclude 'build/' \
  --exclude '.turbo/' \
  --exclude 'graphify-out/' \
  --exclude '.DS_Store' \
  "$ROOT/" "$DEST/repo/zetis/"

ok "repo copié ($(du -sh "$DEST/repo/zetis" | cut -f1))"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
ok "EXPORT TERMINÉ → $DEST"
du -sh "$DEST"/* 2>/dev/null
echo
echo "Étape suivante : éjecte proprement le T5, branche-le sur le Mac Studio,"
echo "puis lance zetis-import.sh depuis /Volumes/T5/zetis."
