"""Liste d'attente de contenus réclamés par l'enfant (addendum ADR-0027).

Flux : dans le chat, Massimo réclame un contenu ABSENT sur une notion qui EXISTE (« ta carte sur
les fractions ») → le chat émet ici une `content_request` **dédupliquée** ; Papa la voit en badge
sur la Couverture et la traite (done/dismissed). Sémantique inverse de `notions/` (notion hors
programme). Patron `create` / `list_requests` / `set_status` du module `notions`.

Deux propriétés clés :
- **Dédup forte** `(student, skill, kind)` (contrainte d'unicité DB) : « fractions × 5 » = une ligne.
- **`create` idempotent et ré-activant** : une ligne déjà `pending` n'est pas recréée ; une ligne
  `done`/`dismissed` **repasse `pending`** quand Massimo redemande (le besoin est revenu).
"""

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import ContentRequest, Skill, Subject

# Vocabulaire fermé, aligné sur les surfaces de contenu de ZETIS. Le chat n'émet que
# cours/fiche/mindmap/card en v1 (ADR-0027 §Périmètre) ; les six sont acceptés pour absorber
# d'autres origines futures sans migration.
CONTENT_KINDS = ("cours", "fiche", "mindmap", "quiz", "capsule", "card")
_ALLOWED_STATUS = ("pending", "done", "dismissed")
SOURCE_CHAT = "chat_orchestrator"


def _out(
    req: ContentRequest,
    skill_name: str | None = None,
    subject_id: int | None = None,
    subject_name: str | None = None,
) -> dict:
    return {
        "id": req.id,
        "skill_id": req.skill_id,
        "skill_name": skill_name,
        "subject_id": subject_id,
        "subject_name": subject_name,
        "content_kind": req.content_kind,
        "status": req.status,
        "source": req.source,
        "created_at": req.created_at,
    }


def create_request(
    db: Session,
    *,
    student_id: int,
    skill_id: int,
    content_kind: str,
    source: str = SOURCE_CHAT,
) -> dict | None:
    """Crée (ou ré-active) une demande dédupliquée. Idempotent. Best-effort côté chat.

    `content_kind` hors vocabulaire → **ignoré silencieusement** (renvoie None) : l'émission est
    best-effort, elle ne doit jamais faire échouer le tour de chat qui l'appelle.
    """
    kind = (content_kind or "").strip().lower()
    if kind not in CONTENT_KINDS:
        return None
    existing = db.scalar(
        select(ContentRequest).where(
            ContentRequest.student_id == student_id,
            ContentRequest.skill_id == skill_id,
            ContentRequest.content_kind == kind,
        )
    )
    if existing is not None:
        # Massimo redemande un contenu déjà trié → le besoin est revenu, on le remonte en file.
        if existing.status != "pending":
            existing.status = "pending"  # updated_at via onupdate=func.now()
            db.flush()
        return _out(existing)
    req = ContentRequest(
        student_id=student_id, skill_id=skill_id, content_kind=kind, status="pending", source=source
    )
    db.add(req)
    db.flush()
    return _out(req)


def list_requests(db: Session, status_filter: str | None = "pending") -> list[dict]:
    """Liste les demandes (récentes d'abord), enrichies du nom de notion + matière (jointure).

    Le nom de notion et la matière rendent le badge Papa lisible sans re-fetch : « ⭐ Fractions —
    carte ». `subject_id` sert à la fusion côté client avec la Couverture."""
    query = (
        select(ContentRequest, Skill.name, Skill.subject_id, Subject.name)
        .outerjoin(Skill, Skill.id == ContentRequest.skill_id)
        .outerjoin(Subject, Subject.id == Skill.subject_id)
        .order_by(ContentRequest.created_at.desc(), ContentRequest.id.desc())
    )
    if status_filter:
        query = query.where(ContentRequest.status == status_filter)
    return [
        _out(req, skill_name, subject_id, subject_name)
        for req, skill_name, subject_id, subject_name in db.execute(query)
    ]


def set_status(db: Session, req_id: int, new_status: str) -> dict:
    """Triage Papa : done (contenu produit) | dismissed (ignorée) | pending."""
    if new_status not in _ALLOWED_STATUS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Statut invalide (attendu {', '.join(_ALLOWED_STATUS)}).",
        )
    req = db.get(ContentRequest, req_id)
    if req is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Demande introuvable.")
    req.status = new_status  # updated_at via onupdate=func.now()
    db.commit()
    db.refresh(req)
    subject_id = db.scalar(select(Skill.subject_id).where(Skill.id == req.skill_id))
    skill_name = db.scalar(select(Skill.name).where(Skill.id == req.skill_id))
    return _out(req, skill_name, subject_id)


def pending_count(db: Session) -> int:
    """Nombre de demandes en attente (pastille éventuelle)."""
    from sqlalchemy import func

    return db.scalar(
        select(func.count(ContentRequest.id)).where(ContentRequest.status == "pending")
    ) or 0
