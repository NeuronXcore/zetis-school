#!/bin/bash
# (bash 3.2 de macOS compatible)
#
# check-docker.sh — vérifie l'étape « Docker » de la préparation du Mac Studio
#
#   curl/copie ce fichier sur le Mac Studio, puis :
#     chmod +x check-docker.sh && ./check-docker.sh
#
# Il n'écrit rien, ne modifie rien : il lit et rapporte.
# Le rapport est aussi déposé dans /Volumes/NX-Projects/_docker-check.txt
# (pour que Claude puisse le lire directement si le dossier est partagé).
#
set -uo pipefail

VOL="${VOL:-/Volumes/NX-Projects}"
OUT="$VOL/_docker-check.txt"

pass=0; fail=0; warn=0
OK(){   printf '  \033[1;32m✓\033[0m %s\n' "$*"; pass=$((pass+1)); }
KO(){   printf '  \033[1;31m✗\033[0m %s\n' "$*"; fail=$((fail+1)); }
WA(){   printf '  \033[1;33m~\033[0m %s\n' "$*"; warn=$((warn+1)); }
T(){    printf '\n\033[1;36m▸ %s\033[0m\n' "$*"; }
I(){    printf '     %s\n' "$*"; }

report() {

echo "# check-docker — $(date '+%F %H:%M') — $(hostname)"
echo "macOS $(sw_vers -productVersion) · $(uname -m) · $(sysctl -n hw.memsize | awk '{printf "%.0f Go RAM", $1/1073741824}')"

# ── 1. Le volume ─────────────────────────────────────────────────────────────
T "1 · Volume NX-Projects"
if [ -d "$VOL" ]; then
  OK "$VOL est monté"
  fs="$(diskutil info "$VOL" 2>/dev/null | awk -F': *' '/File System Personality/{print $2}')"
  case "$fs" in
    *APFS*) OK "système de fichiers : $fs" ;;
    "")     WA "système de fichiers indéterminé (volume réseau ?)" ;;
    *)      KO "système de fichiers : $fs — il faut de l'APFS (§1.1)" ;;
  esac
  I "espace libre : $(df -h "$VOL" | awk 'NR==2{print $4" libres sur "$2}')"
else
  KO "$VOL introuvable — branche/monte le SSD avant de continuer"
fi

# ── 2. Où est Docker.raw ─────────────────────────────────────────────────────
T "2 · Emplacement de l'image disque"
# Docker Desktop range son image dans un sous-dossier DockerDesktop/ du dossier
# qu'on lui indique — on regarde les deux emplacements plausibles.
RAW=""
for cand in "$VOL/_docker/DockerDesktop/Docker.raw" "$VOL/_docker/Docker.raw"; do
  [ -f "$cand" ] && RAW="$cand" && break
done
OLD="$HOME/Library/Containers/com.docker.docker/Data"
if [ -n "$RAW" ]; then
  OK "Docker.raw est bien sur NX-Projects"
  I "chemin  : $RAW"
  I "apparent: $(ls -lh "$RAW" | awk '{print $5}')   réel sur disque: $(du -h "$RAW" 2>/dev/null | cut -f1)"
  I "modifié : $(stat -f '%Sm' "$RAW")"
else
  KO "pas de Docker.raw sous $VOL/_docker/"
  if [ -d "$VOL/_docker" ]; then I "contenu : $(ls -A "$VOL/_docker" 2>/dev/null | tr '\n' ' ')"
  else I "le dossier _docker n'existe pas encore"; fi
fi
if [ -d "$OLD" ]; then
  sz="$(du -sh "$OLD" 2>/dev/null | cut -f1)"
  case "$sz" in
    *G) big="$(echo "$sz" | tr -d 'G' | cut -d. -f1)"
        if [ "${big:-0}" -ge 5 ]; then
          WA "l'ancien emplacement pèse encore $sz — image non déplacée, ou résidu à supprimer"
          I "$OLD"
        else OK "ancien emplacement quasi vide ($sz)"; fi ;;
    *)  OK "ancien emplacement quasi vide ($sz)" ;;
  esac
fi

# ── 3. Les réglages Docker Desktop (lus dans son fichier de conf) ────────────
T "3 · Réglages Docker Desktop"
SET=""
for f in "$HOME/Library/Group Containers/group.com.docker/settings-store.json" \
         "$HOME/Library/Group Containers/group.com.docker/settings.json"; do
  [ -f "$f" ] && SET="$f" && break
done
if [ -n "$SET" ]; then
  I "conf : $SET"
  python3 - "$SET" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
def g(*names, default=None):
    for n in names:
        for k in d:
            if k.lower()==n.lower(): return d[k]
    return default
def line(sym,msg): print("  %s %s"%(sym,msg))
df = g("DataFolder","dataFolder")
if df:
    line("\033[1;32m✓\033[0m" if "NX-Projects" in str(df) else "\033[1;31m✗\033[0m",
         "DataFolder = %s"%df)
