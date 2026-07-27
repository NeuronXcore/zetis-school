"""Routes HTTP du référentiel de programme — Lot 1 Slice A (ADR-0009), Papa uniquement.

`GET /api/subjects` existe déjà (module subjects) : non dupliqué ici. La page Papa
« Programme » (Slice B, étape 14) consommera ces endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.activity.events import EVENT_LESSON_VIEWED, log_view_once_per_day
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.curriculum import get_curriculum_provider, service
from app.modules.eli5.service import get_default_student
from app.modules.notions import service as notions_service
from app.modules.notions.schemas import NotionRequestOut, NotionRequestPatch
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
    LessonSuggestionOut,
    SkillsBackfillConfirmRequest,
    SkillsBackfillConfirmResult,
    SkillsBackfillGenerateRequest,
    SkillsBackfillPreview,
    StudentCoursOut,
    StudentLessonContentOut,
    StudentNotionsSummaryOut,
    SubjectNotionsOut,
)
from app.modules.subjects.resolver import subject_id_for_lesson

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


@router.post(
    "/chapters/{chapter_id}/extend-lessons",
    response_model=list[CurriculumLessonOut],
    status_code=status.HTTP_201_CREATED,
)
def extend_lessons(
    chapter_id: int,
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_curriculum_provider),
) -> list[dict]:
    """Complète la liste de leçons SANS rien supprimer (brouillons inclus) : l'existant
    est injecté dans le prompt et les doublons de titre sont écartés. Mêmes préconditions
    que la passe 2 (chapitre validé ou manuel, sinon 409) ; requête longue ~10-30 s."""
    try:
        lessons = service.generate_lessons(db, llm, chapter_id, mode="extend")
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
# Génération « skills-only » pour un niveau antérieur (rattrapage) — ADR-0010.
# Flux stateless en deux temps, Papa uniquement (garde `require_parent` du routeur).
# ---------------------------------------------------------------------------


@router.post("/curriculum/skills-backfill/generate", response_model=SkillsBackfillPreview)
def skills_backfill_generate(
    payload: SkillsBackfillGenerateRequest,
    db: Session = Depends(get_db),
    llm: LLMProvider = Depends(get_curriculum_provider),
) -> dict:
    """Enchaîne passes 1 et 2 EN MÉMOIRE et renvoie la prévisualisation des notions du
    niveau demandé (aucune persistance) — requête longue synchrone (~6-9 appels LLM).
    400 si le niveau est hors cycle 4 ; 503 si la clé cloud est absente (via la dépendance)."""
    try:
        return service.generate_skills_backfill(db, llm, payload.subject_id, payload.level)
    except service.CurriculumGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}"
        ) from exc


@router.post("/curriculum/skills-backfill/confirm", response_model=SkillsBackfillConfirmResult)
def skills_backfill_confirm(
    payload: SkillsBackfillConfirmRequest, db: Session = Depends(get_db)
) -> dict:
    """Upsert les notions revues par Papa en `Skill` au niveau cible (aucune leçon, aucune
    liaison créée). Idempotent. Pas d'appel LLM ici : le client porte la liste (stateless)."""
    return service.confirm_skills_backfill(
        db, payload.subject_id, payload.level, [n.name for n in payload.notions]
    )


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
    content = service.student_lesson_content(db, lesson_id)
    # Journal d'activité : consultation tracée AU PLUS une fois par (élève, leçon, jour Paris)
    # — un rafraîchissement de page n'est pas une activité. Après le service : une leçon
    # introuvable (404) n'entre jamais dans le journal.
    log_view_once_per_day(
        db,
        student_id=get_default_student(db).id,
        event_type=EVENT_LESSON_VIEWED,
        payload_key="lesson_id",
        payload_value=lesson_id,
        subject_id=subject_id_for_lesson(db, lesson_id),
        payload={"lesson_id": lesson_id, "lesson_title": content["title"]},
    )
    db.commit()
    return content


@student_router.get("/notions/summary", response_model=StudentNotionsSummaryOut)
def student_notions_summary(db: Session = Depends(get_db)) -> dict:
    """Compteur de notions validées par matière de l'année active (decks ELI5 v2)."""
    return service.student_notions_summary(db)


@student_router.get("/subjects/{subject_slug}/notions", response_model=SubjectNotionsOut)
def student_subject_notions(subject_slug: str, db: Session = Depends(get_db)) -> dict:
    """Notions validées d'une matière (dédup par skill_id) — 404 si hors année active,
    `notions: []` si la matière n'a encore rien de validé. Route neutre (dérivés multiples)."""
    return service.student_subject_notions(db, subject_slug)


@student_router.get("/lesson-suggestions", response_model=list[LessonSuggestionOut])
def student_lesson_suggestions(db: Session = Depends(get_db)) -> list[dict]:
    """Notions à explorer (chips ELI5) tirées des leçons en cours de Massimo.

    Année active + leçons validées, ordre du curriculum, priorité aux non-maîtrisées.
    Vide propre si pas d'année active / pas de leçon validée avec notions.
    """
    return service.lesson_suggestions(db)


# ---------------------------------------------------------------------------
# Demandes de notions hors-programme (ELI5 → « Dis à Papa ») — Papa uniquement.
# L'enfant les crée via POST /api/ai/eli5/request-notion ; ici Papa les liste et les trie.
# ---------------------------------------------------------------------------


@router.get("/notion-requests", response_model=list[NotionRequestOut])
def list_notion_requests(
    status: str | None = "pending", db: Session = Depends(get_db)
) -> list[dict]:
    """Demandes de notions de l'enfant (par défaut celles en attente), récentes d'abord."""
    return notions_service.list_requests(db, status)


@router.patch("/notion-requests/{request_id}", response_model=NotionRequestOut)
def patch_notion_request(
    request_id: int, body: NotionRequestPatch, db: Session = Depends(get_db)
) -> dict:
    """Triage : marquer une demande added (ajoutée au programme) ou dismissed (ignorée)."""
    return notions_service.set_status(db, request_id, body.status)
