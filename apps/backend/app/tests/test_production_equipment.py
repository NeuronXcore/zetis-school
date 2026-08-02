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
