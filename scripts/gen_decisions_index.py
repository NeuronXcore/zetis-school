#!/usr/bin/env python3
"""Régénère DECISIONS.md — un index, pas une seconde copie des ADR.

Mesuré le 2026-08-16 sur l'index d'origine : 60 entrées à **3 628 caractères
de moyenne**, 1 180 lignes. Un index dont chaque entrée est un paragraphe n'est
plus un index : il faut le lire en entier pour trouver quoi lire. Une entrée
utile tient sur une ligne, et renvoie.

La description longue reste dans l'ADR, où elle a sa place et où elle est à jour.

Usage :
    python3 scripts/gen_decisions_index.py docs/decisions DECISIONS.md
    python3 scripts/gen_decisions_index.py docs/decisions DECISIONS.md --write
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from adr_lib import charger  # noqa: E402

MARQUE = {
    "propose": "🟡 Proposé",
    "accepte": "✅ Accepté",
    "livre": "✅ Livré",
    "remplace": "⬛ Remplacé",
    "abandonne": "⬛ Abandonné",
    None: "❔ inconnu",
}

TITRES = [
    ("architecture", "Décisions d'architecture",
     "Elles contraignent tout le reste. À lire avant de cadrer un chantier — "
     "voir aussi `docs/decisions/SOCLE.md`."),
    ("mesure", "Décisions de mesure et d'outillage",
     "Choix d'instruments : inférence, STT, rendu, layout."),
    ("surface", "Décisions de surface",
     "Elles tranchent un écran : libellés, gabarits, états. Excellentes specs — "
     "on ne les lit pas pour cadrer une architecture."),
]


def type_de(chemin: Path) -> str:
    for ligne in chemin.read_text(encoding="utf-8").splitlines()[:12]:
        if ligne.startswith("type:"):
            return ligne.split(":", 1)[1].strip()
    return "surface"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("racine", type=Path)
    ap.add_argument("index", type=Path)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    adrs = charger(args.racine)
    par_type: dict[str, list] = {t: [] for t, _, _ in TITRES}
    for a in adrs:
        par_type.setdefault(type_de(a.chemin), []).append(a)

    out = [
        "# DECISIONS.md — Index des décisions d'architecture",
        "",
        "> 🔴 **Fichier généré par `scripts/gen_decisions_index.py`. Ne pas éditer à la main.**",
        "> Le motif d'une décision vit dans son ADR, jamais ici — un index qui recopie",
        "> le contenu se périme deux fois plus vite et ne s'utilise plus.",
        "",
        f"{len(adrs)} décisions. Amendements fusionnés dans leur parent "
        "(`## Amendement N`, tableau récapitulatif en tête de chaque ADR).",
        "",
    ]

    for cle, titre, sous_titre in TITRES:
        groupe = sorted(par_type.get(cle, []), key=lambda a: a.id)
        if not groupe:
            continue
        out += [f"## {titre}", "", f"*{sous_titre}*", "",
                "| ADR | Titre | Statut | Date |", "|---|---|---|---|"]
        for a in groupe:
            lien = f"[{a.id}](docs/decisions/{a.chemin.name})"
            out.append(
                f"| {lien} | {a.titre or '—'} | {MARQUE.get(a.statut, '❔')} | {a.date or '—'} |"
            )
        out.append("")

    texte = "\n".join(out) + "\n"
    anciennes = len(args.index.read_text(encoding="utf-8").splitlines()) if args.index.exists() else 0
    print(f"Index : {anciennes} → {len(texte.splitlines())} lignes ({len(adrs)} décisions)")

    if args.write:
        args.index.write_text(texte, encoding="utf-8")
        print(f"écrit → {args.index}")
    else:
        print("(rapport seul — relancer avec --write)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
