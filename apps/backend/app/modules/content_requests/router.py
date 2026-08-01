"""Routes de la liste d'attente de contenus (addendum ADR-0027).

Deux routeurs, deux rôles, **asymétriques par décision** :

- Papa (`require_parent`) **lit et trie** — c'est sa file de travail ;
- Massimo (`require_child`) **écrit seulement** — aucun `GET`, aucun `PATCH`.

L'asymétrie n'est pas une simplification de v1, c'est le fond : la file de Papa n'est pas une
surface de l'enfant. Un « refusé » visible serait le vocabulaire d'échec que ZETIS s'interdit, et
une liste de demandes en attente transformerait une file de travail en écran d'attente — ZETIS
transmet, il ne promet pas.

Jusqu'au 2026-08-01, l'enfant n'émettait que par **effet de bord** du chat (`chat/service.py`,
best-effort) : il subissait la demande sans savoir qu'il venait de la faire. La page matière rend
le geste explicite — d'où cette route, et d'où `source` qui distingue les deux origines.

Les mutations passent par ce module, **jamais** par `production` (invariant read-only préservé).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_child, require_parent
from app.modules.content_requests import service
from app.modules.content_requests.schemas import (
    ContentRequestOut,
    ContentRequestPatch,
    StudentContentRequestIn,
    StudentContentRequestOut,
)
from app.modules.eli5.service import get_default_student

router = APIRouter(
    prefix="/api/content-requests",
    tags=["content-requests"],
    dependencies=[Depends(require_parent)],
)

# ⚠️ Ce routeur ne porte QU'UNE route, et c'est un `POST`. Ne pas y ajouter de `GET` « mes
# demandes » : ce serait exposer `dismissed` à l'enfant et faire d'une file de travail parent un
# écran d'attente. La décision est dans l'addendum ADR-0027, un test vérifie l'absence.
student_router = APIRouter(
    prefix="/api/student/content-requests",
    tags=["content-requests-student"],
    dependencies=[Depends(require_child)],
)


@student_router.post("", response_model=StudentContentRequestOut)
def create_student_content_request(
    body: StudentContentRequestIn, db: Session = Depends(get_db)
) -> dict:
    """Massimo demande à Papa un ou plusieurs contenus sur une notion qu'il voit.

    « Tout ce qui manque » tient en **un** appel. 422 si le vocabulaire ou le plafond est
    dépassé ; 404 (et aucune ligne) si la notion n'est pas visible de l'élève.
    """
    student = get_default_student(db)
    requested = service.create_student_requests(
        db,
        student_id=student.id,
        skill_id=body.skill_id,
        content_kinds=body.content_kinds,
    )
    return {"requested": requested}


@router.get("", response_model=list[ContentRequestOut])
def list_content_requests(
    status: str | None = "pending", db: Session = Depends(get_db)
) -> list[dict]:
    """Demandes de contenu de l'enfant (par défaut celles en attente), récentes d'abord."""
    return service.list_requests(db, status)


@router.get("/count")
def content_requests_count(db: Session = Depends(get_db)) -> dict:
    """Nombre de demandes en attente — alimente la pastille de notification de la sidebar Papa."""
    return {"pending": service.pending_count(db)}


@router.patch("/{request_id}", response_model=ContentRequestOut)
def patch_content_request(
    request_id: int, body: ContentRequestPatch, db: Session = Depends(get_db)
) -> dict:
    """Triage : marquer une demande done (contenu produit) ou dismissed (ignorée)."""
    return service.set_status(db, request_id, body.status)
