"""Test-verrou — le dev et la prod peuvent tourner sur la même machine.

Le Mac Studio héberge les deux : la prod que Massimo utilise, et le dev de Papa. Jusqu'au
2026-08-17, `docker-compose.prod.yml` affirmait en tête *« ports miroir du dev → SOIT `pnpm dev`
SOIT `pnpm prod:up` »*. C'était **inexact**, et le mesurer a réduit le chantier à deux lignes :

- Postgres et Redis de prod ne publient **rien** (réseau `interne`) ;
- le navigateur ne parle **jamais** à MinIO — `MinioVideoBackend.read_video()` lit les octets côté
  serveur et la route backend les sert — donc la publication MinIO de la prod n'exposait que la
  console d'admin, et c'était le **seul** heurt dur.

Ce fichier tient les deux propriétés qui rendent la cohabitation vraie. Il ne les tient pas pour
les services d'aujourd'hui — ils sont corrects — mais pour le port qu'on publiera un jour sans y
penser.

⚠️ Le second test garde le piège le moins visible : les deux compose lisent le **même `.env` de la
racine**. Deux fichiers qui publient un port sous le **même nom de variable** rouvrent le défaut
sans qu'aucune valeur par défaut ne se ressemble — il suffit que quelqu'un pose la variable.

Un échec ici ne se répare pas en ajustant l'assertion.
"""

import re
from pathlib import Path

_RACINE = Path(__file__).resolve().parents[4]
DEV = _RACINE / "docker-compose.yml"
PROD = _RACINE / "docker-compose.prod.yml"

#: `- "${MINIO_PORT_PROD:-9002}:9000"` ou `- "5173:80"` — on ne veut que la moitié HÔTE.
#: ⚠️ L'alternative `${…}` passe EN PREMIER : sinon `[^:"]+` coupe `${MINIO_PORT_PROD:-9002}`
#: au `:` du `:-` et rend une moitié hôte inexploitable, en silence.
_MAPPING = re.compile(r'^\s*-\s*"(?P<hote>\$\{[^}]+\}|[^:"]+):(?P<conteneur>[^"]+)"\s*$')
_VARIABLE = re.compile(r"^\$\{(?P<nom>[A-Z0-9_]+)(?::-(?P<defaut>[^}]*))?\}$")
_SERVICE = re.compile(r"^  ([a-z0-9][a-z0-9-]*):\s*$")


def _ports_publies(fichier: Path) -> dict[int, str]:
    """Rend {port hôte: service}, en résolvant `${VAR:-defaut}` comme le ferait un clone neuf."""
    publies: dict[int, str] = {}
    service = "?"
    dans_ports = False
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        trouve = _SERVICE.match(ligne)
        if trouve:
            service = trouve.group(1)
            dans_ports = False
            continue
        if ligne.strip() == "ports:":
            dans_ports = True
            continue
        if not dans_ports:
            continue
        mapping = _MAPPING.match(ligne)
        if mapping is None:
            # Fin du bloc `ports:` dès qu'une ligne n'est plus un mapping.
            if ligne.strip() and not ligne.strip().startswith("#"):
                dans_ports = False
            continue
        hote = mapping.group("hote")
        variable = _VARIABLE.match(hote)
        valeur = variable.group("defaut") if variable else hote
        if valeur and valeur.isdigit():
            publies[int(valeur)] = service
    return publies


def _variables_de_ports(fichier: Path) -> set[str]:
    """Rend les noms de variables d'environnement pilotant un port publié."""
    noms: set[str] = set()
    dans_ports = False
    for ligne in fichier.read_text(encoding="utf-8").splitlines():
        if _SERVICE.match(ligne):
            dans_ports = False
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
        variable = _VARIABLE.match(mapping.group("hote"))
        if variable:
            noms.add(variable.group("nom"))
    return noms


def test_les_deux_compose_publient_bien_des_ports() -> None:
    """Garde-fou du verrou : un parseur qui ne trouve rien passerait tous les tests."""
    assert DEV.is_file() and PROD.is_file()
    assert len(_ports_publies(DEV)) >= 4, _ports_publies(DEV)
    assert len(_ports_publies(PROD)) >= 4, _ports_publies(PROD)


def test_aucun_port_hote_en_commun_entre_dev_et_prod() -> None:
    """La prod garde 8000/5173/5174 ; le dev garde 5432/6379/9000/9001. Rien ne se croise."""
    dev, prod = _ports_publies(DEV), _ports_publies(PROD)
    communs = sorted(set(dev) & set(prod))
    assert not communs, (
        "Ports publiés par les DEUX stacks : "
        + ", ".join(f"{p} (dev:{dev[p]} / prod:{prod[p]})" for p in communs)
        + ". Les deux ne pourraient plus tourner ensemble sur le Mac Studio."
    )


def test_aucune_variable_de_port_partagee_entre_dev_et_prod() -> None:
    """Le piège invisible : un même nom de variable ferait déménager les deux stacks ensemble.

    Les deux compose lisent le `.env` de la racine. Des défauts distincts ne suffisent donc pas —
    il faut aussi que les NOMS diffèrent, sans quoi poser la variable recrée la collision.
    """
    partagees = sorted(_variables_de_ports(DEV) & _variables_de_ports(PROD))
    assert not partagees, (
        f"Variables de port communes aux deux compose : {partagees}. "
        "Les deux fichiers lisent le même `.env` de la racine : poser l'une d'elles déplacerait "
        "les deux stacks ensemble et recréerait la collision."
    )
