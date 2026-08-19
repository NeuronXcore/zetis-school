#!/usr/bin/env bash
# audit_contexte.sh — rend mécaniquement visibles les écarts entre ce que les fichiers
# de contexte de ZETIS affirment et ce que le dépôt contient réellement.
#
# Usage : bash scripts/audit_contexte.sh [sha-de-reprise]
#
# Ce script ne corrige rien et n'écrit rien : il produit la liste des endroits où
# regarder. Le tri (FAUX / MANQUANT / PÉRIMÉ) et la correction restent un travail de
# lecture — le script sert à ne pas le commencer à l'aveugle sur un dépôt de cette taille.
#
# Compatible bash 3.2 (macOS).

set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

DEPUIS="${1:-}"
SEUIL_JOURS=21   # au-delà, un fichier froid mérite au moins un coup d'œil

titre() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

# --- 1. Arborescence réelle vs arborescence annoncée -------------------------
titre "1. Arborescence : présent sur disque, absent de la doc"
for d in apps/*/ packages/*/; do
  [ -d "$d" ] || continue
  nom="${d%/}"
  court="$(basename "$nom")"
  manquants=""
  for doc in CLAUDE.md PROJECT_STRUCTURE.md ARCHITECTURE.md; do
    [ -f "$doc" ] || continue
    grep -q "$court" "$doc" || manquants="$manquants $doc"
  done
  [ -n "$manquants" ] && echo "  $nom — non mentionné dans :$manquants"
done

titre "1bis. Arborescence : annoncée dans CLAUDE.md, absente du disque"
if [ -f CLAUDE.md ]; then
  sed -n '/^apps\//p;/^packages\//p' CLAUDE.md | sort -u | while read -r chemin; do
    [ -e "$chemin" ] || echo "  $chemin — annoncé, introuvable"
  done
fi

# --- 2. Index des décisions --------------------------------------------------
titre "2. ADR sur disque vs index DECISIONS.md (généré)"
if [ -d docs/decisions ] && [ -f DECISIONS.md ]; then
  nb_fichiers=$(ls -1 docs/decisions/adr-*.md 2>/dev/null | wc -l | tr -d ' ')
  absents=0
  for f in docs/decisions/adr-*.md; do
    [ -f "$f" ] || continue
    if ! grep -q "$(basename "$f")" DECISIONS.md; then
      echo "  $(basename "$f") — absent de l'index"
      absents=$((absents + 1))
    fi
  done
  echo "  → $nb_fichiers ADR sur disque, $absents absent(s) de l'index"
  [ "$absents" -gt 0 ] && echo "  → NE PAS éditer DECISIONS.md : lancer scripts/gen_decisions_index.py"
fi

# --- 3. Commandes documentées vs outillage réel ------------------------------
titre "3. Commandes : gestionnaire de paquets contredit par le dépôt"
if [ -f pnpm-workspace.yaml ] || [ -f pnpm-lock.yaml ]; then
  grep -rn --include='*.md' -E '^\s*(npm|yarn) (install|run|i)\b' . \
    --exclude-dir=node_modules --exclude-dir=graphify-out --exclude-dir=.git 2>/dev/null \
    | head -20 | sed 's/^/  /'
  echo "  (dépôt en pnpm : toute commande npm/yarn ci-dessus est à vérifier)"
fi

titre "3bis. Scripts package.json jamais documentés"
if [ -f package.json ]; then
  sed -n '/"scripts"/,/^  }/p' package.json \
    | grep -oE '"[a-z][a-z:.-]*":' | sed 's/"//g; s/:$//' | while read -r s; do
      [ "$s" = "scripts" ] && continue
      grep -rqs --include='*.md' --exclude-dir=node_modules --exclude-dir=.git \
        --exclude-dir=graphify-out "pnpm $s" . || echo "  pnpm $s — jamais documenté"
    done
fi

# --- 4. Fichiers froids : ancienneté -----------------------------------------
titre "4. Fichiers de contexte non touchés depuis plus de $SEUIL_JOURS jours"
LIMITE=$(( $(date +%s) - SEUIL_JOURS * 86400 ))
for f in *.md docs/*.md; do
  [ -f "$f" ] || continue
  case "$f" in MEMORY.md|CHANGELOG.md|TROUBLESHOOTING.md) continue ;; esac  # gérés par /cloture
  ts=$(git log -1 --format=%at -- "$f" 2>/dev/null)
  [ -z "$ts" ] && continue
  if [ "$ts" -lt "$LIMITE" ]; then
    printf '  %-34s %s\n' "$f" "$(git log -1 --format='%ad (%h)' --date=short -- "$f")"
  fi
done

# --- 5. Reliquats ------------------------------------------------------------
titre "5. Reliquats et sauvegardes oubliées"
# Chercher dans l'arbre de travail et pas seulement dans l'index : un reliquat est
# souvent non suivi (donc invisible à git ls-files) tout en restant sous les yeux de
# celui qui ouvre le dossier — c'est précisément ce qui le rend trompeur.
{ git ls-files; find . -maxdepth 2 -type f \
    -not -path './node_modules/*' -not -path './.git/*' -not -path './graphify-out/*' \
    | sed 's|^\./||'; } \
  | grep -Ei '\.(bak|old|orig)|\.bak-|-old\.|copie|[-_]copy' | sort -u | sed 's/^/  /' || true

# --- 6. Ce qui a bougé depuis la dernière passe ------------------------------
titre "6. Commits depuis la dernière passe"
if [ -n "$DEPUIS" ] && git cat-file -e "${DEPUIS}^{commit}" 2>/dev/null; then
  PLAGE="${DEPUIS}..HEAD"
  echo "  plage : $PLAGE"
  git log "$PLAGE" --no-merges --format='  %h %ad %s' --date=short | head -60
  echo
  echo "  répertoires touchés :"
  git log "$PLAGE" --name-only --format='' --no-merges | grep -v '^$' \
    | cut -d/ -f1 | sort | uniq -c | sort -rn | head -15 | sed 's/^/  /'
else
  echo "  (aucun marqueur fourni — repli sur 7 jours)"
  git log --since='7 days ago' --no-merges --format='  %h %ad %s' --date=short | head -60
fi

titre "Fin de l'audit"
echo "Rappel : ce script signale, il ne tranche pas. Vérifier chaque point avant correction."
