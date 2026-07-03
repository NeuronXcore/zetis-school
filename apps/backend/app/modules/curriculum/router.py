"""Routes HTTP du référentiel de programme — Lot 1 Slice A (ADR-0009), Papa uniquement.

`GET /api/subjects` existe déjà (module subjects) : non dupliqué ici. La page Papa
« Programme » (Slice B, étape 14) consommera ces endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.curriculum import get_curriculum_provider, service
from app.modules.curriculum.schemas import (
    ActiveSchoolYearOut,
    BatchValidationResult,
    ChapterManualCreate,
    ChapterPatch,
    ChapterReorderRequest,
    CurriculumChapterOut,
    CurriculumLessonOut,
    LessonManualCreate,
    LessonPatch,
    LessonReorderRequest,
    StudentCoursOut,
    StudentLessonContentOut,
)

router = APIRouter(prefix="/api", tags=["curriculum"], dependencies=[Depends(require_parent)])

# Routes ÉLÈVE (page Cours de Massimo) : lecture seule, tout utilisateur authentifié
# (le rôle child passe) — le service ne sert QUE du validé (ADR-0009 §9).
student_router = APIRouter(
    prefix="/api/student", tags=["curriculum-student"], dependencies=[Depends(get_current_user)]
)


@router.get("/school-years/active/subjects", response_model=ActiveSchoolYearOut)
def active_school_year_subjects(db: Session = Depends(get_db)) -> dict:
    """Lecture seule (Slice B) : l'année active et les `school_year_subject_id` de ses matières."""
    return service.active_year_with_subjects(db)


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


@router.post(
    "/school-year-subjects/{school_year_subject_id}/chapters/validate-all",
    response_model=BatchValidationResult,
)
def validate_all_chapters(
    school_year_subject_id: int, db: Session = Depends(get_db)
) -> dict:
    """Validation par lot : tous les `pending` de la matière (les `rejected` restent)."""
    count = service.validate_all_chapters(db, school_year_subject_id)
    return {"validated_count": count}


@router.post("/school-years/active/chapters/validate-all", response_model=BatchValidationResult)
def validate_all_active_year(db: Session = Depends(get_db)) -> dict:
    """Validation par lot : tous les `pending` de l'année active, toutes matières."""
    count = service.validate_all_active_year(db)
    return {"validated_count": count}


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


# ---------------------------------------------------------------------------
# Passe 2 : leçons + notions d'un chapitre (Lot 2 Slice A, ADR-0009).
# ---------------------------------------------------------------------------


@router.post(
    "/chapters/{chapter_id}/generate-lessons",
    response_model=list[CurriculumLessonOut],
    status_code=status.HTTP_201_CREATED,
)
def generate_lessons(
    chapter_id: int,
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_curriculum_provider),
) -> list[dict]:
    """Passe 2 (requête longue synchrone, ~10-30 s) : génère les leçons du chapitre
    (validé ou manuel uniquement, sinon 409) et renvoie la liste complète après génération."""
    try:
        lessons = service.generate_lessons(db, llm, chapter_id)
    except service.CurriculumGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}"
        ) from exc
    return service.lessons_out(db, lessons)


@router.get("/chapters/{chapter_id}/lessons", response_model=list[CurriculumLessonOut])
def list_lessons(chapter_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return service.lessons_out(db, service.list_lessons(db, chapter_id))


@router.post(
    "/chapters/{chapter_id}/lessons",
    response_model=CurriculumLessonOut,
    status_code=status.HTTP_201_CREATED,
)
def create_lesson(
    chapter_id: int, payload: LessonManualCreate, db: Session = Depends(get_db)
) -> dict:
    """Ajout manuel Papa → `created_by='parent'`, validée d'office (ADR-0009 §3)."""
    lesson = service.create_manual_lesson(
        db, chapter_id, title=payload.title, summary=payload.summary, notions=payload.notions
    )
    return service.lessons_out(db, [lesson])[0]


@router.post(
    "/chapters/{chapter_id}/lessons/reorder", response_model=list[CurriculumLessonOut]
)
def reorder_lessons(
    chapter_id: int, payload: LessonReorderRequest, db: Session = Depends(get_db)
) -> list[dict]:
    lessons = service.reorder_lessons(db, chapter_id, payload.lesson_ids)
    return service.lessons_out(db, lessons)


@router.patch("/lessons/{lesson_id}", response_model=CurriculumLessonOut)
def update_lesson(
    lesson_id: int, payload: LessonPatch, db: Session = Depends(get_db)
) -> dict:
    """Édition (`title`, `summary`, `notions` — fournie = remplace le rattachement,
    `content` — écriture/édition manuelle du cours, statut inchangé)."""
    lesson = service.update_lesson(
        db,
        lesson_id,
        title=payload.title,
        summary=payload.summary,
        notions=payload.notions,
        content=payload.content,
    )
    return service.lessons_out(db, [lesson])[0]


@router.post("/lessons/{lesson_id}/validate", response_model=CurriculumLessonOut)
def validate_lesson(lesson_id: int, db: Session = Depends(get_db)) -> dict:
    """`draft` → `validated` (409 sinon). Le statut du chapitre ne bouge pas (§3)."""
    lesson = service.set_lesson_validation(db, lesson_id, "validate")
    return service.lessons_out(db, [lesson])[0]


@router.post("/lessons/{lesson_id}/reject", response_model=CurriculumLessonOut)
def reject_lesson(lesson_id: int, db: Session = Depends(get_db)) -> dict:
    """`draft` → `archived` (l'énuméré de `lessons.status` n'a pas de `rejected`)."""
    lesson = service.set_lesson_validation(db, lesson_id, "reject")
    return service.lessons_out(db, [lesson])[0]


@router.post("/lessons/{lesson_id}/generate-content", response_model=CurriculumLessonOut)
def generate_lesson_content(
    lesson_id: int,
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_provider),
) -> dict:
    """Rédige le cours complet (markdown) de la leçon — requête longue synchrone
    (~40-60 s), moteur LOCAL (`get_provider`, jamais la dérogation cloud `curriculum_*`).
    409 si la leçon est archivée ; la régénération écrase le cours existant."""
    try:
        lesson = service.generate_lesson_content(db, llm, lesson_id)
    except service.CurriculumGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}"
        ) from exc
    return service.lessons_out(db, [lesson])[0]


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(lesson_id: int, db: Session = Depends(get_db)) -> None:
    service.delete_lesson(db, lesson_id)


# ---------------------------------------------------------------------------
# Lecture élève (page Cours de Massimo) — cf. docs/frontend-massimo/page-cours.md.
# ---------------------------------------------------------------------------


@student_router.get("/cours/{subject_slug}", response_model=StudentCoursOut)
def student_cours(subject_slug: str, db: Session = Depends(get_db)) -> dict:
    """Chapitres validés de l'année active + leçons validées (référence légère)."""
    return service.student_cours_for_subject(db, subject_slug)


@student_router.get("/lessons/{lesson_id}/cours", response_model=StudentLessonContentOut)
def student_lesson_cours(lesson_id: int, db: Session = Depends(get_db)) -> dict:
    """Cours (markdown) d'une leçon validée — 404 sinon, sans fuite des brouillons."""
    return service.student_lesson_content(db, lesson_id)
