"""Service du référentiel de programme — passe 1 : chapitres (Lot 1 Slice A) et
passe 2 : leçons + notions (Lot 2 Slice A), ADR-0009.

Pipeline identique aux capsules (ADR-0007) : prompt versionné → `LLMProvider.generate`
avec sortie structurée `fmt` → validation Pydantic stricte → UNE réparation max → erreur
propre (rien d'invalide persisté). Chaque appel laisse une trace `ai_jobs`
(`job_type="curriculum_chapters"` / `"curriculum_lessons"`, provider/modèle inclus).

Règles de co-construction (ADR-0009 §3), codées ici et testées :
- généré → `pending`/`draft` obligatoire ; écrit par Papa → validé d'office ;
- la régénération ne touche JAMAIS les nœuds manuels ni validés : elle remplace
  uniquement le généré non validé, et injecte l'existant conservé dans le prompt ;
- `sort_order` : les nouveaux nœuds s'ajoutent APRÈS l'existant conservé ;
- cascade indépendante : valider une leçon ne modifie pas le statut du chapitre.

Passe 2 en plus : chaque notion générée upserte une `Skill` (référentiel persistant),
dédupliquée par (subject_id, level, nom normalisé casse/espaces) — le matching
sémantique par embedding est Lot 3.
"""

import logging
import re
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Chapter,
    Lesson,
    LessonSkill,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    Subject,
)
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.curriculum.schemas import (
    GeneratedChapter,
    GeneratedChapters,
    GeneratedLessonContent,
    GeneratedLessons,
    generation_schema,
    lesson_content_schema,
    lessons_generation_schema,
)
from app.prompts import curriculum, lesson_content

logger = logging.getLogger(__name__)

# Résolution niveau → cycle (collège ; le lycée est par classe, cf. ADR-0009 §8).
CYCLE_BY_LEVEL = {"6e": "cycle 3", "5e": "cycle 4", "4e": "cycle 4", "3e": "cycle 4"}
# Niveaux couverts par le rattrapage « skills-only » (ADR-0010) : cycle 4 uniquement.
# Le lycée (2de…) est différé (ADR-0009 §8) → 400 explicite hors de cette liste.
CYCLE_4_LEVELS = ("5e", "4e", "3e")
# Référence opérative 2026-2027 : BO cycle 4 du 30 juillet 2020 (ADR-0009 §5).
DEFAULT_PROGRAM_VERSION = "2020"


class CurriculumGenerationError(Exception):
    """La génération a échoué (sortie LLM invalide même après une réparation)."""


def _strip_fences(text: str) -> str:
    """Nettoyage défensif : retire d'éventuelles balises ``` (repli local ollama)."""
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def _try_validate(raw: str, model_cls=GeneratedChapters):
    """Valide `raw` (GeneratedChapters par défaut). Retourne (obj, None) ou (None, erreur)."""
    try:
        return model_cls.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:6]
        )
        return None, detail or "schéma invalide"
    except ValueError as exc:  # JSON malformé (JSONDecodeError hérite de ValueError)
        return None, f"JSON invalide : {exc}"


def _sys_or_404(db: Session, school_year_subject_id: int) -> SchoolYearSubject:
    sys_row = db.get(SchoolYearSubject, school_year_subject_id)
    if sys_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matière d'année {school_year_subject_id} introuvable.",
        )
    return sys_row


def _chapter_or_404(db: Session, chapter_id: int) -> Chapter:
    chapter = db.get(Chapter, chapter_id)
    if chapter is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Chapitre {chapter_id} introuvable."
        )
    return chapter


def _generated_metadata(generated: GeneratedChapter) -> dict:
    """Métadonnées structurées → `metadata_json` (13-bis) : requêtables, dépliées par
    l'API. `description` reste le texte humain du LLM, sans aucune sérialisation."""
    return {
        "themes": generated.themes,
        "suggested_class": generated.suggested_class,
        "repartition": generated.repartition,
        "prompt_version": curriculum.CURRICULUM_PROMPT_VERSION,
    }


def _next_sort_order(chapters: list[Chapter]) -> int:
    return max((c.sort_order for c in chapters), default=-1) + 1


