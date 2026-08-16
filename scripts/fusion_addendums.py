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

# --- Ordre des amendements ---------------------------------------------------
#
# 🔴 Le tri `(date, nom de fichier)` seul est FAUX sur les dates ex-æquo. Mesuré le
# 2026-08-16 : huit groupes portent plusieurs addendums du même jour, et quatre d'entre
# eux s'en trouvaient mal rangés — dont deux où l'alphabétique plaçait le **révoquant
# avant le révoqué**. `## Amendement N` aurait alors affirmé un ordre qui n'existe nulle
# part : « Amendement 2 » aurait porté la phrase « Cinquième addendum en une journée ».
#
# Rien n'est déduit ici. Chaque rang est celui que le document **déclare lui-même** ; la
# citation qui l'établit est en commentaire. Un fichier absent de cette table retombe sur
# le tri par nom — et si son groupe a des dates ex-æquo, `main()` le signale.
ORDRE_DECLARE = {
    # ADR-0011 — 2026-07-28 ×2. Rangs portés par les H1 (§E, §F) et confirmés par
    # « À concaténer **après le §E** » (provenance-validation, L2).
    "adr-0011-addendum-fraicheur-derives.md": 1,
    "adr-0011-addendum-provenance-validation.md": 2,

    # ADR-0024 — 2026-07-31 ×5. Chacun se numérote en toutes lettres dans son bloc de
    # statut ; trois d'entre eux désignent `galaxie-page-dediee` comme « le premier ».
    "adr-0024-addendum-galaxie-page-dediee.md": 1,      # cité « le premier addendum » par les n° 2, 3, 4 et 5
    "adr-0024-addendum-accueil-vivant.md": 2,           # « Second addendum de l'ADR-0024, le jour même du premier »
    "adr-0024-addendum-galaxie-animee.md": 3,           # « Troisième addendum à l'ADR-0024 en une journée »
    "adr-0024-addendum-galaxie-sur-accueil.md": 4,      # « Quatrième addendum à l'ADR-0024 en une journée »
    "adr-0024-addendum-constellations-completes.md": 5, # « Cinquième addendum … et le deuxième à révoquer une décision du matin »

    # ADR-0025 — 2026-08-10 ×5. Les H1 portent les ordinaux de section du parent.
    "adr-0025-addendum-intitule-depuis-le-referentiel.md": 13,  # « §13 · L'intitulé se choisit dans le référentiel »
    "adr-0025-addendum-lecon-a-apprendre.md": 14,               # « §14 · "Leçon à apprendre", le quatrième type »
    "adr-0025-addendum-lien-vers-le-cours.md": 15,              # « §15 · L'échéance mène à son cours »
    "adr-0025-addendum-voix-de-zetis.md": 16,                   # « §16 · Papa n'existe pas dans l'espace de Massimo »
    "adr-0025-addendum-jour-ouvert.md": 17,                     # « §17 · La bande ouvre un jour »

    # ADR-0028 — deux paires. Le rang suit la dépendance que chaque document déclare.
    "adr-0028-addendum-analyse-par-matiere.md": 1,   # 2026-08-05
    "adr-0028-addendum-kpi-a-renforcer.md": 2,       # 2026-08-05, « s'appuie sur : … adr-0028-addendum-analyse-par-matiere »
    "adr-0028-addendum-memoire-quatre-vues.md": 3,   # 2026-08-06
    "adr-0028-addendum-cartes-focalisables.md": 4,   # 2026-08-06, « s'appuie sur : … adr-0028-addendum-memoire-quatre-vues »

    # ADR-0030 — 2026-08-15 ×3. `temoin-matieres` porte « les quatre bornes transverses
    # B1–B4 communes aux trois témoins ajoutés le même jour (Matières, ELI5, Quiz) …
    # écrites une seule fois, ici » : il doit précéder les deux qui s'y adossent, et
    # l'énumération donne l'ordre des deux suivants.
    "adr-0030-addendum-temoin-matieres.md": 1,
    "adr-0030-addendum-temoin-eli5.md": 2,
    "adr-0030-addendum-temoin-quiz.md": 3,

    # ADR-0032 — 2026-08-04 ×2. H1 §7 et §8, « après le §7 » (zetis-levels, L2).
    "adr-0032-addendum-etat-zetis-en-sidebar.md": 7,
    "adr-0032-addendum-zetis-levels.md": 8,

    # ADR-0034 — 2026-08-04 ×2. « s'appuie sur : … adr-0034-addendum-regime-et-destination »
    # (tri-et-filtre, bloc de statut).
    "adr-0034-addendum-regime-et-destination.md": 1,
    "adr-0034-addendum-tri-et-filtre-du-journal.md": 2,
}

# Un fichier non déclaré passe APRÈS les déclarés de sa date, puis par ordre de nom.
RANG_PAR_DEFAUT = 10_000


def rang(a: ADR) -> tuple[str, int, str]:
    """Clé d'ordre d'un amendement : date, rang déclaré, nom de fichier."""
    return (a.date or "9999", ORDRE_DECLARE.get(a.chemin.name, RANG_PAR_DEFAUT), a.chemin.name)


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
        addendums.sort(key=rang)

        # Une date ex-æquo dont l'ordre n'est déclaré nulle part retomberait sur
        # l'alphabétique — c'est exactement ce qui avait mal rangé quatre groupes.
        # On le DIT au lieu de le laisser passer.
        vus: dict[str, list[str]] = defaultdict(list)
        for a in addendums:
            vus[a.date or "—"].append(a.chemin.name)
        for date, noms in vus.items():
            non_declares = [n for n in noms if n not in ORDRE_DECLARE]
            if len(noms) > 1 and non_declares:
                print(
                    f"⚠️  ADR-{id_} : {len(noms)} amendements datés {date}, dont "
                    f"{len(non_declares)} sans ordre déclaré → rangés par nom de fichier"
                )
                for n in non_declares:
                    print(f"       {n}")

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