auto = g("AutoStart","autoStart")
if auto is None: line("\033[1;33m~\033[0m","AutoStart : non renseigné (vérifie à la main)")
else: line("\033[1;32m✓\033[0m" if not auto else "\033[1;31m✗\033[0m",
           "démarrage automatique = %s%s"%(auto," — À DÉCOCHER" if auto else " (décoché)"))
mem = g("MemoryMiB","memoryMiB")
if mem: line("\033[1;32m✓\033[0m" if 4096<=mem<=16384 else "\033[1;33m~\033[0m",
             "mémoire VM = %d Mio (%.0f Go) — cible 8 Go"%(mem,mem/1024))
cpu = g("Cpus","cpus")
if cpu: line("\033[1;32m✓\033[0m","vCPU = %s"%cpu)
disk = g("DiskSizeMiB","diskSizeMiB")
if disk: line("\033[1;32m✓\033[0m" if disk>=131072 else "\033[1;33m~\033[0m",
              "limite disque virtuel = %.0f Go — vise 256 Go+ (fichier sparse)"%(disk/1024))
fsd = g("FilesharingDirectories","filesharingDirectories", default=None)
if not fsd:
    # Docker >= 29 ne persiste plus la liste par défaut dans ce fichier :
    # absente ou vide = les valeurs par défaut s'appliquent (dont /Volumes).
    line("\033[1;33m~\033[0m","File sharing non persisté ici → défauts Docker "
         "(/Users /Volumes /private /tmp /var/folders). Confirme dans Settings si besoin.")
else:
    okv = any(str(x).startswith("/Volumes") for x in fsd)
    line("\033[1;32m✓\033[0m" if okv else "\033[1;31m✗\033[0m",
         "File sharing = %s"%", ".join(map(str,fsd)))
vio = g("UseVirtualizationFrameworkVirtioFS","useVirtualizationFrameworkVirtioFS")
if vio is not None:
    line("\033[1;32m✓\033[0m" if vio else "\033[1;33m~\033[0m","VirtioFS = %s"%vio)
# les noms de clés bougent d'une version à l'autre : on montre les brutes utiles
inter = [k for k in d if any(w in k.lower() for w in
         ("virtio","filesharing","disksize","memory","cpus","fsmode","grpc"))]
if inter:
    print("     clés brutes :")
    for k in sorted(inter): print("       %s = %s" % (k, d[k]))
PY
else
  WA "fichier de réglages Docker introuvable — vérifie dans l'interface"
fi

# ── 4. Le daemon répond ──────────────────────────────────────────────────────
T "4 · Docker fonctionne"
if docker info >/dev/null 2>&1; then
  OK "le daemon répond"
  docker info --format '     serveur : {{.ServerVersion}} · {{.NCPU}} vCPU · {{.MemTotal}} o · root {{.DockerRootDir}}' 2>/dev/null
  if docker run --rm hello-world >/dev/null 2>&1; then OK "hello-world passe"
  else KO "hello-world échoue"; fi
  n="$(docker ps -q | wc -l | tr -d ' ')"
  I "conteneurs en marche : $n"
else
  KO "docker ne répond pas — Docker Desktop est-il lancé ?"
fi

# ── 5. Énergie ───────────────────────────────────────────────────────────────
T "5 · Veille des disques"
ds="$(pmset -g 2>/dev/null | awk '/disksleep/{print $2}')"
case "${ds:-?}" in
  0) OK "veille disque désactivée (disksleep=0)" ;;
  ?) WA "impossible de lire pmset" ;;
  *) KO "disksleep=$ds min — à passer à 0 (sudo pmset -a disksleep 0)" ;;
esac

# ── 6. Ollama, tant qu'on y est ──────────────────────────────────────────────
T "6 · Ollama (rappel temps A · 2)"
if curl -sf --max-time 3 http://localhost:11434/api/tags >/tmp/_ol.json 2>/dev/null; then
  OK "Ollama répond sur :11434"
  for m in qwen3 nomic-embed-text; do
    grep -q "$m" /tmp/_ol.json && OK "modèle $m présent" || KO "modèle $m absent"
  done
  lnk="$(readlink "$HOME/.ollama/models" 2>/dev/null)"
  if [ -n "$lnk" ]; then
    case "$lnk" in *NX-Models*) OK "symlink models → $lnk" ;;
                   *) WA "symlink models → $lnk (pas NX-Models)" ;; esac
  else WA "$HOME/.ollama/models n'est pas un symlink"; fi
else
  WA "Ollama injoignable (pas lancé, ou SSD non monté)"
fi

printf '\n\033[1m%s\033[0m\n' "RÉSULTAT : $pass ok · $warn à regarder · $fail bloquant"
[ "$fail" -eq 0 ] && echo "→ étape Docker validée." || echo "→ corrige les ✗ avant de passer à la suite."

}

# Affiché à l'écran ET déposé en clair sur le SSD (sans couleurs)
report | tee /tmp/_check.txt
if [ -d "$VOL" ]; then
  sed 's/\x1b\[[0-9;]*m//g' /tmp/_check.txt > "$OUT" 2>/dev/null && \
    printf '\nRapport écrit dans %s\n' "$OUT"
fi