def generate_chapters(
    db: Session, llm: LLMProvider, school_year_subject_id: int
) -> list[Chapter]:
    """Passe 1 : génère et persiste les chapitres d'une matière de l'année (synchrone).

    Lève `CurriculumGenerationError` si la sortie reste invalide après UNE réparation —
    dans ce cas rien n'est persisté et les chapitres existants sont intacts.
    """
    sys_row = _sys_or_404(db, school_year_subject_id)
    year = db.get(SchoolYear, sys_row.school_year_id)
    subject = db.get(Subject, sys_row.subject_id)
    level = year.level
    cycle = CYCLE_BY_LEVEL.get(level, level)
    program_version = DEFAULT_PROGRAM_VERSION

    existing = list(
        db.scalars(
            select(Chapter)
            .where(Chapter.school_year_subject_id == school_year_subject_id)
            .order_by(Chapter.sort_order, Chapter.id)
        )
    )
    # Conservés = manuels OU validés (jamais touchés par une régénération, §3). Leurs
    # intitulés sont injectés dans le prompt (« complète sans dupliquer »).
    kept = [c for c in existing if c.source == "manual" or c.validation_status == "validated"]
    replaceable = [
        c for c in existing if c.source == "generated" and c.validation_status != "validated"
    ]

    system, prompt = curriculum.build_chapters_prompt(
        subject.name, level, cycle, program_version, [c.name for c in kept]
    )
    schema = generation_schema()

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="curriculum_chapters",
        status="running",
        input_json={
            "school_year_subject_id": school_year_subject_id,
            "subject": subject.name,
            "level": level,
            "cycle": cycle,
            "program_version": program_version,
            "existing_kept_chapters": len(kept),
            "prompt_version": curriculum.CURRICULUM_PROMPT_VERSION,
            "provider": type(llm).__name__,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        response = llm.generate(LLMRequest(system=system, prompt=prompt, fmt=schema))
        raw, model_used = response.text, response.model
        result, error = _try_validate(raw)

        if result is None:
            # UNE seule réparation : prompt + réponse fautive + erreur concrète.
            repair_prompt = (
                f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                f"{curriculum.REPAIR_INSTRUCTION}{error}"
            )
            response = llm.generate(LLMRequest(system=system, prompt=repair_prompt, fmt=schema))
            raw, model_used = response.text, response.model
            result, error = _try_validate(raw)

        if result is None:
            raise CurriculumGenerationError(
                f"GeneratedChapters invalide après réparation : {error}"
            )
    except CurriculumGenerationError as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise CurriculumGenerationError(f"Appel LLM échoué : {exc}") from exc

    # Persistance (§3) : remplace uniquement les `generated` non validés ; append après
    # l'existant conservé.
    for chapter in replaceable:
        db.delete(chapter)
    next_order = _next_sort_order(kept)
    created: list[Chapter] = []
    for i, generated in enumerate(result.chapters):
        chapter = Chapter(
            school_year_subject_id=school_year_subject_id,
            name=generated.title[:160],
            description=generated.description.strip() or None,
            sort_order=next_order + i,
            status="planned",
            source="generated",
            validation_status="pending",
            program_version=result.program_version,
            metadata_json=_generated_metadata(generated),
        )
        db.add(chapter)
        created.append(chapter)

    job.status = "succeeded"
    job.output_json = {
        "chapters_count": len(created),
        "replaced_pending": len(replaceable),
        "model": model_used,
    }
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    for chapter in created:
        db.refresh(chapter)
    return created


# ---------------------------------------------------------------------------
# CRUD Papa (co-construction, ADR-0009 §3).
# ---------------------------------------------------------------------------


def _active_year_or_404(db: Session) -> SchoolYear:
    year = db.scalars(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    ).first()
    if year is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune année scolaire active.",
        )
    return year


def active_year_with_subjects(db: Session) -> dict:
    """Année active + ses matières (`school_year_subject_id`) — lecture seule (Slice B).

    La page Papa « Programme » en a besoin pour ses pills : `GET /api/subjects` ne
    porte pas le rattachement à l'année.
    """
    year = _active_year_or_404(db)
    rows = db.execute(
        select(SchoolYearSubject, Subject)
        .join(Subject, SchoolYearSubject.subject_id == Subject.id)
        .where(SchoolYearSubject.school_year_id == year.id)
        .order_by(Subject.sort_order, Subject.id)
    ).all()
    return {
        "id": year.id,
        "label": year.label,
        "level": year.level,
        "subjects": [
            {
                "id": sys_row.id,
                "subject_id": subject.id,
                "subject_name": subject.name,
                "subject_slug": subject.slug,
                "subject_icon": subject.icon,
                "status": sys_row.status,
            }
            for sys_row, subject in rows
        ],
    }


def list_chapters(db: Session, school_year_subject_id: int) -> list[Chapter]:
    _sys_or_404(db, school_year_subject_id)
    return list(
        db.scalars(
            select(Chapter)
            .where(Chapter.school_year_subject_id == school_year_subject_id)
            .order_by(Chapter.sort_order, Chapter.id)
        )
    )


def create_manual_chapter(
    db: Session,
    school_year_subject_id: int,
    name: str,
    description: str | None = None,
    period: str | None = None,
    themes: list[str] | None = None,
    suggested_class: str | None = None,
    repartition: str | None = None,
) -> Chapter:
    """Écrit par Papa → validé d'office (*écrire* ≠ *choisir*, ADR-0009 §3).

    Métadonnées optionnelles (13-bis) : sans elles, `metadata_json` reste null."""
    _sys_or_404(db, school_year_subject_id)
    metadata = None
    if themes is not None or suggested_class is not None or repartition is not None:
        metadata = {
            "themes": themes,
            "suggested_class": suggested_class,
            "repartition": repartition,
        }
    next_order = (
        db.scalar(
            select(func.coalesce(func.max(Chapter.sort_order), -1)).where(
                Chapter.school_year_subject_id == school_year_subject_id
            )
        )
        + 1
    )
    chapter = Chapter(
        school_year_subject_id=school_year_subject_id,
        name=name.strip(),
        description=description,
        period=period,
        sort_order=next_order,
        status="planned",
        source="manual",
        validation_status="validated",
        metadata_json=metadata,
    )
    db.add(chapter)
    db.commit()
    db.refresh(chapter)
    return chapter


def validate_all_chapters(db: Session, school_year_subject_id: int) -> int:
    """Passe en `validated` tous les chapitres `pending` de la matière.

    Les `rejected` (décision explicite de Papa) et les `manual` (déjà validés d'office)
    ne sont pas touchés — le lot n'est qu'un raccourci de la validation unitaire (§3)."""
    _sys_or_404(db, school_year_subject_id)
    chapters = db.scalars(
        select(Chapter).where(
            Chapter.school_year_subject_id == school_year_subject_id,
            Chapter.validation_status == "pending",
        )
    ).all()
    for chapter in chapters:
        chapter.validation_status = "validated"
    db.commit()
    return len(chapters)


