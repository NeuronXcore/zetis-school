#!/usr/bin/env python3
"""Fusionne chaque addendum dans son ADR parent, en un seul fichier par décision.

Reprend le principe de `reorder_decisions.py` : le script REFUSE d'écrire si sa
garantie n'est pas tenue. Ici la garantie est plus fine qu'une permutation pure,
parce que la fusion doit décaler les niveaux de titre — sans quoi les sections
d'un addendum deviendraient sœurs de l'amendement qui les porte.

╭─ GARANTIE ────────────────────────────────────────────────────────────────╮
│ 1. Toute ligne QUI N'EST PAS UN TITRE est reportée à l'identique, au       │
│    caractère près. Aucune reformulation, aucune ré-indentation.            │
│ 2. Les seules lignes modifiées sont les titres markdown d'un addendum,     │
│    décalés d'un niveau (## → ###), et son H1, qui devient l'en-tête        │
│    « ## Amendement N — <titre> ».                                          │
│ 3. Un titre à l'intérieur d'un bloc de code n'est JAMAIS touché.           │
│    (Le corpus en contient : blocs ```txt avec des lignes commençant par #.)│
│ 4. Le script vérifie 1 et 3 APRÈS écriture en mémoire, et abandonne tout   │
│    si le compte ne tombe pas juste.                                        │
╰───────────────────────────────────────────────────────────────────────────╯

🔴 **La fusion était PRÉVUE, elle n'est pas une idée neuve.** Deux faits du dépôt le
disent, et ils commandent la conception de ce script :

  · Onze addenda déclarent eux-mêmes leur destination — « À concaténer à la fin de
    `docs/decisions/adr-00XX-….md` ».
  · `annexes/statuts-en-attente-2026-08-06.md` explique pourquoi sept d'entre eux portent
    leur statut en `> Statut : **…**` et non en `## Statut` : *« leur mettre un titre de
    niveau 2 serait une faute : après concaténation il se lirait comme une redéfinition du
    statut du parent. »*

⚠️ **Conséquence directe : ne JAMAIS transformer ces lignes de citation en titres.** Le
décalage ci-dessus ne touche que les titres markdown ; les lignes `> Statut :` traversent
intactes, et c'est voulu. Un script « d'harmonisation » qui les promouvrait en `##`
casserait une intention vieille de dix jours.

Enfin, neuf ADR (0006, 0007, 0008, 0009, 0013, 0015, 0028, 0038, 0041) portent DÉJÀ leurs
addenda en sections `## Addendum` inline : c'est la convention d'origine du corpus. Après
fusion ils porteront les deux formes — `## Addendum` et `## Amendement N`. À renuméroter à
la main si tu le souhaites ; le script ne touche pas à l'existant.

Usage :
    python3 scripts/fusion_addendums.py docs/decisions            # rapport seul
    python3 scripts/fusion_addendums.py docs/decisions --write    # applique
"""

from __future__ import annotations

import argparse
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from adr_lib import ADR, charger  # noqa: E402

RE_TITRE = re.compile(r"^(#{1,6})\s")
RE_FENCE = re.compile(r"^\s*(```|~~~)")

LIBELLE_STATUT = {
    "propose": "Proposé",
    "accepte": "Accepté",
    "livre": "Livré",
    "remplace": "Remplacé",
    "abandonne": "Abandonné",
}


def lignes_hors_code(lignes: list[str]) -> list[bool]:
    """Rend un masque : True si la ligne est HORS d'un bloc de code."""
    dehors, masque, cloture = True, [], None
    for l in lignes:
        f = RE_FENCE.match(l)
        if f:
            marque = f.group(1)
            if dehors:
                dehors, cloture = False, marque
                masque.append(False)
                continue
            if marque == cloture:
                dehors, cloture = True, None
            masque.append(False)
            continue
        masque.append(dehors)
    return masque


def decaler(lignes: list[str]) -> tuple[list[str], int]:
    """Décale les titres d'un niveau. Rend (lignes, nombre de titres décalés)."""
    masque = lignes_hors_code(lignes)
    sortie, decales = [], 0
    for l, dehors in zip(lignes, masque):
        if dehors and RE_TITRE.match(l):
            sortie.append("#" + l)
            decales += 1
        else:
            sortie.append(l)
    return sortie, decales


def corps_sans_h1(lignes: list[str]) -> list[str]:
    masque = lignes_hors_code(lignes)
    for i, (l, dehors) in enumerate(zip(lignes, masque)):
        if dehors and l.startswith("# "):
            return lignes[i + 1 :]
    return lignes


