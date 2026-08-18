#!/bin/bash
# (bash 3.2 de macOS compatible)
#
# zetis-pull.sh — tire ZETIS du MacBook vers le Mac Studio, par le réseau
#
#   ./zetis-pull.sh atlas@MacBook-de-ATLAS.local /Users/atlas/chemin/vers/zetis
#
# À lancer DEPUIS LE MAC STUDIO. Le MacBook doit avoir « Connexion à distance »
# activée (Réglages Système → Général → Partage) et Docker Desktop démarré.
#
# Rejouable autant de fois que tu veux : c'est l'outil de la répétition (temps B)
# ET celui de la bascule (temps C). Rien n'est modifié sur le MacBook.
#
set -euo pipefail

REMOTE="${1:-}"; RPATH="${2:-}"
[ -n "$REMOTE" ] && [ -n "$RPATH" ] || {
  echo "Usage: $0 <user@hote> <chemin-du-projet-sur-le-macbook>"; exit 1; }

DEST_ROOT="${DEST_ROOT:-/Volumes/NX-Projects}"
PROJ="$DEST_ROOT/ZETIS"

# 🔴 macOS 26 livre openrsync (protocole 29, « rsync 2.6.9 compatible »), qui REFUSE
# --info=progress2 : le rapatriement du 2026-08-17 a échoué en plein transfert. Le contournement
# appliqué ce jour-là — `brew install rsync` — ne tient pas sur une machine sans Homebrew, et le
# Mac Studio neuf est exactement ce cas. Détection reprise telle quelle de `zetis-export.sh`, qui
# la portait déjà : le défaut n'était pas de ne pas savoir, c'était de ne pas l'avoir portée ici.
if rsync --info=progress2 --version >/dev/null 2>&1; then RSPROG="--info=progress2"; else RSPROG="--progress"; fi

