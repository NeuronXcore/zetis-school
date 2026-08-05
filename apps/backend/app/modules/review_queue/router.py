"""Route de la file de relecture (ADR-0039 §1).

**Elle ne vit pas dans `dashboard`** : ce router-là documente « aucun query param de filtrage,
volontairement » (ADR-0028 §1), et y greffer `?subject_id=&kind=` contredirait son contrat — c'est
l'argument par lequel l'addendum ADR-0028 a logé son panneau d'analyse dans `progress`.

**Elle ne vit pas dans `production`** : `coverage.py` est verrouillé sur quatre colonnes
**leçon-centrées**. Une capsule n'a pas de leçon, un chapitre n'a pas de leçon parente ; les y faire
entrer élargirait les invariants d'une surface qui tient parce qu'ils sont étroits.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.eli5.service import get_default_student
from app.modules.review_queue import service
from app.modules.review_queue.schemas import ReviewQueueOut

router = APIRouter(
    prefix="/api/parent", tags=["review-queue"], dependencies=[Depends(require_parent)]
)


@router.get("/review-queue", response_model=ReviewQueueOut)
def review_queue(
    subject_id: int | None = Query(default=None),
    kind: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Ce qui est produit et n'atteint pas encore Massimo, borné à l'année active.

    **Lecture seule** : cette route n'écrit rien, jamais. Les gestes de validation et de rejet ont
    leurs propres endpoints, par type — la file oriente, elle ne concentre pas les pouvoirs.

    Les filtres ne touchent que `items` : `counts` et `subjects` portent toujours la population
    entière (§4).
    """
    student = get_default_student(db)
    year_id = service.active_year_id(db, student.id if student else None)
    return service.build_queue(db, year_id=year_id, subject_id=subject_id, kind=kind)
