from pydantic import BaseModel, Field


class RagIngestRequest(BaseModel):
    title: str
    text: str = Field(min_length=1)
    subject_id: int | None = None
    source_type: str = "papa_course"
    level: str | None = None
    chapter: str | None = None


class RagClipRequest(BaseModel):
    """Capture envoyée par l'extension zetis-clip (page web / sélection).

    `text` n'est pas contraint ici (Field) : un texte vide renvoie un `400`
    explicite côté router, et non un `422` de validation. `source_url` sert la
    provenance (conservée dans le contenu, pas de colonne dédiée → zéro migration)."""

    title: str
    text: str
    source_url: str | None = None
    source_type: str = "web_clip"
    subject_id: int | None = None
    level: str | None = None
    chapter: str | None = None


class RagClipUrlRequest(BaseModel):
    """Import d'une transcription vidéo (zetis-clip Lot 2).

    Seule `url` est requise ; l'extraction se fait côté serveur, bornée à une
    allowlist d'hôtes (cf. `transcript.validate_video_url`). « thème » est replié
    dans le champ libre `chapter` (pas de table)."""

    url: str
    title: str | None = None
    subject_id: int | None = None
    level: str | None = None
    chapter: str | None = None


class RagIngestResponse(BaseModel):
    document_id: int
    chunks: int


class RagDocumentOut(BaseModel):
    id: int
    title: str
    subject_id: int | None
    source_type: str
    level: str | None
    chapter: str | None
    validation_status: str
    chunks: int


class RagSearchRequest(BaseModel):
    query: str = Field(min_length=1)
    subject_id: int | None = None
    k: int | None = None


class RagSearchHit(BaseModel):
    chunk_id: int
    document_id: int
    content: str
    distance: float


class RagValidationOut(BaseModel):
    document_id: int
    validation_status: str
