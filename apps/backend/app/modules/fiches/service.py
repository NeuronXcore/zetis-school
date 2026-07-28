"""Service de génération d'une fiche de révision (ADR-0015 ; patron capsule ADR-0007).

Dérivé **leçon-centré** (≠ ELI5/quiz notion-centrés) : une fiche = 1 leçon = 1 page. Comme le
quiz de fin de cours (`quizzes/service._canonical_sections`), on **force** le cours canonique =
LA leçon (déjà gatée `validated`) et on n'utilise `resolve_canonical_context` que pour son
complément RAG. Le résolveur du substrat prend un `skill_id` (pas un `lesson_id`) : on lui passe
une notion de la leçon uniquement pour récupérer ses `chunks`, jamais pour choisir le cours.

Pipeline (patron ADR-0007) : `build_prompt` → `LLMProvider.generate` (sortie structurée ollama,
`fmt` = schéma `FicheSpec`) → `FicheSpec.model_validate_json` → **1 réparation** → sinon
`FicheGenerationError`. Chaque appel laisse une trace `ai_jobs` (`job_type="fiche_generate"`).
**Jamais de spec invalide persisté** ; une leçon non validée ne donne AUCUNE fiche (garde 409).
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Chapter,
    Fiche,
    FicheView,
    Lesson,
    LessonSkill,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    Subject,
)
from app.modules.ai.canonical_context import (
    CanonicalContext,
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.eli5.service import get_default_student
from app.modules.fiches.schemas import FicheSpec
from app.modules.subjects.resolver import subject_of_lesson
from app.prompts import fiche

logger = logging.getLogger(__name__)

DEFAULT_LEVEL = "4e"


class FicheGenerationError(Exception):
    """La génération a échoué (sortie LLM invalide même après une réparation)."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Gardes & helpers ──────────────────────────────────────────────────────────


def _validated_lesson_or_409(db: Session, lesson_id: int | None) -> Lesson:
    """Charge LA leçon et applique le gate `validated` (+ cours rédigé). Miroir du quiz."""
    lesson = db.get(Lesson, lesson_id) if lesson_id is not None else None
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leçon introuvable.")
    if lesson.status != "validated":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon doit être validée avant de générer une fiche.",
        )
    if not lesson.content_markdown:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon n'a pas encore de cours rédigé — génère le cours d'abord.",
        )
    return lesson


def _lesson_skills(db: Session, lesson_id: int) -> list[Skill]:
    return list(
        db.scalars(
            select(Skill)
            .join(LessonSkill, LessonSkill.skill_id == Skill.id)
            .where(LessonSkill.lesson_id == lesson_id)
            .order_by(Skill.id)
        )
    )


def _fiche_or_404(db: Session, fiche_id: int) -> Fiche:
    row = db.get(Fiche, fiche_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    return row


def _chapter_of(db: Session, lesson: Lesson) -> Chapter | None:
    return db.get(Chapter, lesson.chapter_id)


def _level_for(skills: list[Skill]) -> str:
    return next((s.level for s in skills if s.level), None) or DEFAULT_LEVEL


def _fiche_sections(
    db: Session, embedder: EmbeddingProvider, lesson: Lesson, skills: list[Skill]
) -> str:
    """Bloc de contexte canonique — cours FORCÉ = la leçon (déjà validée), RAG en complément.

    Exactement le geste du quiz de fin de cours : on ne se sert du résolveur (notion-centré) que
    pour ses `chunks`. Une leçon sans notion rattachée reste possible → simplement pas de RAG.
    """
    chunks: list[str] = []
    if skills:
        chunks = resolve_canonical_context(
            db, embedder, skill_id=skills[0].id, query=lesson.title
        ).chunks
    ctx = CanonicalContext(lesson=lesson, chunks=chunks)  # cours forcé = la leçon fichée
    return build_canonical_sections(ctx)


def _strip_fences(text: str) -> str:
    """Nettoyage défensif : retire d'éventuelles balises ``` autour de l'objet JSON."""
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def _try_validate(raw: str) -> tuple[FicheSpec | None, str | None]:
    """Valide `raw` en `FicheSpec`. Retourne (spec, None) ou (None, message d'erreur compact)."""
    try:
        return FicheSpec.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:6]
        )
        return None, detail or "schéma invalide"
    except ValueError as exc:  # JSON malformé (JSONDecodeError hérite de ValueError)
        return None, f"JSON invalide : {exc}"


