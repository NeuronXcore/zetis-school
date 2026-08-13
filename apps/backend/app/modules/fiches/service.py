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
from app.modules.fiches.population import (
    AUTHOR_MASSIMO,
    AUTHOR_ZETIS,
    STATUS_DRAFT,
    STATUS_PERSONAL,
    readable_by_student,
)
from app.modules.fiches.schemas import FicheSpec
from app.modules.provenance import PARENT, ValidatedBy, mark_validated
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


def validate_fiche(db: Session, fiche_id: int, *, by: ValidatedBy = PARENT) -> Fiche:
    """`pending` → `validated` (rend la fiche visible côté Massimo).

    `by` trace la provenance (§F) : `PARENT` depuis la page de pilotage (Papa a ouvert la
    fiche), `PARENT_BULK` depuis l'équipement ADR-0021 §2 (la popup vaut approbation, mais
    rien n'a été relu pièce par pièce).
    """
    row = _fiche_or_404(db, fiche_id)
    mark_validated(row, by)
    db.commit()
    db.refresh(row)
    return row


def reject_fiche(db: Session, fiche_id: int) -> Fiche:
    """`pending` → `rejected` : la fiche n'atteindra pas Massimo, et elle reste en base.

    Rejeter n'est pas supprimer — le contenu reste régénérable depuis la page de pilotage. Aucune
    provenance n'est écrite : `validated_at`/`validated_by` disent QUI a laissé passer (§F), et
    personne n'a rien laissé passer ici.
    """
    row = _fiche_or_404(db, fiche_id)
    row.validation_status = "rejected"
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
    """Fiches LISIBLES d'une matière (leçons validées de l'année active), ordre du référentiel.

    Route neutre (réutilisable). 404 si la matière est inconnue ; `[]` (état positif) si elle n'a
    encore aucune fiche lisible. Ne fuit jamais une fiche ZETIS `pending`/`rejected` — le
    prédicat partagé porte la règle, cette fonction ne la réécrit pas.
    """
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue."
        )
    lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
    if not lesson_ids:
        return []
    student = get_default_student(db)
    seen = seen_fiche_ids(db, student.id)
    rows = db.execute(
        select(Fiche, Chapter.name)
        .join(Lesson, Lesson.id == Fiche.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(
            Fiche.lesson_id.in_(lesson_ids),
            readable_by_student(student.id),
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


def subject_fiche_tiles(db: Session, subject_slug: str) -> list[dict]:
    """Une tuile par LEÇON — l'écran 2 (`page-fiches.md`), avec ses quatre états.

    Pourquoi une seconde lecture à côté de `list_subject_fiches` plutôt qu'un élargissement :
    celle-là est **fiche-centrée** et sert le deck de révision (« ouvre une fiche pour réviser »),
    contrat qu'on ne casse pas. Celle-ci est **leçon-centrée** et sert la fabrication — elle doit
    pouvoir montrer ce qui n'est pas encore une fiche : un brouillon, ou une leçon vierge.

    🔴 **L'ordre de priorité des états n'est pas arbitraire.** Un brouillon passe AVANT une fiche
    finie : s'il a rouvert sa fiche pour la retravailler (§7), c'est ce travail-là qu'il veut
    reprendre, pas relire la version précédente.
    """
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue."
        )
    lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
    if not lesson_ids:
        return []

    student = get_default_student(db)
    vues = seen_fiche_ids(db, student.id)
    rows = db.execute(
        select(Lesson, Chapter.name)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(Lesson.id.in_(lesson_ids))
        .order_by(Chapter.sort_order, Lesson.sort_order, Lesson.id)
    ).all()

    # UNE requête pour toutes les fiches des leçons de la matière : la tuile ne doit pas coûter
    # une requête par leçon (le deck peut en porter trente).
    # ⚠️ `ORDER BY id` : le même ordre stable que `atelier.open_or_get_draft`. Sans lui, la tuile
    # et l'atelier peuvent désigner DEUX brouillons différents quand il en existe plusieurs —
    # constaté en base le 2026-08-13. Deux lectures qui ne s'accordent pas sur l'objet montrent
    # à Massimo une fiche vide là où son travail est resté.
    par_lecon: dict[int, list[Fiche]] = {}
    for f in db.scalars(
        select(Fiche).where(Fiche.lesson_id.in_(lesson_ids)).order_by(Fiche.id)
    ):
        par_lecon.setdefault(f.lesson_id, []).append(f)

    tuiles: list[dict] = []
    for lesson, chapter_name in rows:
        toutes = par_lecon.get(lesson.id, [])
        siennes = [
            f for f in toutes if f.author == AUTHOR_MASSIMO and f.student_id == student.id
        ]
        brouillon = next((f for f in siennes if f.validation_status == STATUS_DRAFT), None)
        finies = sorted(
            (f for f in siennes if f.validation_status == STATUS_PERSONAL),
            key=lambda f: f.version,
        )
        zetis = next(
            (
                f
                for f in toutes
                if f.author == AUTHOR_ZETIS and f.validation_status == "validated"
            ),
            None,
        )
        # Une leçon sans cours ÉCRIT et sans fiche lisible n'a rien à offrir : la montrer
        # afficherait une porte qui ne s'ouvre pas.
        if not lesson.content_markdown and not finies and not zetis:
            continue

        if brouillon is not None:
            etat = "commencee"
        elif finies:
            etat = "ma_fiche"
        elif zetis is not None:
            etat = "zetis"
        elif lesson.content_markdown:
            etat = "a_fabriquer"
        else:
            continue

        draft_spec = (brouillon.spec_json or {}) if brouillon else {}
        points = [p for p in draft_spec.get("points_cles", []) if str(p).strip()]
        remplies = sum(
            [
                bool(points),
                bool(str(draft_spec.get("essentiel") or "").strip()),
                bool(draft_spec.get("definitions")),
            ]
        )
        sienne = finies[-1] if finies else None
        tuiles.append(
            {
                "lesson_id": lesson.id,
                "title": lesson.title,
                "chapter": chapter_name,
                "subject_slug": subject.slug,
                "etat": etat,
                "draft_id": brouillon.id if brouillon else None,
                "fiche_id": (sienne or zetis).id if (sienne or zetis) else None,
                "zetis_fiche_id": zetis.id if zetis else None,
                "seen": bool(sienne or zetis) and (sienne or zetis).id in vues,
                "versions": len(finies),
                "etapes_remplies": remplies,
                "points_choisis": len(points),
            }
        )
    return tuiles


def fiches_summary(db: Session) -> dict:
    """Compteur de fiches LISIBLES par matière de l'année active (grille de decks Massimo).

    Liste TOUTES les matières de l'année active (celles sans fiche apparaissent avec un
    compteur 0 → deck « bientôt »). `new_count` = fiches lisibles jamais ouvertes. Même
    esprit que `/notions/summary` : une seule requête pour l'écran d'accueil.

    ⚠️ Le compteur additionne les fiches ZETIS **validées** et les fiches de **Massimo** : un deck
    où il n'a que ses propres fiches n'est pas « bientôt » (spec `page-fiches.md`).

    🔴 **Mais `new_count` exclut les siennes** (2026-08-13) : on ne découvre pas ce qu'on vient
    d'écrire. Les deux compteurs ne répondent pas à la même question — `fiche_count` dit *« ce
    qu'il y a dans ce deck »*, `new_count` dit *« ce qu'il n'a pas encore vu »*. Une fiche qu'il a
    fabriquée est dans le premier et jamais dans le second.
    """
    year = _active_year(db)
    if year is None:
        return {"subjects": []}
    student = get_default_student(db)
    seen = seen_fiche_ids(db, student.id)
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
        lignes = (
            list(
                db.execute(
                    select(Fiche.id, Fiche.author).where(
                        Fiche.lesson_id.in_(lesson_ids),
                        readable_by_student(student.id),
                    )
                ).all()
            )
            if lesson_ids
            else []
        )
        out.append(
            {
                "slug": subject.slug,
                "name": subject.name,
                "fiche_count": len(lignes),
                # 🔴 **Une fiche que Massimo a ÉCRITE n'est jamais « nouvelle »** — il ne peut pas
                # découvrir ce qu'il vient de fabriquer. Sans cette exclusion, finir sa fiche
                # allumait un badge « NOUVEAU » qui ne partait qu'en la rouvrant : un témoin qui
                # s'allume tout seul, c'est-à-dire la règle « NOUVEAU jamais DÛ » de l'`adr-0030`
                # prise à revers. Elle COMPTE dans `fiche_count` (c'est bien une fiche de son
                # deck) et jamais dans `new_count`.
                "new_count": sum(
                    1 for fid, auteur in lignes if auteur != AUTHOR_MASSIMO and fid not in seen
                ),
            }
        )
    return {"subjects": out}


def new_fiches_count(db: Session, student_id: int) -> int:
    """Fiches validées JAMAIS OUVERTES — témoin de nouveauté de navigation (adr-0030 §3).

    Délègue à `fiches_summary` plutôt que de recomposer une requête : une SECONDE définition de
    « fiche nouvelle » finirait par diverger de celle que voit la grille de decks, et le badge
    de navigation mentirait sur ce que la page affiche. Un test d'égalité verrouille les deux.

    `student_id` est ignoré : `fiches_summary` résout l'élève par `get_default_student` (MVP
    mono-enfant). Le paramètre est là pour l'uniformité du registre `NEWS_SOURCES` et pour que
    la signature n'ait pas à bouger le jour du multi-enfant.
    """
    return sum(s["new_count"] for s in fiches_summary(db)["subjects"])


def _readable_or_404(db: Session, fiche_id: int, student_id: int) -> Fiche:
    """La fiche telle que l'élève a le droit de la voir, ou 404.

    Trois causes de 404, une seule réponse : absente, ZETIS non validée, ou personnelle
    appartenant à quelqu'un d'autre. **Un seul endroit interroge la règle** — la version
    précédente la recopiait ligne à ligne ici ET dans `mark_seen`, et c'est exactement ce que
    l'addendum §2 interdit.
    """
    row = db.scalar(select(Fiche).where(Fiche.id == fiche_id, readable_by_student(student_id)))
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    return row


def get_student_fiche(db: Session, fiche_id: int) -> dict:
    """La fiche pour Massimo — 404 si elle ne lui est pas lisible (aucune fuite de brouillon)."""
    student = get_default_student(db)
    row = _readable_or_404(db, fiche_id, student.id)
    seen = fiche_id in seen_fiche_ids(db, student.id)
    return fiche_out(db, row, seen=seen)


def fiche_zetis_de_lecon(db: Session, lesson_id: int) -> dict:
    """Le corrigé : la fiche ZETIS validée de cette leçon.

    ⚠️ **Aucune condition de tentative** — le §3 a été révisé le 2026-08-12 : *« lire avant de
    fabriquer, c'est ok »*. Il n'y a donc **ni 403, ni état « a-t-il tenté ? » à tenir côté
    serveur**. Ce qui reste du §3, c'est un défaut d'ouverture côté écran, pas un verrou ici.
    """
    row = db.scalar(
        select(Fiche)
        .where(
            Fiche.lesson_id == lesson_id,
            Fiche.author == AUTHOR_ZETIS,
            Fiche.validation_status == "validated",
        )
        .order_by(Fiche.id.desc())
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Fiche introuvable.")
    return fiche_out(db, row)


def mark_seen(db: Session, student_id: int, fiche_id: int) -> None:
    """Marque la fiche vue (idempotent). 404 si la fiche ne lui est pas lisible.

    ⚠️ **Quatrième lecteur du gate**, que le cadrage de l'addendum avait manqué : sans lui, ouvrir
    sa propre fiche renverrait 404 sur `POST /seen` et son badge « nouveau » ne partirait jamais.
    """
    _readable_or_404(db, fiche_id, student_id)
    existing = db.scalar(
        select(FicheView).where(
            FicheView.student_id == student_id, FicheView.fiche_id == fiche_id
        )
    )
    if existing is None:
        db.add(FicheView(student_id=student_id, fiche_id=fiche_id, seen_at=_now()))
        db.commit()
