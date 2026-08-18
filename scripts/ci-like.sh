#!/bin/bash
# Rejoue la suite frontend DANS LES CONDITIONS DE LA CI, en boucle, pour débusquer l'instable.
#
# ╭─ POURQUOI IL EXISTE ──────────────────────────────────────────────────────╮
# │ Le 2026-08-17, la CI a rougi sur un commit qui ne pouvait pas la casser,   │
# │ puis reverdi sur le SHA IDENTIQUE. Trois tentatives de reproduction en    │
# │ local ont rendu 920/920 vert — y compris avec 2 workers et la machine     │
# │ saturée. L'écart n'était ni la charge ni le parallélisme : c'était        │
# │ **Node 20 + Linux**, et surtout le TEMPS ÉCOULÉ avant qu'un fichier ne    │
# │ démarre. Ce script recrée les trois d'un coup.                            │
# ╰───────────────────────────────────────────────────────────────────────────╯
#
#     scripts/ci-like.sh [passages] [app]  # défauts : 4, frontend-massimo
#
# 🔴 L'APP EST UN PARAMÈTRE DEPUIS LE 2026-08-18, et le motif compte : le script ne savait rejouer
# que Massimo (`cd apps/frontend-massimo` en dur). Or la CI de la PR #146 est tombée sur **Papa**
# (`AnneesScolairesPage`). L'outil de reproduction ne voyait donc pas la panne qu'on lui demandait
# de reproduire — un instrument aveugle à la moitié du parc.
#
# ⚠️ Il ne touche PAS aux `node_modules` de la machine : le dépôt est monté en LECTURE SEULE, copié
# dans le conteneur, et les dépendances y sont réinstallées (les binaires natifs de rollup/esbuild
# sont propres à darwin — sans cette copie, vitest ne démarre même pas).
#
# 🔴 **L'absence de « FAIL » ne prouve rien.** Un passage n'est vert que s'il a COMPTÉ des tests :
# le premier harnais écrit ce jour-là portait des drapeaux invalides et a rendu six « verts »
# d'affilée sans lancer un seul test. D'où le contrôle « RIEN MESURÉ » ci-dessous.
set -u
RACINE=$(git rev-parse --show-toplevel) || exit 1
PASSAGES=${1:-4}
APP=${2:-frontend-massimo}

case "$APP" in
  frontend-massimo|frontend-papa) ;;
  *) echo "app inconnue : $APP (attendu : frontend-massimo | frontend-papa)" >&2; exit 2 ;;
esac

exec docker run --rm --cpus=2 -v "$RACINE":/src:ro -w /w node:20 bash -c "
set -e
mkdir -p /w && cd /src
tar --exclude=node_modules --exclude=.git --exclude=graphify-out -cf - . | (cd /w && tar -xf -)
cd /w && corepack enable >/dev/null 2>&1
echo '=== installation des dépendances (linux) ==='
pnpm install --frozen-lockfile --silent >/dev/null 2>&1
echo \"=== node \$(node --version) ===\"
cd apps/$APP
echo \"=== app : $APP ===\"
rouges=0
for i in \$(seq 1 $PASSAGES); do
  out=\$(./node_modules/.bin/vitest run --reporter=dot 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  res=\$(echo \"\$out\" | grep -E '^ *Tests ' | tail -1)
  if [ -z \"\$res\" ]; then
    rouges=\$((rouges + 1)); echo \"passage \$i : ⛔ RIEN MESURÉ\"; echo \"\$out\" | tail -3
  else
    echo \"passage \$i : \$res\"
    echo \"\$out\" | grep -E '^ *FAIL |AssertionError|TestingLibraryElementError' | head -6
    echo \"\$out\" | grep -q 'FAIL ' && rouges=\$((rouges + 1))
  fi
done
echo \"════ \$rouges passage(s) rouge(s) sur $PASSAGES ════\"
"