def tableau_amendements(addendums: list[ADR]) -> list[str]:
    t = ["> ### Amendements", ">", "> | # | Date | Titre | Statut | Révoque |",
         "> |---|---|---|---|---|"]
    for n, a in enumerate(addendums, 1):
        rev = "oui" if a.revocations else "—"
        t.append(
            f"> | {n} | {a.date or '—'} | {a.titre or a.chemin.stem} "
            f"| {LIBELLE_STATUT.get(a.statut, '?')} | {rev} |"
        )
    t += [">", "> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*", ""]
    return t


def fusionner(parent: ADR, addendums: list[ADR]) -> tuple[str, dict]:
    lignes_parent = parent.chemin.read_text(encoding="utf-8").splitlines()

    # Le tableau s'insère après le bloc de statut, avant la première section suivante.
    masque = lignes_hors_code(lignes_parent)
    insertion = len(lignes_parent)
    vu_statut = False
    for i, (l, dehors) in enumerate(zip(lignes_parent, masque)):
        if not dehors:
            continue
        if l.strip() == "## Statut":
            vu_statut = True
        elif vu_statut and l.startswith("## "):
            insertion = i
            break

    sortie = lignes_parent[:insertion] + tableau_amendements(addendums) + lignes_parent[insertion:]

    stats = {"titres_decales": 0, "addendums": len(addendums)}
    for n, a in enumerate(addendums, 1):
        brut = a.chemin.read_text(encoding="utf-8").splitlines()
        corps, decales = decaler(corps_sans_h1(brut))
        stats["titres_decales"] += decales
        date = f" — {a.date}" if a.date else ""
        sortie += [
            "",
            "---",
            "",
            f"## Amendement {n} — {a.titre or a.chemin.stem}{date}",
            "",
            f"> Fusionné depuis `{a.chemin.name}` le 2026-08-16. "
            f"Statut d'origine : **{LIBELLE_STATUT.get(a.statut, '?')}**.",
        ] + corps

    return "\n".join(sortie) + "\n", stats


def verifier(sortie: str, parent: ADR, addendums: list[ADR]) -> list[str]:
    """La garantie. Rend la liste des violations — vide si tout va bien."""
    fautes = []
    lignes_sortie = set(sortie.splitlines())

    for src in [parent] + addendums:
        brut = src.chemin.read_text(encoding="utf-8").splitlines()
        corps = corps_sans_h1(brut) if src is not parent else brut
        masque = lignes_hors_code(corps)
        for l, dehors in zip(corps, masque):
            est_titre = dehors and RE_TITRE.match(l)
            if est_titre:
                continue  # seul cas où la modification est autorisée
            if l and l not in lignes_sortie:
                fautes.append(f"{src.chemin.name} : ligne perdue → {l[:90]}")
                if len(fautes) > 20:
                    return fautes
    return fautes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("racine", type=Path)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    adrs = charger(args.racine)
    par_id: dict[str, list[ADR]] = defaultdict(list)
    for a in adrs:
        par_id[a.id].append(a)

    total_f, total_a, echecs = 0, 0, 0
    for id_, groupe in sorted(par_id.items()):
        parents = [a for a in groupe if not a.est_addendum]
        addendums = [a for a in groupe if a.est_addendum]
        if not addendums:
            continue
        if len(parents) != 1:
            print(f"⚠️  ADR-{id_} : {len(parents)} parent(s) — ignoré, à traiter à la main")
            echecs += 1
            continue

        parent = parents[0]
        addendums.sort(key=lambda a: (a.date or "9999", a.chemin.name))
        sortie, stats = fusionner(parent, addendums)
        fautes = verifier(sortie, parent, addendums)

        if fautes:
            print(f"🔴 ADR-{id_} : GARANTIE VIOLÉE — rien n'est écrit")
            for f in fautes[:5]:
                print(f"     {f}")
            echecs += 1
            continue

        print(
            f"✅ ADR-{id_} : {stats['addendums']} amendement(s) fusionné(s), "
            f"{stats['titres_decales']} titre(s) décalé(s)"
        )
        total_f += 1
        total_a += stats["addendums"]

        if args.write:
            parent.chemin.write_text(sortie, encoding="utf-8")
            for a in addendums:
                a.chemin.unlink()

    print(f"\n{total_f} parent(s) réécrit(s), {total_a} addendum(s) absorbé(s), {echecs} échec(s)")
    print(f"Fichiers : {len(adrs)} → {len(adrs) - total_a}")
    if not args.write:
        print("\n(rapport seul — relancer avec --write pour appliquer)")
    return 1 if echecs else 0


if __name__ == "__main__":
    raise SystemExit(main())
