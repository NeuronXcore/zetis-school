from datetime import datetime

from pydantic import BaseModel


class NotionRequestCreate(BaseModel):
    """Demande de l'enfant : une notion tapée sur ELI5 mais absente du programme."""

    text: str


class NotionRequestPatch(BaseModel):
    """Triage Papa : added (ajoutée au programme) | dismissed (ignorée) | pending."""

    status: str


class NotionRequestOut(BaseModel):
    id: int
    text: str
    status: str
    subject_id: int | None = None
    created_at: datetime
