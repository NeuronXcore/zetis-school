from datetime import datetime

from pydantic import BaseModel


class ContentRequestOut(BaseModel):
    """Une demande de contenu de l'enfant, enrichie pour le badge Papa (Couverture)."""

    id: int
    skill_id: int
    skill_name: str | None = None
    subject_id: int | None = None
    subject_name: str | None = None
    content_kind: str  # cours|fiche|mindmap|quiz|capsule|card
    status: str  # pending|done|dismissed
    source: str
    created_at: datetime


class ContentRequestPatch(BaseModel):
    """Triage Papa : done (contenu produit) | dismissed (ignorée) | pending."""

    status: str
