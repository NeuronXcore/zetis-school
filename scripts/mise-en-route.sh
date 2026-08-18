#!/usr/bin/env bash
# Met une NOUVELLE MACHINE en état de développer ZETIS — idempotent, relançable.
#
# ╭─ POURQUOI IL EXISTE ──────────────────────────────────────────────────────╮
# │ ZETIS se développe sur deux machines (Mac Studio + MacBook). Le dépôt ne  │
# │ porte PAS tout : l'outillage s'installe hors de Git, et le 2026-08-18 la  │
# │ mise en route a buté DEUX FOIS sur le même piège — un binaire installé    │
# │ mais introuvable. `uv tool install` pose graphify dans ~/.local/bin, que  │
# │ aucun profil zsh ne déclarait ; `gh` était dans le Cellar de brew depuis  │
# │ juillet mais NON LIÉ. Dans les deux cas : « command not found » sur un    │
# │ outil réellement présent.                                                 │
# │                                                                           │
# │ 🔴 Ce script INSTALLE, puis VÉRIFIE que chaque commande RÉPOND. Un        │
# │ installeur qui ne vérifie pas rend un faux positif — c'est exactement ce  │
# │ qui a coûté la journée.                                                    │
# ╰───────────────────────────────────────────────────────────────────────────╯
#
#     scripts/mise-en-route.sh
#
# Ce qu'il ne peut PAS faire, et qu'il ÉNUMÈRE à la fin plutôt que de le taire :
# `gh auth login` (interactif), les secrets du `.env`, et l'autostart de Docker Desktop.
set -u

RACINE=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "✖ pas dans un dépôt git"; exit 1; }
cd "$RACINE"

VERT=$'\e[32m'; ROUGE=$'\e[31m'; JAUNE=$'\e[33m'; GRAS=$'\e[1m'; FIN=$'\e[0m'
etape() { echo; echo "${GRAS}▶ $*${FIN}"; }
ok()    { echo "  ${VERT}✓${FIN} $*"; }
alerte(){ echo "  ${JAUNE}⚠${FIN} $*"; }
echec() { echo "  ${ROUGE}✖${FIN} $*"; }

# ⚠️ bash 3.2 (celui de macOS) + `set -u` : l'expansion d'un tableau VIDE — `"${TAB[@]}"` — est une
# « unbound variable », pas un tableau vide. Mesuré le 2026-08-18 : ce script a planté sur sa propre
# dernière ligne, dans le cas où TOUT allait bien. On compte donc toujours avant d'expanser.
RESTE=()   # ce que l'humain devra faire lui-même
MANQUE=()  # ce qui a échoué

lister() {  # lister <nom-du-tableau> — sûr sur un tableau vide
  local n=$1; shift
  [ "$n" -eq 0 ] && return 0
  for e in "$@"; do echo "  • $e"; done
}

[ "$(uname -s)" = "Darwin" ] || alerte "conçu pour macOS — sur un autre système, lis-le avant de le croire."

etape "1/7 Prérequis (brew, uv, pnpm)"
for outil in brew uv pnpm; do
  if command -v "$outil" >/dev/null 2>&1; then
    ok "$outil — $(command -v "$outil")"
  else
    case "$outil" in
      brew) echec "brew absent — installe-le d'abord : https://brew.sh"; MANQUE+=("brew") ;;
      *)    echo "  installation de $outil…"; brew install "$outil" >/dev/null 2>&1 \
              && ok "$outil installé" || { echec "échec de l'installation de $outil"; MANQUE+=("$outil"); } ;;
    esac
  fi
done

etape "2/7 graphify (obligatoire — CLAUDE.md l'impose)"
# 🔴 Le paquet PyPI s'appelle `graphifyy`, avec DEUX y. `pip install graphify` sans le second
# n'est PAS ce paquet — la fiche PyPI de `graphifyy` pointe vers Graphify-Labs/graphify.
if command -v uv >/dev/null 2>&1; then
  uv tool install graphifyy >/dev/null 2>&1 || uv tool upgrade graphifyy >/dev/null 2>&1 || true
  uv tool update-shell >/dev/null 2>&1 || true
  # ⚠️ `update-shell` écrit dans un profil : le shell COURANT ne le voit pas. On teste le chemin réel.
  if command -v graphify >/dev/null 2>&1; then
    ok "graphify — $(graphify --version 2>/dev/null | head -1)"
  elif [ -x "$HOME/.local/bin/graphify" ]; then
    alerte "graphify est installé mais PAS dans le PATH de ce shell."
    alerte "  → ouvre un NOUVEAU terminal (uv tool update-shell a écrit dans ton profil)."
  else
    echec "graphify introuvable après installation"; MANQUE+=("graphify")
  fi
