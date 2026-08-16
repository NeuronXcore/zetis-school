#!/usr/bin/env python3
"""Pose un front-matter YAML normalisé en tête de chaque ADR.

⚠️ À lancer APRÈS `fusion_addendums.py`, jamais avant : la fusion lit les
fichiers depuis leur première ligne, un front-matter préexistant s'y ferait
absorber. Ordre imposé : fusion → front-matter → index.

Ce script NE DEVINE RIEN.
  · `statut` reprend ce qui est écrit, sans promotion automatique.
     🔴 En particulier : un ADR « Proposé » dont le code est mergé RESTE
     « propose ». `annexes/statuts-en-attente-2026-08-06.md` établit pourquoi —
     « la question n'est pas "est-ce fait ?" mais "est-ce ratifié ?", et les
     deux ne sont pas le même acte dans ce projet ». Ratifier est un geste
     humain ; un script qui le poserait à ta place effacerait la question.
  · `livre_le` et `pr` sont des FAITS, remplis seulement s'ils sont écrits.
  · `revoque` est laissé VIDE et les candidats sont écrits dans un rapport :
     les révocations sont formulées en prose, les extraire mécaniquement
     produirait des faux positifs sur un registre qui fait autorité.

Usage :
    python3 scripts/gen_frontmatter.py docs/decisions
    python3 scripts/gen_frontmatter.py docs/decisions --write
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from adr_lib import charger  # noqa: E402

# Décidé à la main, une fois. Tout ce qui n'y est pas est « surface ».
#
# ⚠️ Le défaut par défaut n'est PAS neutre : un ADR absent de ces deux ensembles
# est classé « surface », et l'index décrit cette section comme « on ne les lit
# pas pour cadrer une architecture ». Un oubli ici ne produit donc pas un
# classement approximatif, il RETIRE une décision du champ de vision du cadrage.
ARCHITECTURE = {
    "0001", "0002", "0003", "0004", "0007", "0008", "0009", "0011",
    "0014", "0017", "0023", "0024", "0030", "0031", "0032", "0034",
    "0037", "0038", "0043", "0046", "0048",
    # 0060 amende la MÉTHODE (WORKFLOW.md §2/§2bis/§6.1/§7) et se déclare
    # `type: architecture` dans son propre front-matter. Sans cette ligne, le
    # jour où on le régénère, il retomberait en « surface » — l'ADR qui dit
    # QUAND écrire un ADR, rangé parmi les décisions d'écran.
    "0060",
}

# ⚠️ `0033` est conservé À DESSEIN alors qu'aucun `adr-0033-*.md` n'existe :
# cinq documents le citent (0011-addendum, 0031, 0032, 0034, 0035) et
# `check_adr_refs.sh` le signale à chaque passage. C'est un TROU du registre,
# pas une entrée morte. Le retirer d'ici effacerait la classification préparée
# pour le jour où le fichier manquant est écrit — et rendrait le trou plus
# difficile à retrouver. Il ne peut produire aucun effet tant que le fichier
# est absent : `charger()` n'itère que sur des fichiers réels.
MESURE = {"0012", "0013", "0016", "0033"}


def echapper(s: str) -> str:
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def front_matter(a) -> str:
    type_ = "architecture" if a.id in ARCHITECTURE else ("mesure" if a.id in MESURE else "surface")
    lignes = [
        "---",
        f"id: {echapper(a.id)}",
        f"titre: {echapper(a.titre or '')}",
        f"type: {type_}",
        f"statut: {a.statut or 'inconnu'}",
        f"date: {a.date or 'null'}",
        f"pr: {a.pr if a.pr else 'null'}",
        "revoque: []        # à remplir à la main — voir rapport-revocations.md",
        "revoque_par: []",
        f"refs: [{', '.join(echapper(r) for r in sorted(a.refs))}]",
        "---",
        "",
    ]
    return "\n".join(lignes)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("racine", type=Path)
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    adrs = charger(args.racine)
    deja, poses, rapport = 0, 0, []

    for a in adrs:
        contenu = a.chemin.read_text(encoding="utf-8")
        if contenu.startswith("---\n"):
            deja += 1
            continue
        if args.write:
            a.chemin.write_text(front_matter(a) + contenu, encoding="utf-8")
        poses += 1
        if a.revocations:
            rapport.append((a.chemin.name, a.revocations))
        if a.manques:
            print(f"⚠️  {a.chemin.name} : champ(s) non établi(s) → {', '.join(a.manques)}")

    print(f"\n{poses} front-matter posé(s), {deja} déjà présent(s), {len(adrs)} fichier(s)")

    if args.write and rapport:
        chemin = args.racine.parent / "rapport-revocations.md"
        with chemin.open("w", encoding="utf-8") as f:
            f.write("# Révocations à confirmer à la main\n\n")
            f.write("> Extrait mécaniquement : ce sont des CANDIDATS, pas des faits établis.\n")
            f.write("> Reporter les vraies dans le champ `revoque:` du front-matter.\n\n")
            for nom, revs in rapport:
                f.write(f"## `{nom}`\n\n")
                for r in revs:
                    f.write(f"- {r}\n")
                f.write("\n")
        print(f"Rapport des révocations candidates → {chemin}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
