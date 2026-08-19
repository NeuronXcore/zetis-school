#!/usr/bin/env bash
# Certifie une CIBLE de sauvegarde — le seul rôle que l'hôte garde (ADR-0065 §3).
#
# ╭─ POURQUOI IL EXISTE ──────────────────────────────────────────────────────╮
# │ La règle « refuser si la cible et les données partagent un volume » est   │
# │ tenable, mais PAS depuis le conteneur : `diskutil` y est absent et le     │
# │ volume hôte inaccessible (mesuré le 2026-08-19). L'hôte, lui, lit les     │
# │ deux UUID. Ce script les écrit dans un CERTIFICAT posé DANS le répertoire │
# │ cible ; le backend refuse la sauvegarde (409, fail-closed) si le          │
# │ certificat manque, est illisible, ou si les UUID sont égaux.              │
# │                                                                           │
# │ 🔴 `Docker.raw` est localisé par sa PRÉSENCE RÉELLE, jamais cru sur       │
# │ parole : `settings-store.json` a déjà menti (sur `AutoStart`).            │
# ╰───────────────────────────────────────────────────────────────────────────╯
#
#     scripts/certifier-cible-sauvegarde.sh <répertoire cible> [dossier de Docker.raw]
#
# Exemple : scripts/certifier-cible-sauvegarde.sh /Volumes/NX-Models/zetis-sauvegardes
#
# Sorties : 0 = certifié, UUID distincts · 1 = échec (rien d'écrit) ·
#           2 = certificat écrit mais UUID IDENTIQUES — le backend refusera, et c'est voulu.
#
# ⚠️ Limite écrite en face (ADR-0065 §3) : le certificat prouve l'état AU MOMENT de la
# certification. Des disques réarrangés ensuite ne se voient pas depuis le conteneur —
# re-certifier après tout changement de disques.
#
# ⚠️ bash 3.2 (celui de macOS) : pas de tableaux associatifs, pas de ${var,,} — et on n'expanse
# jamais un tableau potentiellement vide (leçon de mise-en-route.sh, 2026-08-18).
set -u

VERT=$'\e[32m'; ROUGE=$'\e[31m'; JAUNE=$'\e[33m'; GRAS=$'\e[1m'; FIN=$'\e[0m'
ok()    { echo "  ${VERT}✓${FIN} $*"; }
alerte(){ echo "  ${JAUNE}⚠${FIN} $*"; }
echec() { echo "  ${ROUGE}✖${FIN} $*"; }

if [ $# -lt 1 ]; then
  echo "Usage : $0 <répertoire cible> [dossier de Docker.raw]" >&2
  exit 1
fi
CIBLE=$1
RAW_INDIQUE=${2:-}

command -v diskutil >/dev/null 2>&1 || { echec "diskutil introuvable — ce script tourne sur l'HÔTE macOS, jamais dans un conteneur."; exit 1; }

# ── Le volume d'un chemin, par son périphérique (df ne rend pas d'espaces en 1re colonne). ──────
uuid_du_chemin() {
  local chemin=$1 peripherique uuid
  peripherique=$(df -P "$chemin" | tail -1 | awk '{print $1}')
  [ -n "$peripherique" ] || return 1
  uuid=$(diskutil info "$peripherique" 2>/dev/null | sed -n 's/.*Volume UUID: *//p' | head -1)
  [ -n "$uuid" ] || return 1
  printf '%s' "$uuid"
}

echo "${GRAS}▶ Cible${FIN}"
mkdir -p "$CIBLE" || { echec "impossible de créer $CIBLE"; exit 1; }
UUID_CIBLE=$(uuid_du_chemin "$CIBLE") || { echec "UUID de volume illisible pour $CIBLE (diskutil)"; exit 1; }
ok "$CIBLE — Volume UUID $UUID_CIBLE"

# ── Docker.raw : candidats dans l'ordre, le premier dont le FICHIER existe gagne. ───────────────
echo "${GRAS}▶ Données (Docker.raw)${FIN}"
REGLAGES="$HOME/Library/Group Containers/group.com.docker/settings-store.json"
DOSSIER_DECLARE=""
if [ -r "$REGLAGES" ]; then
  # Extraction volontairement fruste (JSON une ligne) — la vérité est la PRÉSENCE du fichier.
  DOSSIER_DECLARE=$(sed -n 's/.*"DataFolder"*: *"\([^"]*\)".*/\1/p' "$REGLAGES" | head -1)
fi
DOCKER_RAW=""
for dossier in "$RAW_INDIQUE" "$DOSSIER_DECLARE" "$HOME/Library/Containers/com.docker.docker/Data/vms/0/data"; do
  [ -n "$dossier" ] || continue
  if [ -f "$dossier/Docker.raw" ]; then DOCKER_RAW="$dossier/Docker.raw"; break; fi
  if [ -f "$dossier" ] && [ "$(basename "$dossier")" = "Docker.raw" ]; then DOCKER_RAW="$dossier"; break; fi
done
if [ -z "$DOCKER_RAW" ]; then
  echec "Docker.raw introuvable (settings-store.json : « ${DOSSIER_DECLARE:-non déclaré} »)."
  echo "  Passez son dossier en 2e argument : $0 $CIBLE /Volumes/<X>/_docker/DockerDesktop"
  exit 1
fi
UUID_DONNEES=$(uuid_du_chemin "$DOCKER_RAW") || { echec "UUID de volume illisible pour $DOCKER_RAW"; exit 1; }
ok "$DOCKER_RAW — Volume UUID $UUID_DONNEES"

# ── Le certificat, DANS le répertoire cible (le backend le lit à travers le bind mount). ────────
echo "${GRAS}▶ Certificat${FIN}"
CERTIFICAT="$CIBLE/.zetis-cible.json"
DATE_UTC=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
printf '{\n  "uuid_cible": "%s",\n  "uuid_donnees": "%s",\n  "chemin_cible": "%s",\n  "chemin_docker_raw": "%s",\n  "certifie_le": "%s"\n}\n' \
  "$UUID_CIBLE" "$UUID_DONNEES" "$CIBLE" "$DOCKER_RAW" "$DATE_UTC" > "$CERTIFICAT" \
  || { echec "écriture impossible : $CERTIFICAT"; exit 1; }
ok "écrit : $CERTIFICAT"

if [ "$UUID_CIBLE" = "$UUID_DONNEES" ]; then
  echec "les deux UUID sont IDENTIQUES : la cible vit sur le volume des données."
  alerte "Le certificat dit la vérité, et le backend REFUSERA (409) — sauvegarder copierait le disque sur lui-même."
  alerte "Choisissez une cible sur un autre disque physique, puis relancez ce script."
  exit 2
fi
ok "UUID distincts — la cible est valable. Pensez à re-certifier si les disques changent."