def validate_all_active_year(db: Session) -> int:
    """Comme `validate_all_chapters`, mais sur TOUTES les matières de l'année active."""
    year = _active_year_or_404(db)
    chapters = db.scalars(
        select(Chapter)
        .join(SchoolYearSubject, Chapter.school_year_subject_id == SchoolYearSubject.id)
        .where(
            SchoolYearSubject.school_year_id == year.id,
            Chapter.validation_status == "pending",
        )
    ).all()
    for chapter in chapters:
        chapter.validation_status = "validated"
    db.commit()
    return len(chapters)


def update_chapter(
    db: Session,
    chapter_id: int,
    name: str | None = None,
    description: str | None = None,
    period: str | None = None,
    validation_action: str | None = None,
) -> Chapter:
    chapter = _chapter_or_404(db, chapter_id)
    if name is not None:
        chapter.name = name.strip()
    if description is not None:
        chapter.description = description
    if period is not None:
        chapter.period = period
    if validation_action == "validate":
        chapter.validation_status = "validated"
    elif validation_action == "reject":
        chapter.validation_status = "rejected"
    db.commit()
    db.refresh(chapter)
    return chapter


def delete_chapter(db: Session, chapter_id: int) -> None:
    chapter = _chapter_or_404(db, chapter_id)
    db.delete(chapter)
    db.commit()


def reorder_chapters(
    db: Session, school_year_subject_id: int, chapter_ids: list[int]
) -> list[Chapter]:
    """Applique l'ordre donné (liste COMPLÈTE des ids de la matière → `sort_order`)."""
    chapters = list_chapters(db, school_year_subject_id)
    current_ids = {c.id for c in chapters}
    if set(chapter_ids) != current_ids or len(chapter_ids) != len(current_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La liste doit contenir exactement les ids des chapitres de cette matière "
                f"(attendus : {sorted(current_ids)})."
            ),
        )
    by_id = {c.id: c for c in chapters}
    for position, chapter_id in enumerate(chapter_ids):
        by_id[chapter_id].sort_order = position
    db.commit()
    return [by_id[cid] for cid in chapter_ids]


# ---------------------------------------------------------------------------
# Passe 2 : leçons + notions d'un chapitre (Lot 2 Slice A, ADR-0009 §1/§3).
# ---------------------------------------------------------------------------


def _lesson_or_404(db: Session, lesson_id: int) -> Lesson:
    lesson = db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Leçon {lesson_id} introuvable."
        )
    return lesson


def _lesson_context(db: Session, chapter: Chapter) -> tuple[Subject, str, str]:
    """Résout (subject, level, cycle) du chapitre — requis pour le prompt et l'upsert
    des `Skill` (scopées matière + niveau). Un chapitre rattaché à un thème seul (sans
    `school_year_subject_id`) n'a pas de niveau : erreur métier explicite."""
    if chapter.school_year_subject_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=(
                f"Chapitre {chapter.id} non rattaché à une matière d'année scolaire : "
                "impossible de résoudre le niveau pour générer des leçons."
            ),
        )
    sys_row = _sys_or_404(db, chapter.school_year_subject_id)
    year = db.get(SchoolYear, sys_row.school_year_id)
    subject = db.get(Subject, sys_row.subject_id)
    level = year.level
    return subject, level, CYCLE_BY_LEVEL.get(level, level)


def _normalize_skill_name(name: str) -> str:
    """Clé de dédup `Skill` : casse et espaces neutralisés (le matching sémantique par
    embedding + confirmation Papa est Lot 3 — hors périmètre ici)."""
    return " ".join(name.split()).casefold()


def _upsert_skills(
    db: Session, subject_id: int, level: str, notion_names: list[str]
) -> tuple[dict[str, Skill], int]:
    """Résout/insère une `Skill` par clé (subject_id, level, nom normalisé) — jamais de
    doublon à la régénération. Retourne (map nom_normalisé → Skill, nb créées)."""
    existing = db.scalars(
        select(Skill).where(Skill.subject_id == subject_id, Skill.level == level)
    ).all()
    by_key: dict[str, Skill] = {_normalize_skill_name(s.name): s for s in existing}
    created = 0
    for raw_name in notion_names:
        pretty = " ".join(raw_name.split())
        key = _normalize_skill_name(pretty)
        if not key or key in by_key:
            continue
        skill = Skill(subject_id=subject_id, name=pretty[:160], level=level)
        db.add(skill)
        by_key[key] = skill
        created += 1
    db.flush()  # ids nécessaires pour les liaisons
    return by_key, created


def _link_lesson_skills(db: Session, lesson: Lesson, skills: list[Skill]) -> None:
    seen: set[int] = set()
    for skill in skills:
        if skill.id in seen:
            continue
        seen.add(skill.id)
        db.add(LessonSkill(lesson_id=lesson.id, skill_id=skill.id))


def _lessons_of_chapter(db: Session, chapter_id: int) -> list[Lesson]:
    return list(
        db.scalars(
            select(Lesson)
            .where(Lesson.chapter_id == chapter_id)
            .order_by(Lesson.sort_order, Lesson.id)
        )
    )


def _normalize_lesson_title(title: str) -> str:
    """Clé de dédup des titres de leçons — même esprit que `_normalize_skill_name`."""
    return " ".join(title.casefold().split())


