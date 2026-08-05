"""Route unique du dashboard Papa (ADR-0028 §1).

Prend la place de l'ancien `GET /api/parent/dashboard` du module `activity`, qui servait six KPI
hebdomadaires (`sessions`, `xp`, `missions_completed`…). **Changement cassant assumé** : la route
n'avait qu'un seul consommateur, la page qu'on refait, et l'XP quitte les KPI parent pour ne
rester que sur Progression — un KPI de pilotage doit être décisionnel (adr-0028 §5).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.dashboard import service
from app.modules.dashboard.schemas import DashboardOut
from app.modules.eli5.service import get_default_student

router = APIRouter(prefix="/api/parent", tags=["dashboard"], dependencies=[Depends(require_parent)])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)) -> dict:
    """Agrégat complet et NON FILTRÉ : quatre fenêtres (7 / 30 / 90 / 365) dans la même réponse.

    Aucun query param de filtrage, volontairement. Période, matière et focus sont des projections
    que le client applique sur un tableau déjà en mémoire — c'est ce qui fait qu'aucun clic de la
    page ne déclenche d'aller-retour réseau (adr-0028 §1, §4). La seule exception assumée est le
    drill-down d'un jour, qui reste paresseux sur `/api/parent/activity/days/{date}`.
    """
    return service.build_dashboard(db, student_id=get_default_student(db).id)
