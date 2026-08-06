"""Routes de la page Papa « Couverture de production » — `require_parent`, LECTURE SEULE.

Rien de ces routes n'atteint Massimo : aucune donnée, aucun composant partagé avec
`frontend-massimo`. Elles ne génèrent ni ne valident rien — les actions de la page passent par
les endpoints existants de chaque module (ADR-0023 : aucun nouvel endpoint de génération ici).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import coverage as service
from app.modules.production.schemas import CoverageOut, OrphanOut

router = APIRouter(
    prefix="/api/production", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.get("/coverage", response_model=CoverageOut)
def get_coverage(subject_id: int | None = None, db: Session = Depends(get_db)) -> dict:
    """Matrice matière → chapitre → leçon. `subject_id` absent → toutes les matières de l'année."""
    return service.coverage(db, subject_id)


@router.get("/orphans", response_model=list[OrphanOut])
def get_orphans(db: Session = Depends(get_db)) -> list[dict]:
    """Dérivés dont la leçon a été archivée, + `has_history`. Ne supprime ni ne réattache rien."""
    return service.orphans(db)


@router.get("/estimations")
def get_estimations(db: Session = Depends(get_db)) -> dict[str, int]:
    """Combien de temps chaque type de travail prend — **mesuré** (ADR-0041 §9).

    🔴 **C'est ce qui tue les vingt-trois constantes de durée.** Une barre locale n'a plus rien à
    deviner : elle lit. `estimated_ms` (porté par `/activity` et `/ai/jobs/{id}`) sert quand un
    travail EXISTE ; cette table-ci sert **avant** — un aperçu (« ce lot prendra ~36 min »), et la
    poignée de secondes entre le clic et la première réponse du sondage. Sans elle, l'écran aurait
    dû garder une valeur en dur juste pour ce moment-là, c'est-à-dire garder le défaut.

    Valeurs = médiane des dernières exécutions réussies par `job_type`, amorce sinon. Voir
    `ai/travaux.py`, notamment pourquoi ce n'est pas une table de constantes déplacée d'un cran.

    ⚠️ Lecture pure — le « LECTURE SEULE » de ce routeur (ADR-0023) est intact.
    """
    from app.modules.ai.travaux import estimations

    return estimations(db)
