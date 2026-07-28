"""Routes de motivation — espace de MASSIMO (`require_child`).

L'engagement hebdomadaire est écrit par l'ENFANT et par lui seul. Si Papa pouvait le poser, ce
ne serait plus un engagement mais une consigne, et le levier d'autonomie — celui qui fait qu'un
objectif qu'on s'est donné se tient alors qu'un objectif subi se fuit — disparaîtrait.

`require_child` là où les autres routers `/api/student/*` se contentent de `get_current_user` :
divergence assumée, justifiée par cette réservation d'écriture.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_child
from app.modules.eli5.service import get_default_student
from app.modules.motivation import service
from app.modules.motivation.schemas import WeekEngagementOut, WeekGoalRequest

router = APIRouter(
    prefix="/api/student/motivation",
    tags=["motivation"],
    dependencies=[Depends(require_child)],
)


@router.get("/week", response_model=WeekEngagementOut)
def get_week(db: Session = Depends(get_db)) -> dict:
    """La semaine en cours : 7 cases, l'engagement pris s'il y en a un, et où en est Massimo.

    Le lundi, aucune ligne d'engagement n'existe encore : `goal_days` vaut `null` et la grille
    est vide. Aucun cron, aucun rollover — le changement de semaine se fait tout seul, et les
    semaines passées ne sont servies par AUCUNE route élève (un historique d'objectifs manqués
    serait le streak déguisé)."""
    return service.week_engagement(db, student_id=get_default_student(db).id)


@router.put("/week", response_model=WeekEngagementOut)
def put_week(body: WeekGoalRequest, db: Session = Depends(get_db)) -> dict:
    """Massimo pose ou révise son engagement de la semaine.

    `PUT` et non `POST` : c'est un upsert idempotent sur une ressource unique (élève, semaine
    courante) — rejouer la requête doit rendre le même état, pas créer une seconde ligne.
    Réviser à la baisse est autorisé, sans confirmation ni trace."""
    return service.set_week_goal(
        db, student_id=get_default_student(db).id, target_days=body.target_days
    )
