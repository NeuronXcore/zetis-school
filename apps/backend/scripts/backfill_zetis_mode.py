"""Reprise UNIQUE du régime des lots antérieurs à la capture (addendum ADR-0034 « tri et filtre »).

Le régime d'un lot était **recalculé à chaque lecture** du Journal : capture si le lot portait ses
paliers, sinon déduction depuis ce qu'il avait laissé derrière lui. La déduction lit des artefacts
que **le veto peut retirer** — `veto._delete_one` supprime la ligne `Lesson` d'un cours retiré, donc
la preuve « ce lot a rédigé un cours » disparaît avec elle — et une de ses quatre preuves teste un
**motif d'affichage** (`detail.lower().startswith("cours")`), que le chantier du 2026-08-04 vient
justement de reformuler. Un historique qui bouge quand on exerce un droit prévu n'est pas un
historique.

Ce script écrit **une fois** ce que les actes prouvent, et marque la réponse `deduit`.

## Pourquoi un script et pas une migration

Une migration qui importerait `deduire_regime` ferait dépendre le schéma de la logique métier, et se
rejouerait différemment selon la version du code déployée au moment du `upgrade`. La migration
`e9f0a1b2c3d4` ajoute la colonne, vide. Ce script la remplit, et son résultat est **vérifiable avant
d'être gardé** (`--dry-run` par défaut).

## Ce qu'il ne fait jamais

- **Il ne touche AUCUN lot qui porte déjà ses paliers.** La capture prime sur toute déduction, sinon
  elle ne protégerait plus rien.
- **Il n'invente rien.** Ce que les actes ne prouvent pas reste `NULL` — « régime non enregistré »,
  ce qui est la vérité. Aucune rétro-attribution depuis les réglages d'aujourd'hui (doctrine §F.4).
- **Il n'écrit pas le nom du régime**, seulement les deux paliers : l'ADR-0032 est tenue, le nom se
  redérive à la lecture par `niveau_de`.

## Usage

    uv run python -m scripts.backfill_zetis_mode              # dry-run : montre, n'écrit rien
    uv run python -m scripts.backfill_zetis_mode --apply      # écrit
"""

from __future__ import annotations

import argparse
import sys

from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import ProductionRun
from app.modules.production.journal import deduire_regime, lot_evidence
from app.modules.settings.service import A0A, A1, NIVEAUX


def paliers_du_regime(regime: str) -> dict[str, int] | None:
    """Les deux paliers que ce régime nomme — lus dans `NIVEAUX`, jamais recopiés.

    ⚠️ Recopier la table ici en ferait une seconde source de vérité, qui divergerait au premier
    régime ajouté. C'est le défaut que l'ADR-0037 a coûté un ADR entier à réparer.
    """
    return NIVEAUX.get(regime)


def reprendre(db, *, apply: bool) -> dict:
    """Rend le compte rendu. N'écrit que si `apply`."""
    a_reprendre = db.scalars(
        select(ProductionRun)
        .where((ProductionRun.a0a_level.is_(None)) | (ProductionRun.a1_level.is_(None)))
        .order_by(ProductionRun.id)
    ).all()
    if not a_reprendre:
        return {"examines": 0, "ecrits": 0, "sans_preuve": 0, "lignes": []}

    preuves = lot_evidence(db, [r.id for r in a_reprendre])
    lignes: list[dict] = []
    ecrits = 0

    for run in a_reprendre:
        regime = deduire_regime(run.trigger, preuves.get(run.id, {}))
        paliers = paliers_du_regime(regime) if regime else None
        ligne = {
            "id": run.id,
            "trigger": run.trigger,
            "regime": regime,
            "paliers": paliers,
            "preuves": [k for k, v in preuves.get(run.id, {}).items() if v],
        }
        lignes.append(ligne)
        if paliers is None:
            continue
        if apply:
            run.a0a_level = paliers[A0A]
            run.a1_level = paliers[A1]
            run.zetis_mode_source = "deduit"
        ecrits += 1

    if apply:
        db.commit()
    return {
        "examines": len(a_reprendre),
        "ecrits": ecrits,
        "sans_preuve": len(a_reprendre) - ecrits,
        "lignes": lignes,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    # ⚠️ Écrire exige un geste EXPLICITE. Un script de reprise qui écrit par défaut se lance une
    # fois de trop, et il n'y a pas de retour en arrière sur un historique.
    parser.add_argument(
        "--apply", action="store_true", help="écrire réellement (sans lui : dry-run)"
    )
    args = parser.parse_args(argv)

    db = SessionLocal()
    try:
        rapport = reprendre(db, apply=args.apply)
    finally:
        db.close()

    mode = "APPLIQUÉ" if args.apply else "DRY-RUN (rien n'a été écrit)"
    print(f"=== Reprise du régime des lots — {mode} ===\n")
    if not rapport["lignes"]:
        print("Aucun lot sans paliers : il n'y a rien à reprendre.")
        return 0

    print(f"{'lot':>5}  {'déclencheur':<11} {'régime déduit':<14} {'paliers':<14} preuves")
    for ligne in rapport["lignes"]:
        paliers = ligne["paliers"]
        rendu = f"A0a={paliers[A0A]} A1={paliers[A1]}" if paliers else "—"
        print(
            f"{ligne['id']:>5}  {ligne['trigger']:<11} "
            f"{(ligne['regime'] or 'non prouvé'):<14} {rendu:<14} "
            f"{', '.join(ligne['preuves']) or '—'}"
        )

    print(
        f"\n→ {rapport['examines']} lots examinés · "
        f"{rapport['ecrits']} auraient un régime · "
        f"{rapport['sans_preuve']} restent NON ENREGISTRÉS (et c'est la vérité)."
    )
    if not args.apply:
        print("\nRien n'a été écrit. Relancer avec --apply pour appliquer.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