def generate_lessons(
    db: Session, llm: LLMProvider, chapter_id: int, mode: str = "replace"
) -> list[Lesson]:
    """Passe 2 : génère et persiste les leçons + notions d'un chapitre (synchrone).

    Entrée = chapitre **validé ou manuel** uniquement (ADR-0009 §1), sinon refus 409.
    `mode="replace"` (défaut, §3) : ne touche jamais les leçons `parent`/`imported` ni
    `validated` ; remplace uniquement les leçons IA non validées, et append après
    l'existant conservé. `mode="extend"` : ne supprime RIEN — toutes les leçons
    existantes sont injectées dans le prompt (« complète sans dupliquer ») et les
    propositions dont le titre normalisé existe déjà sont écartées (filet anti-doublon).
    Chaque notion upserte une `Skill` (dédup par nom normalisé). Lève
    `CurriculumGenerationError` si la sortie reste invalide après UNE réparation —
    rien n'est alors persisté (rollback).
    """
    chapter = _chapter_or_404(db, chapter_id)
    if not (chapter.validation_status == "validated" or chapter.source == "manual"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Chapitre {chapter_id} ni validé ni manuel "
                f"(source={chapter.source}, validation_status={chapter.validation_status}) : "
                "valide-le d'abord pour générer ses leçons (ADR-0009 §1)."
            ),
        )
    subject, level, cycle = _lesson_context(db, chapter)
    # Version reprise du chapitre ; un chapitre manuel n'en a pas → référence opérative.
    program_version = chapter.program_version or DEFAULT_PROGRAM_VERSION

    existing = _lessons_of_chapter(db, chapter_id)
    if mode == "extend":
        # Extension : RIEN n'est supprimé. Toutes les leçons existantes (archivées
        # incluses — une leçon rejetée par Papa ne doit pas être re-proposée) sont
        # injectées dans le prompt comme « à ne jamais dupliquer, complète autour ».
        kept = existing
        replaceable = []
    else:
        # Conservées = manuelles/importées OU validées (jamais touchées, §3), injectées
        # dans le prompt. Remplaçables = IA non validées (draft ou archivées/rejetées)
        # — même règle que la passe 1.
        kept = [l for l in existing if l.created_by != "ai" or l.status == "validated"]
        replaceable = [l for l in existing if l.created_by == "ai" and l.status != "validated"]

    meta = chapter.metadata_json or {}
    system, prompt = curriculum.build_lessons_prompt(
        subject.name,
        level,
        cycle,
        {"name": chapter.name, "description": chapter.description, "themes": meta.get("themes")},
        program_version,
        [l.title for l in kept],
    )
    schema = lessons_generation_schema()

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="curriculum_lessons",
        status="running",
        input_json={
            "chapter_id": chapter_id,
            "chapter": chapter.name,
            "subject": subject.name,
            "level": level,
            "cycle": cycle,
            "program_version": program_version,
            "mode": mode,
            "existing_kept_lessons": len(kept),
            "prompt_version": curriculum.LESSONS_PROMPT_VERSION,
            "provider": type(llm).__name__,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        response = llm.generate(LLMRequest(system=system, prompt=prompt, fmt=schema))
        raw, model_used = response.text, response.model
        result, error = _try_validate(raw, GeneratedLessons)

        if result is None:
            repair_prompt = (
                f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                f"{curriculum.LESSONS_REPAIR_INSTRUCTION}{error}"
            )
            response = llm.generate(LLMRequest(system=system, prompt=repair_prompt, fmt=schema))
            raw, model_used = response.text, response.model
            result, error = _try_validate(raw, GeneratedLessons)

        if result is None:
            raise CurriculumGenerationError(
                f"GeneratedLessons invalide après réparation : {error}"
            )
    except CurriculumGenerationError as exc:
        # Rien n'a été ajouté en session avant ce point (l'upsert vient après la
        # validation réussie) : le commit ne persiste que la trace d'échec.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise CurriculumGenerationError(f"Appel LLM échoué : {exc}") from exc

    # Persistance (§3) : remplace uniquement les leçons IA non validées ; append après
    # l'existant conservé. Liaisons purgées avec la leçon (SQLite n'applique pas le
    # CASCADE des FK par défaut → purge explicite).
    for lesson in replaceable:
        db.execute(LessonSkill.__table__.delete().where(LessonSkill.lesson_id == lesson.id))
        db.delete(lesson)
    # Filet anti-doublon : le prompt interdit de dupliquer les conservées, mais le LLM
    # peut récidiver — toute proposition dont le titre normalisé (casse/espaces) matche
    # une leçon conservée est écartée (essentiel en mode extend : rien n'est remplacé).
    kept_titles = {_normalize_lesson_title(l.title) for l in kept}
    proposals = [
        gl for gl in result.lessons if _normalize_lesson_title(gl.title) not in kept_titles
    ]
    duplicates_dropped = len(result.lessons) - len(proposals)
    all_notions = [n for gl in proposals for n in gl.notions]
    skills_by_key, skills_created = _upsert_skills(db, subject.id, level, all_notions)
    next_order = max((l.sort_order for l in kept), default=-1) + 1
    created: list[Lesson] = []
    for i, generated in enumerate(proposals):
        lesson = Lesson(
            chapter_id=chapter_id,
            title=generated.title[:160],
            summary=generated.summary.strip() or None,
            content_markdown=None,  # rempli plus tard par `generate_lesson_content` (local)
            status="draft",  # = pending, obligatoire pour du généré (§3)
            created_by="ai",
            sort_order=next_order + i,
            program_version=program_version,
        )
        db.add(lesson)
        db.flush()
        _link_lesson_skills(
            db, lesson, [skills_by_key[_normalize_skill_name(n)] for n in generated.notions]
        )
        created.append(lesson)

    job.status = "succeeded"
    job.output_json = {
        "lessons_count": len(created),
        "replaced_drafts": len(replaceable),
        "duplicates_dropped": duplicates_dropped,
        "skills_created": skills_created,
        "skills_reused": len({_normalize_skill_name(n) for n in all_notions}) - skills_created,
        "model": model_used,
    }
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    # Réponse = liste complète des leçons du chapitre après génération (conservées + créées).
    return _lessons_of_chapter(db, chapter_id)


def list_lessons(db: Session, chapter_id: int) -> list[Lesson]:
    _chapter_or_404(db, chapter_id)
    return _lessons_of_chapter(db, chapter_id)


# Garantie « markdown pur » sur le cours persisté : le prompt l'exige, mais un modèle
# local peut récidiver (vu en réel : <details>/<summary> pour cacher les solutions,
# que react-markdown échappe à juste titre → balises affichées en texte). Conversion
# douce (summary → gras, <br> → saut de ligne) puis suppression des balises HTML
# CONNUES uniquement — une liste fermée, pour ne jamais toucher un « x<y et z>2 »
# mathématique légitime.
_HTML_SUMMARY = re.compile(r"<summary>(.*?)</summary>", re.IGNORECASE | re.DOTALL)
_HTML_BR = re.compile(r"<br\s*/?>", re.IGNORECASE)
_HTML_KNOWN_TAGS = re.compile(
    r"</?(?:details|summary|div|span|p|b|i|u|em|strong|sub|sup|hr|ul|ol|li|"
    r"table|thead|tbody|tr|td|th|h[1-6])(?:\s[^<>\n]*)?/?>",
    re.IGNORECASE,
)


def _scrub_content_html(content: str) -> str:
    content = _HTML_SUMMARY.sub(lambda m: f"**{m.group(1).strip()}**", content)
    content = _HTML_BR.sub("\n", content)
    return _HTML_KNOWN_TAGS.sub("", content)


def _touch_content_audit(lesson: Lesson, by: str) -> None:
    """Provenance du cours : `created_*` posés au premier write seulement,
    `updated_*` écrasés à chaque write. `by` ∈ ('ai', 'parent')."""
    now = datetime.now(timezone.utc)
    if lesson.content_created_at is None:
        lesson.content_created_at = now
        lesson.content_created_by = by
    lesson.content_updated_at = now
    lesson.content_updated_by = by


def generate_lesson_content(db: Session, llm: LLMProvider, lesson_id: int) -> Lesson:
    """Rédige le cours complet (markdown) d'une leçon — synchrone, moteur LOCAL.

    Injecté avec `get_provider()` (Ollama), jamais le provider `curriculum_*` : la
    dérogation cloud reste bornée au référentiel. Toute leçon non archivée est
    rédigeable (`draft` inclus : relire le cours aide à valider) ; la régénération
    écrase `content_markdown`. **Gate du cours canonique (addendum ADR-0009 §A)** :
    une écriture réussie repasse la leçon en `status='draft'` (même si elle était
    `validated`) — un cours réécrit non relu ne doit pas alimenter les dérivés ni
    Massimo avant revalidation. Lève `CurriculumGenerationError` si la sortie reste
    invalide après UNE réparation — le contenu et le statut existants ne sont alors
    pas touchés.
    """
    lesson = _lesson_or_404(db, lesson_id)
    if lesson.status == "archived":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Leçon {lesson_id} archivée : hors du flux, cours non rédigeable.",
        )
    chapter = _chapter_or_404(db, lesson.chapter_id)
    subject, level, cycle = _lesson_context(db, chapter)
    program_version = lesson.program_version or chapter.program_version or DEFAULT_PROGRAM_VERSION
    notions = [
        name
        for (name,) in db.execute(
            select(Skill.name)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id == lesson.id)
            .order_by(Skill.id)
        ).all()
    ]

    system, prompt = lesson_content.build_prompt(
        subject.name,
        level,
        cycle,
        {"name": chapter.name, "description": chapter.description},
        {"title": lesson.title, "summary": lesson.summary},
        notions,
        program_version,
    )
    schema = lesson_content_schema()

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="lesson_content",
        status="running",
        input_json={
            "lesson_id": lesson_id,
            "lesson_title": lesson.title,
            "chapter_id": chapter.id,
            "chapter": chapter.name,
            "subject": subject.name,
            "level": level,
            "program_version": program_version,
            "notions_count": len(notions),
            "regenerate": lesson.content_markdown is not None,
            "prompt_version": lesson_content.LESSON_CONTENT_PROMPT_VERSION,
            "provider": type(llm).__name__,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        response = llm.generate(LLMRequest(system=system, prompt=prompt, fmt=schema))
        raw, model_used = response.text, response.model
        result, error = _try_validate(raw, GeneratedLessonContent)

        if result is None:
            repair_prompt = (
                f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                f"{lesson_content.REPAIR_INSTRUCTION}{error}"
            )
            response = llm.generate(LLMRequest(system=system, prompt=repair_prompt, fmt=schema))
            raw, model_used = response.text, response.model
            result, error = _try_validate(raw, GeneratedLessonContent)

        if result is None:
            raise CurriculumGenerationError(
                f"GeneratedLessonContent invalide après réparation : {error}"
            )
    except CurriculumGenerationError as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise CurriculumGenerationError(f"Appel LLM échoué : {exc}") from exc

    lesson.content_markdown = _scrub_content_html(result.content).strip()
    _touch_content_audit(lesson, "ai")
    # Gate du cours canonique (addendum ADR-0009 §A) : un cours fraîchement (re)généré
    # n'est pas relu — il doit repasser en `draft` pour ne PAS alimenter les dérivés
    # ni Massimo avant revalidation par Papa, même si la leçon était `validated`.
    # (`archived` a déjà été refusée 409 en amont ; une leçon `draft` reste `draft`.)
    lesson.status = "draft"
    job.status = "succeeded"
    job.output_json = {"content_chars": len(lesson.content_markdown), "model": model_used}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(lesson)
    return lesson


def create_manual_lesson(
    db: Session,
    chapter_id: int,
    title: str,
    summary: str | None = None,
    notions: list[str] | None = None,
) -> Lesson:
    """Écrite par Papa → `created_by='parent'`, `status='validated'` d'office (§3)."""
    chapter = _chapter_or_404(db, chapter_id)
    next_order = (
        db.scalar(
            select(func.coalesce(func.max(Lesson.sort_order), -1)).where(
                Lesson.chapter_id == chapter_id
            )
        )
        + 1
    )
    lesson = Lesson(
        chapter_id=chapter_id,
        title=title.strip(),
        summary=summary,
        status="validated",
        created_by="parent",
        sort_order=next_order,
    )
    db.add(lesson)
    db.flush()
    if notions:
        subject, level, _ = _lesson_context(db, chapter)
        skills_by_key, _ = _upsert_skills(db, subject.id, level, notions)
        _link_lesson_skills(
            db, lesson, [skills_by_key[_normalize_skill_name(n)] for n in notions]
        )
    db.commit()
    db.refresh(lesson)
    return lesson


def update_lesson(
    db: Session,
    lesson_id: int,
    title: str | None = None,
    summary: str | None = None,
    notions: list[str] | None = None,
    content: str | None = None,
) -> Lesson:
    """Édition partielle. `notions` fournie = remplace le rattachement (upsert des
    nouvelles) ; les `Skill` elles-mêmes ne sont jamais supprimées (référentiel).
    `content` fourni = écriture/édition manuelle du cours (même scrub markdown que la
    rédaction IA, provenance 'parent') — le `status` de la leçon ne bouge pas : Papa
    est l'autorité de validation, sa propre édition n'a pas à être revalidée."""
    lesson = _lesson_or_404(db, lesson_id)
    if title is not None:
        lesson.title = title.strip()
    if summary is not None:
        lesson.summary = summary
    if content is not None:
        scrubbed = _scrub_content_html(content).strip()
        if not scrubbed:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Le cours ne peut pas être vide.",
            )
        lesson.content_markdown = scrubbed
        _touch_content_audit(lesson, "parent")
    if notions is not None:
        chapter = _chapter_or_404(db, lesson.chapter_id)
        subject, level, _ = _lesson_context(db, chapter)
        db.execute(LessonSkill.__table__.delete().where(LessonSkill.lesson_id == lesson.id))
        skills_by_key, _ = _upsert_skills(db, subject.id, level, notions)
        _link_lesson_skills(
            db, lesson, [skills_by_key[_normalize_skill_name(n)] for n in notions]
        )
    db.commit()
    db.refresh(lesson)
    return lesson


