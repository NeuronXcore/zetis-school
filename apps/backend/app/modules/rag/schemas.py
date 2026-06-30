from pydantic import BaseModel, Field


class RagIngestRequest(BaseModel):
    title: str
    text: str = Field(min_length=1)
    subject_id: int | None = None
    source_type: str = "papa_course"
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
