"""Service des cartes mentales (ADR-0016 ; patron dérivé ADR-0011 ; pipeline ADR-0007).

Deux responsabilités serveur :

1. **Génération** — dérivé **leçon-centré** (sœur des fiches, ADR-0015) : une mindmap = 1 leçon.
   Comme la fiche et le quiz de fin de cours, on **force** le cours canonique = LA leçon (déjà gatée
   `validated`) et on n'utilise `resolve_canonical_context` que pour son complément RAG.
   Pipeline (ADR-0007) : `build_prompt` → `LLMProvider.generate` (`fmt` = schéma `MindmapJson`) →
   `model_validate` → **1 réparation** → sinon `MindmapGenerationError`. Trace `ai_jobs`
   (`job_type="mindmap_generate"`). **Jamais de mindmap invalide persistée.**

2. **Évaluation de la reconstruction** (mode `student_reconstruction`) — **100 % serveur et
   déterministe** (ADR-0016) : `score_reconstruction` compare les nœuds placés par l'élève à
   l'arbre de référence (`mindmap_json`). Aucune position n'entre dans le score : seule la
   **structure** (chaque nœud sous le bon parent) est notée. Le layout reste client (Slice B).

**Aucun calcul de placement de nœuds ici** : le backend ne produit ni ne lit de coordonnées.
"""