def set_lesson_validation(db: Session, lesson_id: int, action: str) -> Lesson:
    """`validate`/`reject` — uniquement pertinents sur une leçon `draft` (§3).

    Rejet → `archived` : l'énuméré documenté de `lessons.status` n'a pas de `rejected` ;
    la leçon sort du flux sans suppression. Cascade indépendante : le chapitre ne bouge pas.
    """
    lesson = _lesson_or_404(db, lesson_id)
    if lesson.status != "draft":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Leçon {lesson_id} au statut '{lesson.status}' : "
            "seule une leçon 'draft' peut être validée ou rejetée.",
        )
    lesson.status = "validated" if action == "validate" else "archived"
    db.commit()
    db.refresh(lesson)
    return lesson


def delete_lesson(db: Session, lesson_id: int) -> None:
    lesson = _lesson_or_404(db, lesson_id)
    db.execute(LessonSkill.__table__.delete().where(LessonSkill.lesson_id == lesson.id))
    db.delete(lesson)
    db.commit()


def reorder_lessons(db: Session, chapter_id: int, lesson_ids: list[int]) -> list[Lesson]:
    """Applique l'ordre donné (liste COMPLÈTE des ids du chapitre → `sort_order`) —
    même convention que le réordonnancement des chapitres du Lot 1."""
    lessons = list_lessons(db, chapter_id)
    current_ids = {l.id for l in lessons}
    if set(lesson_ids) != current_ids or len(lesson_ids) != len(current_ids):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "La liste doit contenir exactement les ids des leçons de ce chapitre "
                f"(attendus : {sorted(current_ids)})."
            ),
        )
    by_id = {l.id: l for l in lessons}
    for position, lesson_id in enumerate(lesson_ids):
        by_id[lesson_id].sort_order = position
    db.commit()
    return [by_id[lid] for lid in lesson_ids]


