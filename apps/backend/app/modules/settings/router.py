"""Routeur de réglages NEUTRE (ADR-0032) — `require_parent`.

Neutre, et c'est le point : les seules routes de réglage du dépôt vivaient sous
`/api/agenda/settings`. Servir l'autonomie de ZETIS depuis le routeur de l'agenda aurait été une
dette immédiate — le premier réglage transversal appelle son propre lieu.

⚠️ **Aucune route élève, et l'absence est la décision** (invariant V1 du §G.4) : montrer un palier
à Massimo, ce serait lui apprendre qu'un contenu peut disparaître.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.settings import service
from app.modules.settings.schemas import AutonomyOut, AutonomyRequest

router = APIRouter(
    prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_parent)]
)


def _out(values: dict[str, int]) -> dict:
    return {
        "classes": [
            {
                "key": cls.key,
                "code": cls.code,
                "label": cls.label,
                "value": values[cls.key],
                "choices": list(cls.choices),
                "locked": cls.locked,
                "reason": cls.reason,
            }
            for cls in service.AUTONOMY_CLASSES
        ],
        "preset": service.preset_of(values),
    }


@router.get("/autonomy", response_model=AutonomyOut)
def get_autonomy(db: Session = Depends(get_db)) -> dict:
    """Les six paliers, leurs choix et leurs verrous. Aucune écriture, aucun back-fill."""
    return _out(service.read_autonomy(db))


@router.put("/autonomy", response_model=AutonomyOut)
def set_autonomy(req: AutonomyRequest, db: Session = Depends(get_db)) -> dict:
    """Écrit une ou plusieurs clés. 422 sur toute valeur hors `choices`, avec son motif.

    Le refus est **explicite et motivé** : une classe verrouillée qu'on tenterait de forcer ne
    doit pas échouer en silence ni être tronquée — l'appelant doit pouvoir afficher pourquoi.
    """
    return _out(service.write_autonomy(db, dict(req.values)))
