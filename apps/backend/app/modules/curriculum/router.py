"""Routes HTTP du référentiel de programme — Lot 1 Slice A (ADR-0009), Papa uniquement.

`GET /api/subjects` existe déjà (module subjects) : non dupliqué ici. La page Papa
« Programme » (Slice B, étape 14) consommera ces endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import require_parent
from app.modules.curriculum import get_curriculum_provider, service
from app.modules.curriculum.schemas import (
    ChapterManualCreate,
    ChapterPatch,
    ChapterReorderRequest,
    CurriculumChapterOut,
)

router = APIRouter(prefix="/api", tags=["curriculum"], dependencies=[Depends(require_parent)])


@router.post(
    "/school-year-subjects/{school_year_subject_id}/generate-chapters",
    response_model=list[CurriculumChapterOut],
    status_code=status.HTTP_201_CREATED,
)
def generate_chapters(
    school_year_subject_id: int,
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_curriculum_provider),
) -> list[dict]:
    """Passe 1 : génère les chapitres de la matière (chapitres `pending`, à valider)."""
    try:
        created = service.generate_chapters(db, llm, school_year_subject_id)
    except service.CurriculumGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}"
        ) from exc
    return [service.chapter_out(c) for c in created]


@router.get(
    "/school-year-subjects/{school_year_subject_id}/chapters",
    response_model=list[CurriculumChapterOut],
)
def list_chapters(
    school_year_subject_id: int, db: Session = Depends(get_db)
) -> list[dict]:
    return [service.chapter_out(c) for c in service.list_chapters(db, school_year_subject_id)]


@router.post(
    "/school-year-subjects/{school_year_subject_id}/chapters",
    response_model=CurriculumChapterOut,
    status_code=status.HTTP_201_CREATED,
)
def create_chapter(
    school_year_subject_id: int,
    payload: ChapterManualCreate,
    db: Session = Depends(get_db),
) -> dict:
    """Ajout manuel Papa → `source='manual'`, validé d'office (ADR-0009 §3)."""
    chapter = service.create_manual_chapter(
        db,
        school_year_subject_id,
        name=payload.name,
        description=payload.description,
        period=payload.period,
        themes=payload.themes,
        suggested_class=payload.suggested_class,
        repartition=payload.repartition,
    )
    return service.chapter_out(chapter)


@router.post(
    "/school-year-subjects/{school_year_subject_id}/chapters/reorder",
    response_model=list[CurriculumChapterOut],
)
def reorder_chapters(
    school_year_subject_id: int,
    payload: ChapterReorderRequest,
    db: Session = Depends(get_db),
) -> list[dict]:
    chapters = service.reorder_chapters(db, school_year_subject_id, payload.chapter_ids)
    return [service.chapter_out(c) for c in chapters]


@router.patch("/chapters/{chapter_id}", response_model=CurriculumChapterOut)
def update_chapter(
    chapter_id: int, payload: ChapterPatch, db: Session = Depends(get_db)
) -> dict:
    """Édition + `validate`/`reject` du statut de validation (indépendant de `status`)."""
    chapter = service.update_chapter(
        db,
        chapter_id,
        name=payload.name,
        description=payload.description,
        period=payload.period,
        validation_action=payload.validation_action,
    )
    return service.chapter_out(chapter)


@router.delete("/chapters/{chapter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_chapter(chapter_id: int, db: Session = Depends(get_db)) -> None:
    service.delete_chapter(db, chapter_id)