fi

etape "3/7 gh (le workflow de ce dépôt est bâti sur les PR)"
# 🔴 Piège mesuré : `brew install gh` peut répondre « already installed » alors que le binaire
# n'est pas LIÉ. On relance quand même, puis on vérifie que la commande répond.
brew install gh >/dev/null 2>&1 || brew link --overwrite gh >/dev/null 2>&1 || true
if command -v gh >/dev/null 2>&1; then
  ok "gh — $(gh --version 2>/dev/null | head -1)"
  if gh auth status >/dev/null 2>&1; then ok "gh est authentifié"
  else RESTE+=("gh auth login   — flux interactif, personne ne peut le faire à ta place"); fi
else
  echec "gh introuvable"; MANQUE+=("gh")
fi

etape "4/7 Dépendances du projet"
if command -v pnpm >/dev/null 2>&1; then
  pnpm install --silent >/dev/null 2>&1 && ok "pnpm install" || { echec "pnpm install"; MANQUE+=("pnpm install"); }
fi
if command -v uv >/dev/null 2>&1; then
  [ -d apps/backend/.venv ] || uv venv --python 3.12 apps/backend/.venv >/dev/null 2>&1
  uv pip install --python apps/backend/.venv -e "apps/backend[dev]" >/dev/null 2>&1 \
    && ok "backend : venv + .[dev]" || { echec "installation du backend"; MANQUE+=("backend .[dev]"); }
fi

etape "5/7 Le hook pre-push"
# Il est un SYMLINK vers hooks/pre-push : il ne vient pas avec le clone, et sans lui la machine
# pousse sans filet. C'est écrit dans l'en-tête de .github/workflows/ci.yml.
if [ -e .git/hooks/pre-push ]; then
  ok "pre-push déjà posé"
else
  ln -s ../../hooks/pre-push .git/hooks/pre-push && ok "pre-push lié" \
    || { echec "impossible de lier le hook"; MANQUE+=("pre-push"); }
fi

etape "6/7 Le .env"
# 🔴 JAMAIS de secrets dans Git (CLAUDE.md > Règles sécurité). Ce script ne peut donc PAS
# le remplir : il prépare le fichier et NOMME ce qui manque, il n'invente rien.
if [ -f .env ]; then
  ok ".env présent — laissé intact"
else
  cp .env.example .env && alerte ".env créé depuis .env.example — les VALEURS sont des exemples."
  RESTE+=("remplir .env : ANTHROPIC_API_KEY et POSTGRES_PASSWORD (à recopier depuis l'autre machine, hors Git)")
fi

etape "7/7 La carte Graphify"
# `graphify-out/` est gitignoré (42 Mo) : la carte ne voyage pas, elle se reconstruit par machine.
if command -v graphify >/dev/null 2>&1; then
  echo "  construction (~2 min sur un clone neuf, AST local, aucune clé API)…"
  graphify update . >/dev/null 2>&1 && ok "carte construite" || { echec "graphify update"; MANQUE+=("carte"); }
else
  RESTE+=("graphify update .   — dans un nouveau terminal, une fois le PATH rechargé")
fi

echo; echo "════════════════════════════════════════════════════════════"
if [ ${#MANQUE[@]} -eq 0 ]; then
  echo "${VERT}${GRAS}Machine prête.${FIN} Vérifie par : cd apps/backend && .venv/bin/python -m pytest -q"
else
  echo "${ROUGE}${GRAS}Incomplet — ${#MANQUE[@]} élément(s) en échec :${FIN}"
  for m in "${MANQUE[@]}"; do echo "  ✖ $m"; done
fi

echo
echo "${GRAS}Ce que ce script ne peut PAS faire à ta place :${FIN}"
lister "${#RESTE[@]}" ${RESTE[@]+"${RESTE[@]}"}
echo "  • Docker Desktop → Settings → General → « Start Docker Desktop when you sign in »"
echo "    (sans ça, les 'restart: unless-stopped' de la prod ne s'appliquent jamais)"
echo "  • si un disque externe porte le projet, vérifier qu'il est monté AVANT le démon Docker"
