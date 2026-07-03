"""Service du référentiel de programme — passe 1 : chapitres (ADR-0009, Lot 1 Slice A).

Pipeline identique aux capsules (ADR-0007) : prompt versionné → `LLMProvider.generate`
avec sortie structurée `fmt` → validation Pydantic stricte → UNE réparation max → erreur
propre (rien d'invalide persisté). Chaque appel laisse une trace `ai_jobs`
(`job_type="curriculum_chapters"`, provider/modèle inclus).

Règles de co-construction (ADR-0009 §3), codées ici et testées :
- chapitres générés → `source='generated'`, `validation_status='pending'` ;
- création manuelle Papa → `source='manual'`, validé d'office ;
- la régénération ne touche JAMAIS les chapitres `manual` ni les chapitres validés :
  elle remplace uniquement les `generated` non validés de la matière ;
- `sort_order` : les nouveaux chapitres s'ajoutent APRÈS l'existant conservé.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import AIJob, Chapter, SchoolYear, SchoolYearSubject, Subject
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.curriculum.schemas import GeneratedChapter, GeneratedChapters, generation_schema
from app.prompts import curriculum

logger = logging.getLogger(__name__)

# Résolution niveau → cycle (collège ; le lycée est par classe, cf. ADR-0009 §8).
CYCLE_BY_LEVEL = {"6e": "cycle 3", "5e": "cycle 4", "4e": "cycle 4", "3e": "cycle 4"}
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


def _try_validate(raw: str) -> tuple[GeneratedChapters | None, str | None]:
    """Valide `raw` en `GeneratedChapters`. Retourne (obj, None) ou (None, erreur)."""
    try:
        return GeneratedChapters.model_validate_json(_strip_fences(raw)), None
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


def active_year_with_subjects(db: Session) -> dict:
    """Année active + ses matières (`school_year_subject_id`) — lecture seule (Slice B).

    La page Papa « Programme » en a besoin pour ses pills : `GET /api/subjects` ne
    porte pas le rattachement à l'année.
    """
    year = db.scalars(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    ).first()
    if year is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucune année scolaire active.",
        )
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