import logging
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.db.models import (
    AIJob,
    Chapter,
    Lesson,
    LessonSkill,
    Mindmap,
    MindmapAttempt,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    StudentProfile,
    Subject,
)
from app.modules.ai.canonical_context import (
    CanonicalContext,
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.eli5.service import get_default_student
from app.modules.engagement.service import STEP_MINDMAP, is_engaged_in_active_mission
from app.modules.gamification.service import award_xp, mindmap_reconstruction_xp
from app.modules.mindmaps.schemas import (
    MindmapJson,
    MindmapNodeEval,
    MindmapNodePlacement,
)
from app.modules.provenance import PARENT, ValidatedBy, mark_validated
from app.modules.subjects.resolver import subject_of_lesson
from app.prompts import mindmap

logger = logging.getLogger(__name__)

DEFAULT_LEVEL = "4e"


class MindmapGenerationError(Exception):
    """La génération a échoué (sortie LLM invalide même après une réparation)."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── Gardes & helpers (miroir fiches) ────────────────────────────────────────────


def _validated_lesson_or_409(db: Session, lesson_id: int | None) -> Lesson:
    """Charge LA leçon et applique le gate `validated` (+ cours rédigé)."""
    lesson = db.get(Lesson, lesson_id) if lesson_id is not None else None
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Leçon introuvable.")
    if lesson.status != "validated":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="La leçon doit être validée avant de générer une carte mentale.",
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


def _mindmap_or_404(db: Session, mindmap_id: int) -> Mindmap:
    row = db.get(Mindmap, mindmap_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Carte mentale introuvable.")
    return row


def _chapter_of(db: Session, lesson: Lesson) -> Chapter | None:
    return db.get(Chapter, lesson.chapter_id)


def _level_for(skills: list[Skill]) -> str:
    return next((s.level for s in skills if s.level), None) or DEFAULT_LEVEL


def _mindmap_sections(
    db: Session, embedder: EmbeddingProvider, lesson: Lesson, skills: list[Skill]
) -> str:
    """Bloc de contexte canonique — cours FORCÉ = la leçon (déjà validée), RAG en complément."""
    chunks: list[str] = []
    if skills:
        chunks = resolve_canonical_context(
            db, embedder, skill_id=skills[0].id, query=lesson.title
        ).chunks
    ctx = CanonicalContext(lesson=lesson, chunks=chunks)  # cours forcé = la leçon cartographiée
    return build_canonical_sections(ctx)


def _strip_fences(text: str) -> str:
    """Nettoyage défensif : retire d'éventuelles balises ``` autour de l'objet JSON."""
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def _try_validate(raw: str) -> tuple[MindmapJson | None, str | None]:
    """Valide `raw` en `MindmapJson`. Retourne (spec, None) ou (None, message compact)."""
    try:
        return MindmapJson.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:6]
        )
        return None, detail or "schéma invalide"
    except ValueError as exc:  # JSON malformé (JSONDecodeError hérite de ValueError)
        return None, f"JSON invalide : {exc}"


def _generate_spec(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, lesson: Lesson
) -> MindmapJson:
    """Génère un `MindmapJson` validé à partir d'une leçon validée. Trace `ai_jobs`.

    Lève `MindmapGenerationError` si la sortie reste invalide après une réparation (rien n'est
    renvoyé ni persisté dans ce cas).
    """
    skills = _lesson_skills(db, lesson.id)
    sections = _mindmap_sections(db, embedder, lesson, skills)
    subject = subject_of_lesson(db, lesson)
    chapter = _chapter_of(db, lesson)
    system, prompt = mindmap.build_prompt(
        sections=sections,
        subject=subject.name if subject else "",
        level=_level_for(skills),
        chapter=chapter.name if chapter else None,
        title=lesson.title,
    )
    schema = MindmapJson.model_json_schema()

    now = _now()
    job = AIJob(
        job_type="mindmap_generate",
        status="running",
        input_json={
            "lesson_id": lesson.id,
            "lesson_title": lesson.title,
            "prompt_version": mindmap.MINDMAP_PROMPT_VERSION,
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
                f"{mindmap.REPAIR_INSTRUCTION}{error}"
            )
            raw = llm.generate(
                LLMRequest(system=system, prompt=repair_prompt, fmt=schema, temperature=0.2)
            ).text
            spec, error = _try_validate(raw)

        if spec is None:
            raise MindmapGenerationError(f"MindmapJson invalide après réparation : {error}")
    except MindmapGenerationError as exc:
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
        raise MindmapGenerationError(f"Appel LLM échoué : {exc}") from exc

    job.status = "succeeded"
    job.output_json = {"center": spec.center, "nodes": len(spec.nodes)}
    job.finished_at = _now()
    db.commit()
    return spec


# ── CRUD Papa ──────────────────────────────────────────────────────────────────


def generate_mindmap(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, *, lesson_id: int
) -> Mindmap:
    """Génère un `MindmapJson` (trace `ai_jobs`) puis persiste la carte en `pending`."""
    lesson = _validated_lesson_or_409(db, lesson_id)
    spec = _generate_spec(db, llm, embedder, lesson)
    row = Mindmap(
        lesson_id=lesson.id,
        mindmap_json=spec.model_dump(),
        validation_status="pending",
        source="generated",
        program_version=lesson.program_version,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def regenerate_mindmap(
    db: Session, llm: LLMProvider, embedder: EmbeddingProvider, *, mindmap_id: int
) -> Mindmap:
    """Régénère le `mindmap_json` (écrase l'existant) → repasse `pending`."""
    row = _mindmap_or_404(db, mindmap_id)
    lesson = _validated_lesson_or_409(db, row.lesson_id)
    spec = _generate_spec(db, llm, embedder, lesson)
    row.mindmap_json = spec.model_dump()
    row.validation_status = "pending"
    db.commit()
    db.refresh(row)
    return row


def update_mindmap_json(db: Session, *, mindmap_id: int, spec: MindmapJson) -> Mindmap:
    """Remplace le `mindmap_json` (déjà validé par le schéma). Une édition repasse en `pending`."""
    row = _mindmap_or_404(db, mindmap_id)
    row.mindmap_json = spec.model_dump()
    row.validation_status = "pending"
    db.commit()
    db.refresh(row)
    return row


def validate_mindmap(db: Session, mindmap_id: int, *, by: ValidatedBy = PARENT) -> Mindmap:
    """`pending` → `validated` (rend la carte visible côté Massimo).

    `by` trace la provenance (§F) : `PARENT` depuis le pilotage, `PARENT_BULK` depuis
    l'équipement ADR-0021 §2.
    """
    row = _mindmap_or_404(db, mindmap_id)
    mark_validated(row, by)
    db.commit()
    db.refresh(row)
    return row


def delete_mindmap(db: Session, mindmap_id: int) -> None:
    row = _mindmap_or_404(db, mindmap_id)
    # Pas d'ON DELETE CASCADE sur la FK : retirer d'abord les tentatives (sinon violation FK).
    db.execute(delete(MindmapAttempt).where(MindmapAttempt.mindmap_id == mindmap_id))
    db.delete(row)
    db.commit()


def get_mindmap(db: Session, mindmap_id: int) -> Mindmap:
    return _mindmap_or_404(db, mindmap_id)


def list_mindmaps_for_lesson(db: Session, lesson_id: int) -> list[Mindmap]:
    return list(
        db.scalars(
            select(Mindmap).where(Mindmap.lesson_id == lesson_id).order_by(Mindmap.id.desc())
        )
    )


def mindmap_out(db: Session, row: Mindmap) -> dict:
    """Sérialise une carte pour Papa/Massimo (json complet + matière/chapitre résolus)."""
    lesson = db.get(Lesson, row.lesson_id)
    chapter = _chapter_of(db, lesson) if lesson else None
    subject = subject_of_lesson(db, lesson)
    mm = row.mindmap_json if isinstance(row.mindmap_json, dict) else {}
    return {
        "id": row.id,
        "lesson_id": row.lesson_id,
        "title": mm.get("center", ""),
        "chapter": chapter.name if chapter else None,
        "subject_slug": subject.slug if subject else "",
        "validation_status": row.validation_status,
        "mindmap_json": mm,
    }


def _attempt_stats(db: Session, mindmap_ids: list[int]) -> dict[int, tuple[int, int | None]]:
    """Agrégat des tentatives par carte — **une seule requête**, pas de N+1.

    Retourne `{mindmap_id: (nombre de tentatives, score moyen arrondi)}`. Une carte jamais
    reconstruite est absente du dict (l'appelant retombe sur `(0, None)`).
    """
    if not mindmap_ids:
        return {}
    rows = db.execute(
        select(
            MindmapAttempt.mindmap_id,
            func.count(MindmapAttempt.id),
            func.avg(MindmapAttempt.score),
        )
        .where(MindmapAttempt.mindmap_id.in_(mindmap_ids))
        .group_by(MindmapAttempt.mindmap_id)
    ).all()
    return {mid: (count, round(avg) if avg is not None else None) for mid, count, avg in rows}


def pilotage_tree(db: Session, subject_id: int) -> dict:
    """Pilotage Papa : leçons validées d'une matière (année active) + leurs mindmaps (1 appel).

    Miroir de `fiches.pilotage_tree` : les leçons sans carte sont incluses (Papa peut générer).
    Chaque carte porte son `validation_status` (aucun filtre `validated` : vue Papa, pas élève)
    **et l'agrégat de ses tentatives** (`attempt_count` / `avg_score`) — le « signal avant
    destruction » de l'addendum ADR-0016 §E.

    Cet agrégat est fusionné **ici seulement**, jamais dans `mindmap_out` (partagé avec les routes
    élève) : le suivi est parent-side, rien n'en remonte chez Massimo (pas d'auto-surveillance).
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
    # Toutes les cartes de la matière en UNE requête (au lieu d'une par leçon), regroupées ensuite.
    cards = (
        list(
            db.scalars(
                select(Mindmap)
                .where(Mindmap.lesson_id.in_(lesson_ids))
                .order_by(Mindmap.id.desc())
            )
        )
        if lesson_ids
        else []
    )
    by_lesson: dict[int, list[Mindmap]] = {}
    for card in cards:
        by_lesson.setdefault(card.lesson_id, []).append(card)
    stats = _attempt_stats(db, [c.id for c in cards])

    def card_out(card: Mindmap) -> dict:
        count, avg = stats.get(card.id, (0, None))
        return {**mindmap_out(db, card), "attempt_count": count, "avg_score": avg}

    lessons = [
        {
            "lesson_id": lesson.id,
            "title": lesson.title,
            "chapter": chapter_name,
            "has_content": bool(lesson.content_markdown),
            "mindmaps": [card_out(c) for c in by_lesson.get(lesson.id, [])],
        }
        for lesson, chapter_name in rows
    ]
    return {
        "subject": {"id": subject.id, "slug": subject.slug, "name": subject.name},
        "lessons": lessons,
    }


# ── Flux élève (préfixe /api/student — filtrage serveur, gate `validated`) ──────


def _active_year(db: Session) -> SchoolYear | None:
    return db.scalar(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    )


def _validated_lesson_ids_for_subject(db: Session, subject_id: int) -> list[int]:
    """Ids des leçons validées de la matière dans l'année active (via chapitres validés)."""
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


def list_subject_mindmaps(db: Session, subject_slug: str) -> list[dict]:
    """Cartes VALIDÉES d'une matière (leçons validées de l'année active), ordre du référentiel.

    404 si la matière est inconnue ; `[]` (état positif) si elle n'a encore aucune carte validée.
    Ne fuit jamais une carte `pending`/`rejected`.
    """
    subject = db.scalar(select(Subject).where(Subject.slug == subject_slug))
    if subject is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=f"Matière « {subject_slug} » inconnue."
        )
    lesson_ids = _validated_lesson_ids_for_subject(db, subject.id)
    if not lesson_ids:
        return []
    rows = db.execute(
        select(Mindmap, Chapter.name)
        .join(Lesson, Lesson.id == Mindmap.lesson_id)
        .join(Chapter, Chapter.id == Lesson.chapter_id)
        .where(
            Mindmap.lesson_id.in_(lesson_ids),
            Mindmap.validation_status == "validated",
        )
        .order_by(Chapter.sort_order, Lesson.sort_order, Mindmap.id)
    ).all()
    return [
        {
            "id": row.id,
            "lesson_id": row.lesson_id,
            "title": (row.mindmap_json or {}).get("center", ""),
            "chapter": chapter_name,
            "subject_slug": subject.slug,
        }
        for row, chapter_name in rows
    ]


def mindmaps_summary(db: Session) -> dict:
    """Compteur de cartes validées par matière de l'année active (grille de decks Massimo).

    Liste TOUTES les matières de l'année active (celles sans carte → compteur 0, deck « bientôt »).
    Même esprit que `/fiches/summary`, mais **sans `new_count`** : le suivi des vues (badge
    « Nouveau ») est différé en V1 (pas de table `mindmap_views` dans le périmètre ADR-0016 §3).
    """
    year = _active_year(db)
    if year is None:
        return {"subjects": []}
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
        count = (
            db.scalar(
                select(func.count(Mindmap.id)).where(
                    Mindmap.lesson_id.in_(lesson_ids),
                    Mindmap.validation_status == "validated",
                )
            )
            if lesson_ids
            else 0
        )
        out.append({"slug": subject.slug, "name": subject.name, "mindmap_count": count or 0})
    return {"subjects": out}


def get_student_mindmap(db: Session, mindmap_id: int) -> dict:
    """La carte pour Massimo — 404 si absente OU non servable (aucune fuite de brouillon)."""
    return mindmap_out(db, _servable_mindmap_or_404(db, mindmap_id))


def _servable_mindmap_or_404(db: Session, mindmap_id: int) -> Mindmap:
    """Carte servable : `validated`, OU engagée dans une mission active (exception nommée).

    L'exception (addendum ADR-0016 §6 règle 1) tient l'invariant « le gate porte sur la
    découverte, jamais sur l'achèvement d'un parcours engagé » : une carte que Papa vient
    d'éditer repasse `pending` et sort bien des decks (`mindmaps_summary`,
    `list_subject_mindmaps` gardent le filtre strict), mais reste jouable jusqu'au bout par
    l'élève dont une mission active la référence — sinon l'étape ADR-0019 §2 n'a plus de
    preuve possible et la mission n'a plus de verdict.
    """
    row = db.get(Mindmap, mindmap_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Carte mentale introuvable.")
    if row.validation_status != "validated" and not is_engaged_in_active_mission(
        db,
        step_type=STEP_MINDMAP,
        resource_id=mindmap_id,
        student_id=get_default_student(db).id,
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Carte mentale introuvable.")
    return row


# ── Évaluation de la reconstruction — SERVEUR, DÉTERMINISTE (ADR-0016) ───────────


def score_reconstruction(
    mindmap_json: dict, placements: list[MindmapNodePlacement]
) -> tuple[int, list[MindmapNodeEval]]:
    """Compare les nœuds placés à l'arbre de référence → (score 0–100, détail par nœud).

    **Fonction pure, déterministe** (mêmes entrées → même score) : aucune position n'entre dans le
    calcul, seule la **structure** est notée. Un nœud est JUSTE s'il est placé ET accroché au bon
    parent (celui de la référence). Le barème porte sur `required_nodes` s'il existe, sinon sur TOUS
    les nœuds ; les `optional_nodes` sont évalués (détail) mais **hors dénominateur** — jamais de
    pénalité, jamais de bonus (garde le score stable et lisible pour l'enfant).

    Les nœuds placés inconnus de la référence sont ignorés (aucune fuite d'existence).
    """
    nodes = mindmap_json.get("nodes", []) if isinstance(mindmap_json, dict) else []
    label_of = {n["id"]: n.get("label", "") for n in nodes}
    parent_of = {n["id"]: n.get("parent") for n in nodes}
    optional = set(mindmap_json.get("optional_nodes") or [])
    required = [nid for nid in (mindmap_json.get("required_nodes") or []) if nid in parent_of]

    placed_parent = {p.node_id: p.parent_id for p in placements}

    # Barème : les nœuds requis si fournis, sinon tous les nœuds non optionnels.
    scored_ids = required if required else [nid for nid in parent_of if nid not in optional]
    # Détail : nœuds notés d'abord (ordre de la référence), puis les optionnels évalués.
    detail_ids = scored_ids + [nid for nid in parent_of if nid in optional]

    details: list[MindmapNodeEval] = []
    correct_count = 0
    for nid in detail_ids:
        expected = parent_of.get(nid)
        placed = nid in placed_parent
        got = placed_parent.get(nid)
        is_correct = placed and got == expected
        is_optional = nid not in scored_ids
        if is_correct and not is_optional:
            correct_count += 1
        details.append(
            MindmapNodeEval(
                node_id=nid,
                label=label_of.get(nid, ""),
                expected_parent=expected,
                placed_parent=got,
                placed=placed,
                correct=is_correct,
                optional=is_optional,
            )
        )

    expected_count = len(scored_ids)
    score = round(100 * correct_count / expected_count) if expected_count else 0
    return score, details


def _evaluation_out(mindmap_json: dict, placements: list[MindmapNodePlacement]) -> dict:
    """Met en forme le résultat d'une évaluation. **Un seul barème, plusieurs appelants.**

    Partagé par `/evaluate` (élève), `/evaluate-preview` (aperçu Papa) et `record_attempt` —
    ainsi le score que Papa voit dans l'aperçu est, par construction, celui que Massimo obtiendra.
    """
    score, details = score_reconstruction(mindmap_json or {}, placements)
    return {
        "score": score,
        "correct_count": sum(1 for d in details if d.correct and not d.optional),
        "expected_count": sum(1 for d in details if not d.optional),
        "details": details,
    }


def evaluate_reconstruction(
    db: Session, mindmap_id: int, placements: list[MindmapNodePlacement]
) -> dict:
    """Évaluation PURE (`/evaluate`) : score + détail, **sans persistance ni XP**. Déterministe."""
    row = _servable_mindmap_or_404(db, mindmap_id)
    return _evaluation_out(row.mindmap_json or {}, placements)


def evaluate_preview(
    db: Session, mindmap_id: int, placements: list[MindmapNodePlacement]
) -> dict:
    """Évaluation d'APERÇU Papa (`/evaluate-preview`, `require_parent`) — addendum ADR-0016 §C.

    Deux différences avec `/evaluate`, et deux seulement :

    1. **Aucun gate `validated`** (`_mindmap_or_404`) : Papa prévisualise justement du `pending`,
       que les routes élève cachent (404).
    2. **Zéro effet de bord** : aucun `mindmap_attempts`, aucun `xp_events`, aucun
       `learning_events` — jouer *Reconstruis* dans l'aperçu ne doit rien écrire dans le journal
       de Massimo. Aucun `db.add`, aucun `db.commit` ici : c'est le contrat, pas un détail.

    Le barème est le même (`_evaluation_out`) : c'est tout l'intérêt de l'aperçu de fidélité.
    """
    row = _mindmap_or_404(db, mindmap_id)
    return _evaluation_out(row.mindmap_json or {}, placements)


def record_attempt(
    db: Session,
    student: StudentProfile,
    mindmap_id: int,
    placements: list[MindmapNodePlacement],
    failed_attempts: int = 0,
) -> dict:
    """Tentative de reconstruction (`/attempts`) : score SERVEUR, persistance + **XP serveur**.

    Le score est calculé par `score_reconstruction` (déterministe) — jamais côté client. L'XP suit
    le patron du quiz (base d'effort + bonus au score) **réduit par le nombre d'échecs de la séance**
    (`failed_attempts`), avec un plancher (l'effort reste récompensé). L'attribution vit ici, côté
    serveur (ADR-0016). Le commit est fait après `award_xp`.
    """
    row = _servable_mindmap_or_404(db, mindmap_id)
    out = _evaluation_out(row.mindmap_json or {}, placements)
    score = out["score"]
    details = out["details"]

    attempt = MindmapAttempt(
        student_id=student.id,
        mindmap_id=row.id,
        score=score,
        details_json=[d.model_dump() for d in details],
        created_at=_now(),
    )
    db.add(attempt)

    lesson = db.get(Lesson, row.lesson_id)
    subject = subject_of_lesson(db, lesson)
    xp = mindmap_reconstruction_xp(score, failed_attempts)
    award_xp(
        db,
        student_id=student.id,
        subject_id=subject.id if subject else None,
        amount=xp,
        reason="mindmap_reconstruction",
    )
    db.commit()
    db.refresh(attempt)
    return {**out, "attempt_id": attempt.id, "xp_awarded": xp}


def mark_seen(db: Session, student_id: int, mindmap_id: int) -> None:
    """Marque la carte vue (idempotent). 404 si la carte n'est pas `validated`.

    **Placeholder Slice A** : la persistance des vues (badge « Nouveau ») est différée — le
    périmètre de cette slice ne prévoit pas de table `mindmap_views` (ADR-0016 §3). On valide
    seulement l'existence/visibilité de la carte pour que le client Slice B puisse appeler la route
    sans 404 ; le suivi réel des vues arrivera avec le badge.
    """
    _servable_mindmap_or_404(db, mindmap_id)