# ---------------------------------------------------------------------------
# Lecture ÉLÈVE (page Cours de Massimo) — validé uniquement, filtrage serveur.
# ---------------------------------------------------------------------------


def student_cours_for_subject(db: Session, subject_slug: str) -> dict:
    """Chapitres VALIDÉS de l'année active pour la matière, avec leurs leçons
    VALIDÉES (référence légère, jamais le markdown complet — payload liste).

    Rien de `pending`/`draft`/`archived` ne sort d'ici (ADR-0009 §9 : rien
    n'atteint Massimo avant validation). 404 si matière inconnue ou hors année.
    """
    subject = db.scalars(select(Subject).where(Subject.slug == subject_slug)).first()
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject_slug} » inconnue.",
        )
    year = _active_year_or_404(db)
    sys_row = db.scalars(
        select(SchoolYearSubject).where(
            SchoolYearSubject.school_year_id == year.id,
            SchoolYearSubject.subject_id == subject.id,
        )
    ).first()
    if sys_row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Matière « {subject.name} » absente de l'année active.",
        )

    chapters = list(
        db.scalars(
            select(Chapter)
            .where(
                Chapter.school_year_subject_id == sys_row.id,
                Chapter.validation_status == "validated",
            )
            .order_by(Chapter.sort_order, Chapter.id)
        )
    )
    chapter_ids = [c.id for c in chapters]
    lessons_by_chapter: dict[int, list[Lesson]] = {i: [] for i in chapter_ids}
    if chapter_ids:
        for lesson in db.scalars(
            select(Lesson)
            .where(Lesson.chapter_id.in_(chapter_ids), Lesson.status == "validated")
            .order_by(Lesson.sort_order, Lesson.id)
        ):
            lessons_by_chapter[lesson.chapter_id].append(lesson)

    return {
        "subject_id": subject.id,
        "subject_name": subject.name,
        "subject_slug": subject.slug,
        "level": year.level,
        "chapters": [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "lessons": [
                    {
                        "id": l.id,
                        "title": l.title,
                        "summary": l.summary,
                        "has_content": l.content_markdown is not None,
                    }
                    for l in lessons_by_chapter[c.id]
                ],
            }
            for c in chapters
        ],
    }


