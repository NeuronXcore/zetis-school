"""Routes Papa de la liste d'attente de contenus (addendum ADR-0027) — Papa uniquement.

L'enfant ne crée PAS de demande via une route : l'émission est **interne** au service de chat
(`chat/service.py`, best-effort). Ici, Papa liste les demandes (badge Couverture) et les trie.
Les mutations passent par ce module, **jamais** par `production` (invariant read-only préservé).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.content_requests import service
from app.modules.content_requests.schemas import ContentRequestOut, ContentRequestPatch

router = APIRouter(
    prefix="/api/content-requests",
    tags=["content-requests"],
    dependencies=[Depends(require_parent)],
)


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
