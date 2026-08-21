#!/usr/bin/env python3
"""Carte des ports ZETIS — état RÉEL de la machine, en lecture seule.

Ne lance rien, n'arrête rien, n'écrit rien : sûr à passer en pleine séance de Massimo.

🔴 **Les libellés sont DÉRIVÉS**, jamais écrits ici : ils viennent de `.claude/launch.json`
et des deux fichiers compose. Une paire ajoutée à `launch.json` apparaît dans la sortie sans
qu'on touche à ce fichier. C'est la doctrine de l'ADR-0062 — *« si elle dérive, elle doit être
DÉRIVÉE, pas écrite »* — appliquée à l'outillage : une carte recopiée à la main ment le jour
où quelqu'un oublie de la mettre à jour, et c'est déjà arrivé deux fois dans ce dépôt.

Sort toujours en 0 : c'est un rapport, pas un verrou. Le verrou, lui, est
`apps/backend/app/tests/test_carte_des_ports.py`, qui garde `docs/devops/ports.md` de mentir.

Usage : `pnpm ports` — ou `python3 scripts/carte_des_ports.py`
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

# ⚠️ La racine est déduite de la POSITION de ce fichier — même patron que
# `check_migration_drift.py`, et même piège : déplacer le script sans le dire casse la
# déduction. Il le dit alors franchement (voir `_racine`) plutôt que de rendre une carte vide.
RACINE = Path(__file__).resolve().parent.parent

LAUNCH = RACINE / ".claude" / "launch.json"
COMPOSE_PROD = RACINE / "docker-compose.prod.yml"
COMPOSE_DEV = RACINE / "docker-compose.yml"
JOURNAL_BOOT = Path.home() / "Library" / "Logs" / "docker-autostart.log"

#: Les trois ports que la prod possède, et sur lesquels Massimo garde son adresse.
PORTS_CANONIQUES = (5173, 5174, 8000)

# --- parseurs des sources ----------------------------------------------------
# Parse le YAML à la main : PyYAML n'est pas dans `pyproject.toml` (dette connue) et les verrous
# compose du dépôt font déjà de même. Motifs alignés sur `test_compose_ports_cohabitent.py`.
_MAPPING = re.compile(r'^\s*-\s*"(?P<hote>\$\{[^}]+\}|[^:"]+):[^"]+"\s*$')
_VARIABLE = re.compile(r"^\$\{[A-Z0-9_]+(?::-(?P<defaut>[^}]*))?\}$")
_SERVICE = re.compile(r"^  ([a-z0-9][a-z0-9-]*):\s*$")


def ports_publies(fichier: Path) -> dict[int, str]:
    """{port hôte: service}, en résolvant `${VAR:-defaut}` comme le ferait un clone neuf."""
    publies: dict[int, str] = {}
    if not fichier.is_file():
        return publies
    service, dans_ports = "?", False
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        trouve = _SERVICE.match(ligne)
        if trouve:
            service, dans_ports = trouve.group(1), False
            continue
        if ligne.strip() == "ports:":
            dans_ports = True
            continue
        if not dans_ports:
            continue
        mapping = _MAPPING.match(ligne)
        if mapping is None:
            if ligne.strip() and not ligne.strip().startswith("#"):
                dans_ports = False
            continue
        hote = mapping.group("hote")
        variable = _VARIABLE.match(hote)
        valeur = variable.group("defaut") if variable else hote
        if valeur and valeur.isdigit():
            publies[int(valeur)] = service
    return publies


def paires_de_dev(fichier: Path) -> dict[int, list[str]]:
    """{port: [libellés]} d'après `launch.json`. Une liste, car deux entrées peuvent se heurter."""
    paires: dict[int, list[str]] = {}
    if not fichier.is_file():
        return paires
    conf = json.loads(fichier.read_text(encoding="utf-8"))
    for entree in conf.get("configurations", []):
        nom, port = entree.get("name"), entree.get("port")
        if not nom or not port:
            continue
        args = " ".join(str(a) for a in entree.get("runtimeArgs", []))
        vers = re.search(r"VITE_API_URL=\S*?:(\d{4})", args)
        libelle = f"{nom} → {vers.group(1)}" if vers else nom
        paires.setdefault(int(port), []).append(libelle)
    return paires


# --- sondes de la machine ----------------------------------------------------

def _shell(commande: list[str], delai: int = 10) -> str | None:
    """Rend la sortie, ou None si l'outil manque, échoue ou dépasse le délai."""
    try:
        fini = subprocess.run(commande, capture_output=True, text=True, timeout=delai)
    except (OSError, subprocess.SubprocessError):
        return None
    return fini.stdout if fini.returncode == 0 else None


def demon_docker() -> str | None:
    """La version du démon, ou None s'il ne répond pas."""
    sortie = _shell(["docker", "info", "--format", "{{.ServerVersion}}"], delai=15)
    return sortie.strip() if sortie else None


def conteneurs_prod() -> list[tuple[str, str]]:
    sortie = _shell(
        ["docker", "ps", "--filter", "name=zetis-prod", "--format", "{{.Names}}|{{.Status}}"],
        delai=15,
    )
    if not sortie:
        return []
    lignes = []
    for ligne in sortie.strip().splitlines():
        nom, _, etat = ligne.partition("|")
        lignes.append((nom.removeprefix("zetis-prod-").removesuffix("-1"), etat))
    return lignes