log()  { printf '\033[1;36m▸ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m⚠ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }

[ -d "$DEST_ROOT" ] || { echo "❌ $DEST_ROOT n'est pas monté"; exit 1; }

# ── 1. Le MacBook répond ? ───────────────────────────────────────────────────
log "Connexion à $REMOTE"
ssh -o ConnectTimeout=8 -o BatchMode=yes "$REMOTE" "true" 2>/dev/null || {
  echo "❌ SSH échoue en mode non-interactif."
  echo "   • Réglages Système → Général → Partage → Connexion à distance (sur le MacBook)"
  echo "   • puis, une fois pour toutes :  ssh-copy-id $REMOTE"
  exit 1; }
ok "SSH OK"

ssh "$REMOTE" "[ -f '$RPATH/docker-compose.yml' ]" || {
  echo "❌ $RPATH ne ressemble pas à la racine du projet (pas de docker-compose.yml)"; exit 1; }
STAMP="$(ssh "$REMOTE" "date +%F-%H%M")"
ok "projet trouvé — horodatage $STAMP"

# Avertir si du travail n'est pas commité : on copie tel quel, autant le savoir.
DIRTY="$(ssh "$REMOTE" "cd '$RPATH' && git status --porcelain 2>/dev/null | wc -l | tr -d ' '")"
[ "${DIRTY:-0}" != "0" ] && warn "$DIRTY fichier(s) non commité(s) sur le MacBook — copiés tels quels"

# ── 2. Export distant (base, volumes, secrets) — sans le dépôt ───────────────
# --no-repo : inutile de dupliquer le code sur le MacBook, rsync le tire en direct.
log "Export distant (dump Postgres + volumes + .env)"
REXP="/tmp/zetis-export-$STAMP"
scp -q "$(dirname "$0")/zetis-export.sh" "$REMOTE:/tmp/zetis-export.sh"
ssh -t "$REMOTE" "chmod +x /tmp/zetis-export.sh && cd '$RPATH' && /tmp/zetis-export.sh --no-repo '$REXP'"
ok "export distant terminé"

# ── 3. Rapatrier l'export ────────────────────────────────────────────────────
LOCAL_EXP="$DEST_ROOT/zetis-migration-$STAMP"
log "Rapatriement de l'export → $LOCAL_EXP"
rsync -aH $RSPROG "$REMOTE:$REXP/" "$LOCAL_EXP/"
ok "$(du -sh "$LOCAL_EXP" | cut -f1) rapatriés"

# ── 3 bis. GARDE-FOU — ne jamais écraser du travail fait ici ─────────────────
# rsync --delete est destructeur. Tant que le Studio n'était qu'une cible de
# migration, c'était l'effet voulu. Dès qu'on code des DEUX côtés, ça devient
# une perte de données silencieuse. On refuse plutôt que de deviner.
if [ -d "$PROJ/.git" ]; then
  LOCAL_HEAD="$(git -C "$PROJ" rev-parse HEAD 2>/dev/null || echo none)"
  REMOTE_HEAD="$(ssh "$REMOTE" "git -C '$RPATH' rev-parse HEAD 2>/dev/null" || echo none)"
  LOCAL_DIRTY="$(git -C "$PROJ" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
  if [ "$LOCAL_DIRTY" != "0" ] || { [ "$LOCAL_HEAD" != "none" ] && [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ]; }; then
    echo
    warn "Le dépôt du Studio a divergé de celui du MacBook."
    [ "$LOCAL_DIRTY" != "0" ] && echo "   • $LOCAL_DIRTY fichier(s) modifié(s) ici, non commité(s)"
    [ "$LOCAL_HEAD" != "$REMOTE_HEAD" ] && echo "   • HEAD ici $LOCAL_HEAD ≠ HEAD MacBook $REMOTE_HEAD"
    cat <<'MSG'

   rsync --delete écraserait ce travail sans le dire. Refus.

   Si tu codes désormais sur les deux machines, ce script n'est plus le bon
   outil : passe par git (dépôt nu sur NX-Projects, cf. runbook §11).
   Si tu es sûr de vouloir écraser le Studio :  FORCE=1 <la même commande>
MSG
    [ "${FORCE:-0}" = "1" ] || exit 1
    warn "FORCE=1 — on écrase quand même."
  fi
fi

# ── 4. Rapatrier le dépôt, en direct ─────────────────────────────────────────
# Les dérivés sont exclus : ils se régénèrent, et un .venv copié embarque les
# chemins absolus du MacBook — il casserait ici.
log "Rapatriement du dépôt → $PROJ"
mkdir -p "$PROJ"
rsync -aH --delete $RSPROG \
  --exclude 'node_modules/' --exclude '.venv/' --exclude '__pycache__/' \
  --exclude '.pytest_cache/' --exclude '.ruff_cache/' --exclude 'dist/' \
  --exclude 'build/' --exclude '.turbo/' --exclude 'graphify-out/' \
  --exclude '.DS_Store' \
  "$REMOTE:$RPATH/" "$PROJ/"
ok "dépôt à jour ($(du -sh "$PROJ" | cut -f1))"

# ── 4 bis. L'historique des sauvegardes, qui vit HORS du dépôt ───────────────
# ~/zetis-backups n'est ni dans git ni dans le projet : sans ça, il resterait
# sur le MacBook. Petit et précieux — c'est la mémoire des états antérieurs.
if ssh "$REMOTE" "[ -d ~/zetis-backups ]"; then
  log "Rapatriement de ~/zetis-backups"
  mkdir -p "$DEST_ROOT/zetis-backups"
  rsync -aH "$REMOTE:~/zetis-backups/" "$DEST_ROOT/zetis-backups/"
  ok "$(ls -1 "$DEST_ROOT/zetis-backups" | wc -l | tr -d ' ') dump(s) — $(du -sh "$DEST_ROOT/zetis-backups" | cut -f1)"
fi

# ── 5. Ménage côté MacBook ───────────────────────────────────────────────────
ssh "$REMOTE" "rm -rf '$REXP' /tmp/zetis-export.sh" && ok "temporaires distants nettoyés"

cat <<EOM

Prochaine étape, ici même :

  cd $PROJ
  $DEST_ROOT/zetis-import.sh $LOCAL_EXP

EOM
