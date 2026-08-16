#!/usr/bin/env python3
"""Redirige vers son parent tout renvoi désignant un fichier d'addendum supprimé.

À lancer APRÈS `fusion_addendums.py --write`, qui supprime les 46 fichiers
d'addendum. Ces fichiers étaient cités PAR LEUR NOM un peu partout dans le dépôt ;
`check_adr_refs.sh` ne voit pas cette classe de renvois — il ne teste que
`ADR-\\d{4}`, jamais un chemin. Sans ce passage, les renvois restent verts au
contrôle et morts à la lecture.

╭─ CE QUI EST RÉÉCRIT ──────────────────────────────────────────────────────╮
│  `docs/decisions/adr-0024-addendum-galaxie-animee.md`                      │
│      → `docs/decisions/adr-0024-zetis-galaxy-progression.md` (Amendement 3)│
│  `adr-0028-addendum-kpi-a-renforcer`                                       │
│      → `adr-0028-dashboard-papa-agregat-unique` (Amendement 2)             │
╰───────────────────────────────────────────────────────────────────────────╯

Le numéro d'amendement est AJOUTÉ, jamais deviné : il vient de l'ordre que
`fusion_addendums.ORDRE_DECLARE` a établi depuis les déclarations des documents.
Sans lui, « cet addendum-ci » deviendrait « ce parent », et l'information de
QUEL amendement serait perdue sur chaque site.

🔴 Deux exclusions, et elles sont des décisions, pas des oublis :
  · `apps/` et `packages/` — code applicatif, HORS du périmètre de la session
    qui a produit ce script. 54 renvois y restent morts, à traiter à part.
  · `scripts/` — `ORDRE_DECLARE` est une TABLE de noms supprimés ; c'est le
    registre de l'ordre retenu. Le réécrire détruirait ce qu'il consigne.

Usage :
    python3 scripts/redirige_renvois_addendums.py            # rapport seul
    python3 scripts/redirige_renvois_addendums.py --write    # applique

Idempotent : un renvoi déjà suivi de « (Amendement N) » n'est pas retouché.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from fusion_addendums import rang  # noqa: E402

EXTENSIONS = (".md", ".py", ".ts", ".tsx", ".sh")
EXCLUS = ("apps/", "packages/", "scripts/")
RE_RENVOI = re.compile(r"(docs/decisions/)?(adr-(\d{4})-addendum-[a-z0-9\-]+)(\.md)?")
# Un renvoi déjà redirigé porte sa mention juste après ; on ne la repose pas.
RE_DEJA = re.compile(r"\A`?\s*\(Amendement \d+\)")


def carte() -> tuple[dict[str, str], dict[str, int]]:
    """(nom d'addendum → nom du parent, nom d'addendum → numéro d'amendement).

    Reconstruite depuis git : les fichiers d'addendum n'existent plus sur disque.
    """
    supprimes = [
        p for p in subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=D", "--", "docs/decisions"],
            capture_output=True, text=True, check=True,
        ).stdout.split()
        if "addendum" in p
    ]
    # Le parent d'un numéro est le seul `adr-XXXX-*.md` qui subsiste.
    parents = {
        m.group(1): p.name
        for p in Path("docs/decisions").glob("adr-*.md")
        if (m := re.match(r"adr-(\d{4})", p.name))
    }

    par_id: dict[str, list[str]] = defaultdict(list)
    for chemin in supprimes:
        par_id[re.match(r"adr-(\d{4})", Path(chemin).name).group(1)].append(chemin)

    vers_parent, numero = {}, {}
    for id_, chemins in par_id.items():
        # Même clé de tri que la fusion : les numéros d'amendement coïncident.
        faux = [type("A", (), {"chemin": Path(c), "date": _date_git(c)})() for c in chemins]
        for n, a in enumerate(sorted(faux, key=rang), 1):
            vers_parent[a.chemin.name] = parents[id_]
            numero[a.chemin.name] = n
    return vers_parent, numero


def _date_git(chemin: str) -> str | None:
    """La date du bloc de statut, relue dans la version git du fichier supprimé."""
    contenu = subprocess.run(
        ["git", "show", f"HEAD:{chemin}"], capture_output=True, text=True
    ).stdout
    lignes = contenu.splitlines()
    for i, l in enumerate(lignes):
        if l.strip() == "## Statut":
            for suite in lignes[i + 1 : i + 6]:
                if suite.strip():
                    d = re.search(r"(20\d{2}-\d{2}-\d{2})", suite)
                    return d.group(1) if d else None
    for l in lignes[:15]:
        if l.strip().lstrip("> ").lstrip("- ").lower().startswith("statut"):
            d = re.search(r"(20\d{2}-\d{2}-\d{2})", l)
            if d:
                return d.group(1)
    d = re.search(r"(20\d{2}-\d{2}-\d{2})", contenu[:2000])
    return d.group(1) if d else None


def reecrire(
    texte: str, vers_parent: dict[str, str], numero: dict[str, int], nom_fichier: str = ""
) -> tuple[str, int, int]:
    """Réécrit les renvois. Rend (texte, renvois croisés, auto-renvois).

    Deux cas, et ils ne se rendent pas pareil :

    · **renvoi croisé** — le fichier cite l'addendum d'un AUTRE ADR. Le nom
      devient celui du parent, suivi de « (Amendement N) » posé HORS des
      backticks : à l'intérieur, la mention produirait un chemin qui n'en est
      pas un.

    · **auto-renvoi** — après fusion, le fichier cite un addendum qui vit
      désormais DANS LUI. Écrire son propre nom de fichier serait absurde
      (« cf. l'addendum `adr-0024-zetis-galaxy-progression.md` §A »). Le renvoi
      devient « **Amendement N** », et les backticks encadrants disparaissent
      avec lui — ce n'est plus un chemin, c'est une section du document courant.
      85 des 179 renvois sont dans ce cas ; les ignorer aurait laissé le
      registre se citer lui-même par son nom de fichier.
    """
    croises = autos = 0
    sortie, i = [], 0
    for m in RE_RENVOI.finditer(texte):
        nom = m.group(2) + ".md"
        if nom not in vers_parent:
            continue
        suite = texte[m.end() : m.end() + 20]
        if RE_DEJA.match(suite):
            continue
        parent = vers_parent[nom]
        debut, fin = m.start(), m.end()
        auto = parent == nom_fichier

        if auto:
            autos += 1
            # Le renvoi cesse d'être un chemin : on retire les backticks encadrants.
            if texte[debut - 1 : debut] == "`" and suite.startswith("`"):
                debut -= 1
                fin += 1
            sortie.append(texte[i:debut])
            sortie.append(f"**Amendement {numero[nom]}**")
            i = fin
            continue

        croises += 1
        cible = parent if m.group(4) else parent[:-3]
        sortie.append(texte[i:debut])
        sortie.append((m.group(1) or "") + cible)
        i = fin
        # Si un backtick ferme immédiatement, la mention se pose après lui.
        if suite.startswith("`"):
            sortie.append("`")
            i += 1
        sortie.append(f" (Amendement {numero[nom]})")
    sortie.append(texte[i:])
    return "".join(sortie), croises, autos


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    vers_parent, numero = carte()
    print(f"{len(vers_parent)} addendums supprimés, redirigés vers {len(set(vers_parent.values()))} parents\n")

    fichiers = subprocess.run(["git", "ls-files"], capture_output=True, text=True).stdout.split()
    total, t_croises, t_autos, par_zone, par_fichier = 0, 0, 0, Counter(), {}

    for f in fichiers:
        if not f.endswith(EXTENSIONS) or f.startswith(EXCLUS) or f == "DECISIONS.md":
            continue
        p = Path(f)
        if not p.exists():
            continue
        texte = p.read_text(encoding="utf-8")
        neuf, croises, autos = reecrire(texte, vers_parent, numero, p.name)
        n = croises + autos
        if not n:
            continue
        total, t_croises, t_autos = total + n, t_croises + croises, t_autos + autos
        par_fichier[f] = n
        zone = ("docs/decisions" if f.startswith("docs/decisions/")
                else "docs/" if f.startswith("docs/")
                else "prompts/" if f.startswith("prompts/") else "racine")
        par_zone[zone] += n
        if args.write:
            p.write_text(neuf, encoding="utf-8")

    for zone, n in par_zone.most_common():
        print(f"  {n:>4}  {zone}")
    print(
        f"\n{total} renvoi(s) redirigé(s) dans {len(par_fichier)} fichier(s) — "
        f"{t_croises} croisé(s) vers un autre ADR, {t_autos} auto-renvoi(s) rendus « **Amendement N** »"
    )
    if not args.write:
        print("\n(rapport seul — relancer avec --write pour appliquer)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