def ports_a_l_ecoute() -> list[int]:
    """Les ports TCP en écoute qui appartiennent au domaine ZETIS."""
    sortie = _shell(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"])
    if not sortie:
        return []
    trouves = set()
    for ligne in sortie.splitlines()[1:]:
        colonnes = ligne.split()
        if len(colonnes) < 9:
            continue
        fin = colonnes[8].rsplit(":", 1)[-1]
        if not fin.isdigit():
            continue
        port = int(fin)
        if 5170 <= port <= 5199 or 8000 <= port <= 8019 or port in (5432, 6379) or 9000 <= port <= 9009:
            trouves.add(port)
    return sorted(trouves)


def reponse_http(port: int) -> int:
    """Le code HTTP de `/`, ou 0 si rien ne répond."""
    try:
        with urllib.request.urlopen(f"http://localhost:{port}/", timeout=3) as reponse:
            return reponse.status
    except urllib.error.HTTPError as erreur:
        return erreur.code           # 404 est une réponse, pas une panne
    except OSError:
        return 0


# --- rendu -------------------------------------------------------------------

class Style:
    def __init__(self, couleur: bool) -> None:
        self.gras = "\033[1m" if couleur else ""
        self.pale = "\033[2m" if couleur else ""
        self.vert = "\033[32m" if couleur else ""
        self.ambre = "\033[33m" if couleur else ""
        self.rouge = "\033[31m" if couleur else ""
        self.fin = "\033[0m" if couleur else ""

    def titre(self, texte: str) -> None:
        print(f"\n{self.gras}== {texte} =={self.fin}")


def main() -> int:
    s = Style(sys.stdout.isatty())

    if not LAUNCH.is_file():
        print(f"Racine du dépôt introuvable (cherchée en {RACINE}).", file=sys.stderr)
        return 0

    prod = ports_publies(COMPOSE_PROD)
    infra = ports_publies(COMPOSE_DEV)
    paires = paires_de_dev(LAUNCH)

    def decrire(port: int, prod_vivante: bool) -> tuple[str, str]:
        """Rend (marque, libellé). `prod_vivante` tranche les ports canoniques.

        🔴 Sans ce discriminant, 5173/5174/8000 s'affichaient en collision : la prod les publie
        ET `pnpm dev` les vise. Ce n'est pas un heurt — c'est le partage voulu, et `pnpm dev`
        refuse justement de démarrer quand la prod les tient. Les conteneurs disent qui sert.
        """
        libelles = paires.get(port, [])
        if port in prod and prod_vivante:
            suffixe = f"  {s.pale}(pnpm dev vise le même port){s.fin}" if libelles else ""
            return s.vert + "prod " + s.fin, prod[port] + suffixe
        if port in infra:
            return s.ambre + "infra" + s.fin, infra[port]
        if len(libelles) > 1:                  # deux entrées de launch.json sur le même port
            return s.rouge + "dev !" + s.fin, " / ".join(libelles) + "  ⚠ se heurtent"
        if libelles:
            return s.ambre + "dev  " + s.fin, libelles[0]
        if port in prod:                       # déclaré par la prod, mais la prod est éteinte
            return s.ambre + "dev  " + s.fin, f"{prod[port]} {s.pale}(pnpm dev){s.fin}"
        return s.rouge + "?    " + s.fin, "inconnu de launch.json et des compose"

    s.titre("DÉMON DOCKER")
    version = demon_docker()
    if version:
        print(f"  {s.vert}en service{s.fin} {s.pale}(v{version}){s.fin}")
    else:
        print(f"  {s.rouge}ARRÊTÉ{s.fin} — Docker Desktop n'est pas lancé : la prod est éteinte.")
        print(f"  {s.pale}remède : open -ga Docker{s.fin}")

    s.titre("PROD (conteneurs)")
    vivants: list[tuple[str, str]] = []
    if version is None:
        print(f"  {s.pale}(démon arrêté){s.fin}")
    else:
        vivants = conteneurs_prod()
        if not vivants:
            print(f"  {s.rouge}aucun conteneur zetis-prod{s.fin} {s.pale}— pnpm prod:up{s.fin}")
        else:
            teinte = s.vert if len(vivants) == 8 else s.ambre
            print(f"  {teinte}{len(vivants)}/8{s.fin} conteneurs en service")
            for nom, etat in vivants:
                print(f"    {nom:<18} {etat}")

    s.titre("PORTS À L'ÉCOUTE")
    ecoute = ports_a_l_ecoute()
    if not ecoute:
        print(f"  {s.pale}aucun port ZETIS à l'écoute{s.fin}")
    for port in ecoute:
        origine, libelle = decrire(port, prod_vivante=bool(vivants))
        print(f"  {port:<6} {origine}  {libelle}")

    s.titre("RÉPONSES HTTP (prod)")
    for port in PORTS_CANONIQUES:
        code = reponse_http(port)
        if code == 200:
            etat = f"{s.vert}OK{s.fin}"
        elif port == 8000 and code == 404:
            etat = f"{s.vert}OK{s.fin} {s.pale}(404 sur / est normal : l'API n'a pas de route racine){s.fin}"
        elif code == 0:
            etat = f"{s.rouge}pas de réponse{s.fin}"
        else:
            etat = f"{s.ambre}inattendu{s.fin}"
        print(f"  {port:<6} HTTP {code:<4} {etat}")

    s.titre("DÉMARRAGE AU BOOT")
    if JOURNAL_BOOT.is_file():
        for ligne in JOURNAL_BOOT.read_text(encoding="utf-8").splitlines()[-3:]:
            print(f"  {ligne}")
    else:
        print(f"  {s.ambre}journal absent{s.fin} — l'agent de garde n'a jamais tourné ici.")
        print(f"  {s.pale}(dispositif hôte, hors dépôt : voir infra/docker/README.md){s.fin}")

    print(f"\n{s.pale}Carte complète et pièges : docs/devops/ports.md{s.fin}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