def student_lesson_content(db: Session, lesson_id: int) -> dict:
    """Cours d'une leçon pour Massimo — 404 indiscernable si la leçon n'existe pas,
    n'est pas validée OU n'a pas de cours (aucune fuite d'existence des brouillons)."""
    lesson = db.get(Lesson, lesson_id)
    if lesson is None or lesson.status != "validated" or lesson.content_markdown is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pas de cours disponible pour cette leçon.",
        )
    return {
        "id": lesson.id,
        "title": lesson.title,
        "summary": lesson.summary,
        "content": lesson.content_markdown,
    }


def lessons_out(db: Session, lessons: list[Lesson]) -> list[dict]:
    """Sérialise avec notions dépliées (intitulé + `skill_id`) — jamais la liaison brute."""
    ids = [l.id for l in lessons]
    notions_by_lesson: dict[int, list[dict]] = {i: [] for i in ids}
    if ids:
        rows = db.execute(
            select(LessonSkill.lesson_id, Skill.id, Skill.name)
            .join(Skill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id.in_(ids))
            .order_by(Skill.id)
        ).all()
        for lesson_id, skill_id, skill_name in rows:
            notions_by_lesson[lesson_id].append({"skill_id": skill_id, "name": skill_name})
    return [
        {
            "id": l.id,
            "chapter_id": l.chapter_id,
            "title": l.title,
            "summary": l.summary,
            "content": l.content_markdown,
            "status": l.status,
            "created_by": l.created_by,
            "sort_order": l.sort_order,
            "program_version": l.program_version,
            "content_created_at": l.content_created_at,
            "content_created_by": l.content_created_by,
            "content_updated_at": l.content_updated_at,
            "content_updated_by": l.content_updated_by,
            "notions": notions_by_lesson[l.id],
        }
        for l in lessons
    ]


def chapter_out(chapter: Chapter) -> dict:
    # Métadonnées dépliées depuis `metadata_json` (13-bis) : null → champs null, jamais
    # d'erreur ; le frontend ne voit pas la structure de stockage.
    meta = chapter.metadata_json or {}
    return {
        "id": chapter.id,
        "school_year_subject_id": chapter.school_year_subject_id,
        "name": chapter.name,
        "description": chapter.description,
        "period": chapter.period,
        "status": chapter.status,
        "sort_order": chapter.sort_order,
        "source": chapter.source,
        "validation_status": chapter.validation_status,
        "program_version": chapter.program_version,
        "themes": meta.get("themes"),
        "suggested_class": meta.get("suggested_class"),
        "repartition": meta.get("repartition"),
    }


# ---------------------------------------------------------------------------
# Génération « skills-only » pour un niveau antérieur (rattrapage) — ADR-0010.
#
# Papa alimente le référentiel de skills d'un niveau du même cycle (ex. 5e) sans
# créer d'année scolaire rétroactive. Les passes 1 puis 2 sont enchaînées EN MÉMOIRE :
# chapitres et leçons ne servent que d'échafaudage de cadrage et ne sont JAMAIS
# persistés (décision 1). Seules les notions, après revue Papa, sont upsertées en
# `Skill` au niveau cible (confirm), en RÉUTILISANT l'upsert de la passe 2 — même clé,
# même normalisation, et AUCUNE ligne `lesson_skills` (aucune leçon dans ce flux).
# ---------------------------------------------------------------------------


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Matière {subject_id} introuvable."
        )
    return subject


def _require_cycle4_level(level: str) -> None:
    """Le rattrapage ne couvre que le cycle 4 (5e|4e|3e) — lycée différé (ADR-0009 §8)."""
    if level not in CYCLE_4_LEVELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Niveau « {level} » hors périmètre : le rattrapage skills-only ne couvre "
                f"que le cycle 4 ({', '.join(CYCLE_4_LEVELS)}). Le lycée est différé "
                "(ADR-0009 §8)."
            ),
        )


