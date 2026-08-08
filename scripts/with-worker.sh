#!/usr/bin/env bash
# Lance le worker de production EN PLUS de la commande passée en argument, et l'arrête avec elle.
#
#   bash scripts/with-worker.sh <commande…>
#
# ## Pourquoi ce script existe (ADR-0046, slice B)
#
# `scripts/dev.sh` lançait déjà le worker depuis le 2026-08-05. La panne est quand même revenue le
# 2026-08-08 — parce qu'une SECONDE porte d'entrée est née à côté : les paires de
# `.claude/launch.json`, qui démarrent un backend sans passer par `dev.sh`. Le correctif était
# attaché à une porte ; il n'a pas survécu à l'ouverture d'une autre.
#
# Ce script est ce que les entrées backend de `launch.json` appellent pour hériter du worker.
#
# ⚠️ **Il n'y a AUCUN risque à l'appeler cinq fois** : le module refuse de démarrer si un worker
# tourne déjà (`workers_deja_actifs`, dans `app/production_worker.py`) et écrit le pid trouvé.
# C'est ce garde-fou qui autorise « une entrée backend = un worker » sans produire cinq workers —
# la Décision 4 de l'ADR-0046 a été amendée en ce sens le 2026-08-08, `launch.json` n'ayant aucune
# forme pour un processus sans port.
#
# ⚠️ `kill` au lieu d'un détachement : un worker ORPHELIN continuerait de consommer la file avec
# l'ancien code, ce qui est pire qu'un worker absent — « ça marche presque ». Même motif que le
# `trap` de `dev.sh`.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

("$ROOT/apps/backend/.venv/bin/python" -m app.production_worker) &
WORKER_PID=$!
# `|| true` : si le worker a refusé de démarrer (un autre tournait), ce pid est déjà mort et le
# kill échouerait — ce n'est pas une erreur, c'est le cas nominal à partir du deuxième appel.
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT INT TERM

# Pas d'`exec` : il remplacerait ce shell et emporterait le trap avec lui, laissant le worker
# orphelin — exactement ce que la ligne du dessus empêche.
"$@"