def _generate_spec(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, lesson: Lesson
) -> FicheSpec:
    """Génère un `FicheSpec` validé à partir d'une leçon validée. Trace `ai_jobs`.

    Lève `FicheGenerationError` si la sortie reste invalide après une réparation (rien n'est
    renvoyé ni persisté dans ce cas).
    """
    skills = _lesson_skills(db, lesson.id)
    sections = _fiche_sections(db, embedder, lesson, skills)
    subject = subject_of_lesson(db, lesson)
    chapter = _chapter_of(db, lesson)
    system, prompt = fiche.build_prompt(
        sections=sections,
        subject=subject.name if subject else "",
        level=_level_for(skills),
        chapter=chapter.name if chapter else None,
        title=lesson.title,
    )
    schema = FicheSpec.model_json_schema()

    now = _now()
    job = AIJob(
        job_type="fiche_generate",
        status="running",
        input_json={
            "lesson_id": lesson.id,
            "lesson_title": lesson.title,
            "prompt_version": fiche.FICHE_PROMPT_VERSION,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        raw = llm.generate(
            LLMRequest(system=system, prompt=prompt, fmt=schema, temperature=0.2)
        ).text
        spec, error = _try_validate(raw)

        if spec is None:
            # UNE seule réparation : prompt d'origine + réponse fautive + consigne + erreur réelle.
            repair_prompt = (
                f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                f"{fiche.REPAIR_INSTRUCTION}{error}"
            )
            raw = llm.generate(
                LLMRequest(system=system, prompt=repair_prompt, fmt=schema, temperature=0.2)
            ).text
            spec, error = _try_validate(raw)

        if spec is None:
            raise FicheGenerationError(f"FicheSpec invalide après réparation : {error}")
    except FicheGenerationError as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = _now()
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = _now()
        db.commit()
        raise FicheGenerationError(f"Appel LLM échoué : {exc}") from exc

    job.status = "succeeded"
    job.output_json = {
        "title": spec.title,
        "definitions": len(spec.definitions),
        "points_cles": len(spec.points_cles),
    }
    job.finished_at = _now()
    db.commit()
    return spec


# ── CRUD Papa ──────────────────────────────────────────────────────────────────


def generate_fiche(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, *, lesson_id: int
) -> Fiche:
    """Génère un `FicheSpec` (trace `ai_jobs`) puis persiste la fiche en `pending`."""
    lesson = _validated_lesson_or_409(db, lesson_id)
    spec = _generate_spec(db, llm, embedder, lesson)
    row = Fiche(
        lesson_id=lesson.id,
        spec_json=spec.model_dump(),
        validation_status="pending",
        source="generated",
        program_version=lesson.program_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def regenerate_fiche(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, *, fiche_id: int
) -> Fiche:
    """Régénère le spec (écrase l'existant) → repasse `pending`."""
    row = _fiche_or_404(db, fiche_id)
    lesson = _validated_lesson_or_409(db, row.lesson_id)
    spec = _generate_spec(db, llm, embedder, lesson)
    row.spec_json = spec.model_dump()
    row.validation_status = "pending"
    db.commit()
    db.refresh(row)
    return row


def update_fiche_spec(db: Session, *, fiche_id: int, spec: FicheSpec) -> Fiche:
    """Remplace le spec (déjà validé par le schéma). Une édition repasse en `pending`."""
    row = _fiche_or_404(db, fiche_id)
    row.spec_json = spec.model_dump()
    row.validation_status = "pending"
    db.commit()
    db.refresh(row)
    return row


def validate_fiche(db: Session, fiche_id: int) -> Fiche:
    """`pending` → `validated` (rend la fiche visible côté Massimo)."""
    row = _fiche_or_404(db, fiche_id)
    row.validation_status = "validated"
    db.commit()
    db.refresh(row)
    return row


def delete_fiche(db: Session, fiche_id: int) -> None:
    row = _fiche_or_404(db, fiche_id)
    # Pas d'ON DELETE CASCADE sur la FK : retirer d'abord les vues (sinon violation FK).
    db.execute(delete(FicheView).where(FicheView.fiche_id == fiche_id))
    db.delete(row)
    db.commit()


def get_fiche(db: Session, fiche_id: int) -> Fiche:
    return _fiche_or_404(db, fiche_id)


def list_fiches_for_lesson(db: Session, lesson_id: int) -> list[Fiche]:
    return list(
        db.scalars(select(Fiche).where(Fiche.lesson_id == lesson_id).order_by(Fiche.id.desc()))
    )


def pilotage_tree(db: Session, subject_id: int) -> dict:
    """Pilotage Papa : leçons validées d'une matière (année active) + leurs fiches (1 appel).

    Miroir de `quizzes.pilotage_subject_tree` : les leçons sans fiche sont incluses (Papa peut
    générer). Chaque fiche porte son `validation_status` (aucun filtre `validated` ici : c'est
    la vue Papa, pas la vue élève).
    """
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Matière introuvable.")
    lesson_ids = _validated_lesson_ids_for_subject(db, subject_id)
    rows = (
        db.execute(
            select(Lesson, Chapter.name)
            .join(Chapter, Chapter.id == Lesson.chapter_id)
            .where(Lesson.id.in_(lesson_ids))
            .order_by(Chapter.sort_order, Lesson.sort_order, Lesson.id)
        ).all()
        if lesson_ids
        else []
    )
    lessons = [
        {
            "lesson_id": lesson.id,
            "title": lesson.title,
            "chapter": chapter_name,
            "has_content": bool(lesson.content_markdown),
            "fiches": [fiche_out(db, f) for f in list_fiches_for_lesson(db, lesson.id)],
        }
        for lesson, chapter_name in rows
    ]
    return {
        "subject": {"id": subject.id, "slug": subject.slug, "name": subject.name},
        "lessons": lessons,
    }


def fiche_out(db: Session, row: Fiche, *, seen: bool = False) -> dict:
    """Sérialise une fiche pour Papa/Massimo (spec complet + matière/chapitre résolus)."""
    lesson = db.get(Lesson, row.lesson_id)
    chapter = _chapter_of(db, lesson) if lesson else None
    subject = subject_of_lesson(db, lesson)
    spec = row.spec_json if isinstance(row.spec_json, dict) else {}
    return {
        "id": row.id,
        "lesson_id": row.lesson_id,
        "title": spec.get("title", ""),
        "chapter": chapter.name if chapter else None,
        "subject_slug": subject.slug if subject else "",
        "validation_status": row.validation_status,
        "spec": spec,
        "seen": seen,
    }


# ── Flux élève (préfixe /api/student — filtrage serveur, gate `validated`) ──────


def _active_year(db: Session) -> SchoolYear | None:
    return db.scalar(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    )


def _validated_lesson_ids_for_subject(db: Session, subject_id: int) -> list[int]:
    """Ids des leçons validées de la matière dans l'année active (via chapitres validés).

    Même chaîne que le deck quiz (`quizzes/service`) : matière → `SchoolYearSubject` de l'année
    active → chapitres `validated` → leçons `validated`.
    """
    year = _active_year(db)
    if year is None:
        return []
    sys_ids = list(
        db.scalars(
            select(SchoolYearSubject.id).where(
                SchoolYearSubject.school_year_id == year.id,
                SchoolYearSubject.subject_id == subject_id,
            )
        )
    )
    if not sys_ids:
        return []
    chapter_ids = list(
        db.scalars(
            select(Chapter.id).where(
                Chapter.school_year_subject_id.in_(sys_ids),
                Chapter.validation_status == "validated",
            )
        )
    )
    if not chapter_ids:
        return []
    return list(
        db.scalars(
            select(Lesson.id).where(
                Lesson.chapter_id.in_(chapter_ids), Lesson.status == "validated"
            )
        )
    )


def seen_fiche_ids(db: Session, student_id: int) -> set[int]:
    return set(db.scalars(select(FicheView.fiche_id).where(FicheView.student_id == student_id)))


def list_subject_fiches(db: Session, subject_slug: str) -> list[dict]:
    """Fiches VALIDÉES d'une matière (leçons validées de l'année active), ordre du référentiel.

    Route neutre (réutilisable). 404 si la matière est inconnue ; `[]` (état positif) si elle n'a
    encore aucune fiche validée. Ne fuit jamais une fiche `pending`/`rejected`.
    """
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue."
        )
    lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
    if not lesson_ids:
        return []
    seen = seen_fiche_ids(db, get_default_student(db).id)
    rows = db.execute(
        select(Fiche, Chapter.name)
        .join(Lesson, Lesson.id == Fiche.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(
            Fiche.lesson_id.in_(lesson_ids),
            Fiche.validation_status == "validated",
        )
        .order_by(Chapter.sort_order, Lesson.sort_order, Fiche.id)
    ).all()
    return [
        {
            "id": row.id,
            "lesson_id": row.lesson_id,
            "title": (row.spec_json or {}).get("title", ""),
            "chapter": chapter_name,
            "subject_slug": subject.slug,
            "seen": row.id in seen,
        }
        for row, chapter_name in rows
    ]


def fiches_summary(db: Session) -> dict:
    """Compteur de fiches validées par matière de l'année active (grille de decks Massimo).

    Liste TOUTES les matières de l'année active (celles sans fiche apparaissent avec un
    compteur 0 → deck « bientôt »). `new_count` = fiches validées jamais ouvertes. Même
    esprit que `/notions/summary` : une seule requête pour l'écran d'accueil.
    """
    year = _active_year(db)
    if year is None:
        return {"subjects": []}
    seen = seen_fiche_ids(db, get_default_student(db).id)
    subjects = list(
        db.scalars(
            select(Subject)
            .join(SchoolYearSubject, SchoolYearSubject.subject_id == Subject.id)
            .where(SchoolYearSubject.school_year_id == year.id)
            .order_by(Subject.sort_order, Subject.id)
        )
    )
    out = []
    for subject in subjects:
        lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
        fiche_ids = (
            list(
                db.scalars(
                    select(Fiche.id).where(
                        Fiche.lesson_id.in_(lesson_ids),
                        Fiche.validation_status == "validated",
                    )
                )
            )
            if lesson_ids
            else []
        )
        out.append(
            {
                "slug": subject.slug,
                "name": subject.name,
                "fiche_count": len(fiche_ids),
                "new_count": sum(1 for fid in fiche_ids if fid not in seen),
            }
        )
    return {"subjects": out}


def get_student_fiche(db: Session, fiche_id: int) -> dict:
    """La fiche pour Massimo — 404 si absente OU non `validated` (aucune fuite de brouillon)."""
    row = db.get(Fiche, fiche_id)
    if row is None or row.validation_status != "validated":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    seen = fiche_id in seen_fiche_ids(db, get_default_student(db).id)
    return fiche_out(db, row, seen=seen)


def mark_seen(db: Session, student_id: int, fiche_id: int) -> None:
    """Marque la fiche vue (idempotent). 404 si la fiche n'est pas `validated`."""
    row = db.get(Fiche, fiche_id)
    if row is None or row.validation_status != "validated":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    existing = db.scalar(
        select(FicheView).where(
            FicheView.student_id == student_id, FicheView.fiche_id == fiche_id
        )
    )
    if existing is None:
        db.add(FicheView(student_id=student_id, fiche_id=fiche_id, seen_at=_now()))
        db.commit()
