"""Verrous d'architecture de l'équipement pédagogique (ADR-0031 §1).

L'orchestrateur `equip_notion` a quitté `reports/` pour le module neutre `production/` le
2026-08-02. Ce fichier existe pour que le déplacement ne se défasse pas — et pour que la prochaine
personne qui cherche `equip_notion` le trouve à un seul endroit.
"""

import inspect
from pathlib import Path


def test_equip_notion_vit_dans_production_et_nulle_part_ailleurs() -> None:
    """Un service à plusieurs consommateurs ne vit pas chez l'un d'eux (patron ADR-0011 §1).

    Il a vécu quatre mois chez le Conseil de classe, qui n'en est qu'un appelant. L'ADR-0023 §1
    avait décidé l'extraction le 2026-07-28 ; elle n'a eu lieu que le 2026-08-02, avec l'ADR-0031.
    """
    from app.modules.production.equipment import equip_notion

    assert equip_notion.__module__ == "app.modules.production.equipment"

    from app.modules.reports import service as reports_service

    assert not hasattr(reports_service, "equip_notion"), (
        "`equip_notion` est de nouveau exposé par `reports.service` — un alias de compatibilité "
        "sans consommateur est une dette qui se prend pour de la prudence"
    )


def test_les_appelants_importent_depuis_production() -> None:
    """Les deux appelants réels passent par le module neutre.

    Deux, pas trois : l'ADR-0023 annonçait le Conseil de classe, la composition champion ET la
    Couverture — cette dernière n'existe pas encore, elle arrivera avec la production en lot.
    """
    from app.modules.missions import champion
    from app.modules.reports import router as reports_router

    for module in (champion, reports_router):
        text = Path(inspect.getfile(module)).read_text(encoding="utf-8")
        assert "reports.service import equip_notion" not in text
        assert "production" in text, f"{Path(inspect.getfile(module)).name} n'importe pas production"


def test_les_generateurs_nimportent_pas_production() -> None:
    """La paresse des imports de `equip_notion` n'est plus là pour éviter un cycle.

    Son commentaire d'origine disait « évite tout cycle avec les modules générateurs (qui
    n'importent pas `reports`) ». Après le déplacement, l'hypothèse à tenir est celle-ci — et si
    elle tombait un jour, la paresse redeviendrait nécessaire pour une raison qu'il faudrait
    réécrire. Le motif actuel est le coût d'import, pas le cycle.
    """
    modules = ("curriculum", "fiches", "memory", "mindmaps", "quizzes")
    root = Path(__file__).resolve().parents[1] / "modules"
    offenders = [
        f"{name}/{path.name}"
        for name in modules
        for path in (root / name).glob("*.py")
        if "modules.production" in path.read_text(encoding="utf-8")
    ]
    assert offenders == [], f"un générateur importe `production` : {offenders}"


# ─── L'ORDRE DES PIÈCES ────────────────────────────────────────────────────────────────────────
def test_equip_notion_signale_ses_pieces_dans_l_ordre_de_PIECES() -> None:
    """🔴 `PIECES` n'est plus qu'un vocabulaire : son ORDRE est devenu porteur (addendum 2 §20 bis).

    `activity._position_dans_la_notion` convertit `current_piece` en position par `PIECES.index()`.
    Si `equip_notion` fabriquait dans un autre ordre que celui du tuple, la barre **reculerait** en
    plein travail — et rien d'autre ne le dirait : les cinq pièces seraient bien produites, le
    journal serait juste, seul l'avancement mentirait, par intermittence.

    Le tuple documente déjà être « l'ordre où `equip_notion` les produit ». Ce test le vérifie, au
    lieu de le croire.

    ⚠️ Verrou LEXICAL, et il faut savoir ce qu'il ne voit pas : il lit l'ordre des appels dans la
    source, pas l'ordre d'exécution. Un `_signale` placé dans une branche conditionnelle passerait.
    C'est le prix d'un test qui n'a besoin ni de base ni de LLM ; le reste se voit à l'écran.
    """
    import re

    from app.db.models.production import PIECES, PIECES_PAR_NOTION
    from app.modules.production import equipment

    source = Path(inspect.getfile(equipment)).read_text(encoding="utf-8")
    # Uniquement les APPELS — la définition `def _signale(piece: str)` ne matche pas.
    signale = tuple(re.findall(r'_signale\("([^"]+)"\)', source))

    assert signale == PIECES, (
        f"l'ordre de fabrication {signale} diverge de `PIECES` {PIECES} — la barre reculerait"
    )
    assert PIECES_PAR_NOTION == len(PIECES) == 5, (
        "le dénominateur d'un lot-chapitre se dérive de `PIECES` ; un 5 recopié ferait mentir "
        "toutes les barres le jour d'une sixième pièce"
    )