def _generate_validated(
    llm: LLMProvider, system: str, prompt: str, schema: dict, model_cls, repair_instruction: str
) -> tuple[object, str]:
    """Génère → valide (`model_cls`) → UNE réparation → (objet validé, modèle utilisé).

    Reproduit le pipeline des passes 1 et 2 (sortie structurée `fmt`, une seule réparation
    réinjectant réponse fautive + erreur concrète). Lève `CurriculumGenerationError` si la
    sortie reste invalide après réparation. Factorise la mécanique pour l'orchestration
    skills-backfill (N appels) ; les passes 1/2 gardent leur version inline (trace couplée).
    """
    response = llm.generate(LLMRequest(system=system, prompt=prompt, fmt=schema))
    raw, model_used = response.text, response.model
    result, error = _try_validate(raw, model_cls)
    if result is None:
        repair_prompt = (
            f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
            f"{repair_instruction}{error}"
        )
        response = llm.generate(LLMRequest(system=system, prompt=repair_prompt, fmt=schema))
        raw, model_used = response.text, response.model
        result, error = _try_validate(raw, model_cls)
    if result is None:
        raise CurriculumGenerationError(
            f"{model_cls.__name__} invalide après réparation : {error}"
        )
    return result, model_used


def _dedupe_notions(names: list[str]) -> list[str]:
    """Dédup par nom normalisé (même clé que l'upsert `Skill`), ordre de 1re apparition,
    forme « jolie » (espaces normalisés) conservée. Les intitulés vides sont écartés."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        pretty = " ".join(raw.split())
        key = _normalize_skill_name(pretty)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(pretty)
    return out


def generate_skills_backfill(
    db: Session, llm: LLMProvider, subject_id: int, level: str
) -> dict:
    """Passe 1 + passe 2 EN MÉMOIRE pour (matière, niveau du cycle 4) — ADR-0010.

    Ne persiste NI `Chapter`, NI `Lesson`, NI `LessonSkill` : seule une trace `ai_jobs`
    (`curriculum_skills_backfill`) est écrite. Retourne la prévisualisation des notions
    groupées par chapitre d'échafaudage (dédupliquées) + `failed_scaffolds`. Lève
    `CurriculumGenerationError` si la passe 1 (chapitres) échoue — sans chapitres, rien à
    prévisualiser. L'échec de passe 2 sur UN chapitre d'échafaudage n'avorte pas les autres.
    """
    _require_cycle4_level(level)
    subject = _subject_or_404(db, subject_id)
    cycle = CYCLE_BY_LEVEL.get(level, level)
    program_version = DEFAULT_PROGRAM_VERSION

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="curriculum_skills_backfill",
        status="running",
        input_json={
            "subject_id": subject.id,
            "subject": subject.name,
            "level": level,
            "cycle": cycle,
            "program_version": program_version,
            "prompt_version": curriculum.CURRICULUM_PROMPT_VERSION,
            "provider": type(llm).__name__,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        # Passe 1 (mémoire) : chapitres d'échafaudage. `existing=[]` : on part du
        # référentiel officiel vierge pour ce niveau, rien à compléter (décision 1).
        system, prompt = curriculum.build_chapters_prompt(
            subject.name, level, cycle, program_version, []
        )
        chapters_result, model_used = _generate_validated(
            llm, system, prompt, generation_schema(),
            GeneratedChapters, curriculum.REPAIR_INSTRUCTION,
        )
    except CurriculumGenerationError as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise CurriculumGenerationError(f"Appel LLM échoué : {exc}") from exc

    # Passe 2 (mémoire), un chapitre d'échafaudage à la fois. Un échec (invalide après
    # réparation OU réseau) sur l'un n'avorte pas les autres : on le signale (décision 4).
    groups: list[dict] = []
    failed_scaffolds: list[str] = []
    for gc in chapters_result.chapters:
        try:
            system, prompt = curriculum.build_lessons_prompt(
                subject.name, level, cycle,
                {"name": gc.title, "description": gc.description, "themes": gc.themes},
                program_version, [],
            )
            lessons_result, _ = _generate_validated(
                llm, system, prompt, lessons_generation_schema(),
                GeneratedLessons, curriculum.LESSONS_REPAIR_INSTRUCTION,
            )
        except Exception:  # noqa: BLE001 — échafaudage en échec : signalé, on poursuit.
            failed_scaffolds.append(gc.title)
            continue
        notions = _dedupe_notions([n for gl in lessons_result.lessons for n in gl.notions])
        groups.append({"scaffold_chapter": gc.title, "notions": notions})

    job.status = "succeeded"
    job.output_json = {
        "scaffolds_total": len(chapters_result.chapters),
        "scaffolds_ok": len(groups),
        "scaffolds_failed": len(failed_scaffolds),
        "notions_total": sum(len(g["notions"]) for g in groups),
        "model": model_used,
    }
    job.finished_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "subject_id": subject.id,
        "subject_name": subject.name,
        "level": level,
        "cycle": cycle,
        "program_version": program_version,
        "groups": groups,
        "failed_scaffolds": failed_scaffolds,
    }


def confirm_skills_backfill(
    db: Session, subject_id: int, level: str, notion_names: list[str]
) -> dict:
    """Upsert des notions revues en `Skill` au niveau cible — ADR-0010, décision 2/4.

    Réutilise `_upsert_skills` de la passe 2 (même clé (subject_id, level, nom normalisé),
    même dédup) SANS créer aucune ligne `lesson_skills` (aucune leçon dans ce flux).
    Idempotent : re-confirmer une liste identique renvoie `created=0`. Retourne le nombre
    de notions créées vs déjà présentes."""
    _require_cycle4_level(level)
    subject = _subject_or_404(db, subject_id)

    _, created = _upsert_skills(db, subject.id, level, notion_names)
    db.commit()

    # « Déjà présentes » = notions distinctes non vides (même normalisation que l'upsert)
    # qui n'ont pas été créées à ce passage — idempotence : tout re-confirm → existing=n.
    unique_keys = {k for k in (_normalize_skill_name(n) for n in notion_names) if k}
    return {"created": created, "existing": len(unique_keys) - created}
