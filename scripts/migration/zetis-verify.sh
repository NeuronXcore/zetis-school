#!/bin/bash
# (bash 3.2 de macOS compatible)
#
# zetis-verify.sh — contrôle post-migration de ZETIS sur le Mac Studio
#
#   Usage :  cd /Volumes/NX-Projects/ZETIS && /Volumes/NX-Projects/zetis-verify.sh
#
# LECTURE SEULE : ce script ne modifie rien, ni la base, ni les fichiers.
# Il répond à une seule question : « les données du MacBook sont-elles vraiment ici ? »
#
set -uo pipefail

ROOT="$(pwd)"
[ -f "$ROOT/docker-compose.yml" ] || {
  echo "❌ Lance ce script depuis /Volumes/NX-Projects/ZETIS"; exit 1; }

log()  { printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
bad()  { printf '\033[1;31m✗ %s\033[0m\n' "$*"; }

PGSVC="$(docker compose config --services 2>/dev/null | grep -E '^(postgres|db|pg)$' | head -1)"
PGSVC="${PGSVC:-postgres}"
PGUSER=zetis
PGDB=zetis

# q <requete> : exécute et renvoie une valeur brute (sans en-tête ni bordure)
q() { docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -Atc "$1" 2>/dev/null | tr -d '\r'; }

echo "════════════════════════════════════════════════════════"
echo " Vérification ZETIS — $ROOT"
echo "════════════════════════════════════════════════════════"

# ─────────────────────────────────────────────────────────────────────────────
log "1 · Conteneurs"
docker compose ps

# ─────────────────────────────────────────────────────────────────────────────
log "2 · Structure de la base"
T="$(q "select count(*) from information_schema.tables where table_schema='public'")"
V="$(q "select extversion from pg_extension where extname='vector'")"
A="$(q "select version_num from alembic_version")"

case "$T" in
  ''|*[!0-9]*) bad "base injoignable ou vide — arrêt des contrôles SQL" ; SQLOK=0 ;;
  *) if [ "$T" -gt 0 ]; then ok "tables : $T"; SQLOK=1; else bad "aucune table"; SQLOK=0; fi ;;
esac

[ -n "$V" ] && ok "pgvector : $V" || bad "pgvector ABSENT → la recherche RAG ne fonctionnera pas"
[ -n "$A" ] && ok "alembic  : $A" || warn "table alembic_version absente"

# ─────────────────────────────────────────────────────────────────────────────
if [ "${SQLOK:-0}" = "1" ]; then
log "3 · Volumétrie — les données ont-elles suivi ?"
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -c "
select 'users'            as objet, count(*) as lignes from users
union all select 'student_profiles', count(*) from student_profiles
union all select 'xp_events',        count(*) from xp_events
union all select 'capsules',         count(*) from capsules
union all select 'fiches',           count(*) from fiches
union all select 'quizzes',          count(*) from quizzes
union all select 'rag_documents',    count(*) from rag_documents
union all select 'rag_chunks',       count(*) from rag_chunks
order by 1"

# ─────────────────────────────────────────────────────────────────────────────
log "4 · Utilisateurs et XP recalculé"
# L'XP n'est pas stocké : il est la somme des événements de xp_events.
# Chaîne de clés étrangères : xp_events.student_id → student_profiles.id → users.id
docker compose exec -T "$PGSVC" psql -U "$PGUSER" -d "$PGDB" -c "
select u.id, u.email, u.name, u.role,
       count(x.id) as evenements,
       coalesce(sum(x.amount), 0) as xp_total
from users u
left join student_profiles sp on sp.user_id = u.id
left join xp_events x        on x.student_id = sp.id
group by u.id, u.email, u.name, u.role
order by u.id"
fi

# ─────────────────────────────────────────────────────────────────────────────
log "5 · MinIO — les fichiers sont-ils là ?"
docker compose exec -T minio sh -c 'du -sh /data/* 2>/dev/null' 2>/dev/null \
  || warn "conteneur minio injoignable ou /data vide"

# ─────────────────────────────────────────────────────────────────────────────
log "6 · Backend HTTP"
if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
  ok "http://localhost:8000/health répond :"
  curl -s http://localhost:8000/health; echo
else
  warn "backend non démarré — normal tant que 'pnpm dev' ne tourne pas"
fi

# ─────────────────────────────────────────────────────────────────────────────
echo
echo "════════════════════════════════════════════════════════"
cat <<'EOF'
Lecture des résultats :

  • tables ≈ 47, pgvector présent, alembic renseigné  → schéma OK
  • xp_events > 0 et rag_chunks > 0                   → DONNÉES OK
  • un utilisateur avec un xp_total non nul           → migration validée

Si tout est vert, étape suivante :

  pnpm dev

puis, dans le navigateur, les contrôles fonctionnels :
  connexion, ouverture d'une capsule (MinIO), recherche RAG (pgvector),
  génération d'un ELI5 (Ollama).

Le MacBook reste intact tant que ces contrôles ne sont pas passés.
EOF
echo "════════════════════════════════════════════════════════"
