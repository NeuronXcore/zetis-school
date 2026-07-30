"""Notions demandées par l'enfant sur ELI5 mais absentes de son programme.

Flux : l'enfant tape une notion non résolue → « Dis à Papa d'ajouter » → on trace ici ;
Papa liste les demandes (page Programme) et les ajoute via le skills-backfill, puis triage
(added/dismissed). Service partagé entre l'endpoint enfant (eli5) et Papa (curriculum).
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import NotionRequest, StudentProfile

_MAX_LEN = 160
_ALLOWED_STATUS = ("pending", "added", "dismissed")


def _out(req: NotionRequest) -> dict:
    return {
        "id": req.id,
        "text": req.text,
        "status": req.status,
        "subject_id": req.subject_id,
        "created_at": req.created_at,
    }


def create_request(db: Session, student: StudentProfile, text: str) -> dict:
    """Crée une demande (ou renvoie la demande `pending` identique — idempotent)."""
    clean = (text or "").strip()[:_MAX_LEN]
    if not clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Notion vide.")
    # Dédup : même notion déjà en attente pour cet élève → on ne recrée pas.
    existing = db.scalar(
        select(NotionRequest).where(
            NotionRequest.student_id == student.id,
            NotionRequest.status == "pending",
            func.lower(NotionRequest.text) == clean.lower(),
        )
    )
    if existing is not None:
        return _out(existing)
    req = NotionRequest(student_id=student.id, text=clean, status="pending")
    db.add(req)
    db.commit()
    db.refresh(req)
    return _out(req)


def pending_count(db: Session) -> int:
    """Nombre de demandes de notions en attente (pastille de notification Papa)."""
    return db.scalar(
        select(func.count(NotionRequest.id)).where(NotionRequest.status == "pending")
    ) or 0


def list_requests(db: Session, status_filter: str | None = "pending") -> list[dict]:
    """Liste les demandes (récentes d'abord), filtrables par statut."""
    query = select(NotionRequest).order_by(
        NotionRequest.created_at.desc(), NotionRequest.id.desc()
    )
    if status_filter:
        query = query.where(NotionRequest.status == status_filter)
    return [_out(r) for r in db.scalars(query).all()]


def set_status(db: Session, req_id: int, new_status: str) -> dict:
    """Triage Papa : passe la demande à added / dismissed / pending."""
    if new_status not in _ALLOWED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statut invalide (attendu {', '.join(_ALLOWED_STATUS)}).",
        )
    req = db.get(NotionRequest, req_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    req.status = new_status  # updated_at géré par onupdate=func.now()
    db.commit()
    db.refresh(req)
    return _out(req)
