"""Équipement pédagogique d'une notion (ADR-0021) — module NEUTRE (ADR-0031 §1).

Déplacé de `reports/service.py` le 2026-08-02, **sans un changement de comportement** : l'ADR-0023
§1 l'avait décidé le 2026-07-28 et l'extraction n'avait jamais eu lieu. Un service à plusieurs
consommateurs ne vit pas chez l'un d'eux (patron ADR-0011 §1) — il vivait chez le Conseil de
classe, qui n'en est qu'un appelant sur trois.

Appelants réels aujourd'hui : le Conseil de classe (`reports/router.py`) et la composition champion
(`missions/champion.py`). Le troisième annoncé par l'ADR-0023 — la Couverture — n'existe pas encore
et arrivera avec la production en lot.

Les imports des générateurs restent PARESSEUX, mais leur motif a changé et il faut le dire : ce
n'est plus « éviter un cycle avec `reports` » (vérifié : aucun générateur n'importe `production`),
c'est éviter de charger cinq modules de génération — et leurs providers — à l'import de
`production`, que la Couverture importe pour une page de LECTURE.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    Fiche,
    Lesson,
    LessonSkill,
    Mindmap,
    Quiz,
    Skill,
    SpacedReviewCard,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.provenance import PARENT_BULK


# --- Équipement pédagogique d'une notion (ADR-0021) ----------------------------------------
#
# « Créer ces missions » génère, avant la mission, le KIT complet d'une notion (cours → fiche →
# SRS → quiz → mindmap) et l'AUTO-VALIDE (la popup de confirmation Papa vaut approbation — soupape
# §5ter bornée à ce geste). Orchestration pure des générateurs existants ; try/except par pièce ;
# **on ne régénère JAMAIS une pièce déjà créée** (même un brouillon `pending` de Papa) — on génère
# seulement ce qui manque, et on valide l'existant `pending` pour le rendre utilisable ; dégradation
# gracieuse leçon-centrée (notion sans leçon canonique → contenus sautés + signalés). Équiper AVANT
# de créer : les étapes de la mission
# résolvent alors les ressources fraîches.

_EQUIP_QUIZ_COUNT = 5
_EQUIP_QUIZ_DIFFICULTY = 2


def _skill_lesson(db: Session, skill_id: int) -> Lesson | None:
    """Leçon la plus récente rattachée à la notion (tout statut sauf archivée), ou None."""
    return db.scalar(
        select(Lesson)
        .join(LessonSkill, LessonSkill.lesson_id == Lesson.id)
        .where(LessonSkill.skill_id == skill_id, Lesson.status != "archived")
        .order_by(Lesson.id.desc())
        .limit(1)
    )


# Existence = « déjà créé » (tout statut, y compris un brouillon de Papa) : on ne régénère JAMAIS,
# on génère uniquement ce qui manque (ADR-0021). On récupère l'entité pour la valider si besoin.
def _existing_fiche(db: Session, lesson_id: int) -> Fiche | None:
    return db.scalar(
        select(Fiche).where(Fiche.lesson_id == lesson_id).order_by(Fiche.id.desc()).limit(1)
    )


def _existing_mindmap(db: Session, lesson_id: int) -> Mindmap | None:
    return db.scalar(
        select(Mindmap).where(Mindmap.lesson_id == lesson_id).order_by(Mindmap.id.desc()).limit(1)
    )


def _has_mission_quiz(db: Session, skill_id: int) -> bool:
    """Un quiz de mission existe déjà pour la notion (tout statut) — pas de régénération."""
    return bool(
        db.scalar(
            select(Quiz.id)
            .join(LessonSkill, LessonSkill.lesson_id == Quiz.lesson_id)
            .where(Quiz.quiz_type == "mission", LessonSkill.skill_id == skill_id)
        )
    )


def _has_srs_cards(db: Session, skill_id: int) -> bool:
    """Des cartes SRS existent déjà pour la notion — `generate_cards_for_skill` rappellerait le LLM."""
    return bool(db.scalar(select(SpacedReviewCard.id).where(SpacedReviewCard.skill_id == skill_id)))


def equip_notion(
    db: Session, *, skill_id: int, llm: LLMProvider, embedder: EmbeddingProvider
) -> dict:
    """Génère + auto-valide le kit pédagogique d'UNE notion (ADR-0021). Résumé typé, jamais
    d'exception qui remonte : chaque pièce est isolée, l'échec est reporté."""
    # Imports paresseux : évite tout cycle avec les modules générateurs (qui n'importent pas reports).
    from app.modules.curriculum.service import generate_lesson_content, set_lesson_validation
    from app.modules.fiches.service import generate_fiche, validate_fiche
    from app.modules.memory.generation import generate_cards_for_skill
    from app.modules.mindmaps.service import generate_mindmap, validate_mindmap
    from app.modules.quizzes.service import generate_quiz

    skill = db.get(Skill, skill_id)
    name = skill.name if skill is not None else f"notion {skill_id}"
    generated: list[str] = []
    skipped: list[str] = []
    errors: list[dict] = []

    lesson = _skill_lesson(db, skill_id)
    if lesson is None:
        return {
            "skill_id": skill_id,
            "skill_name": name,
            "has_lesson": False,
            "generated": [],
            "skipped": ["cours", "fiche", "srs", "quiz", "mindmap"],
            "errors": [],
            "reason": "Aucune leçon rattachée à cette notion — kit non généré.",
        }
    lesson_id = lesson.id

    # 1) Cours (leçon canonique). Un cours DÉJÀ RÉDIGÉ (manuel Papa ou antérieur) n'est jamais
    #    régénéré — juste validé s'il est encore en brouillon, pour rendre les dérivés possibles.
    try:
        if lesson.content_markdown:
            if lesson.status == "draft":
                set_lesson_validation(db, lesson_id, "validate")  # brouillon existant → validé
            skipped.append("cours")
        else:
            generate_lesson_content(db, llm, lesson_id)  # écrit le contenu, repasse en `draft`
            set_lesson_validation(db, lesson_id, "validate")  # draft → validated
            generated.append("cours")
    except Exception as exc:  # noqa: BLE001 — on isole chaque pièce
        errors.append({"piece": "cours", "message": str(exc)})

    # Sans leçon validée + contenu, aucun dérivé n'est possible (générateurs verrouillés, 409).
    db.refresh(lesson)
    if not (lesson.status == "validated" and lesson.content_markdown):
        skipped.extend(p for p in ("fiche", "srs", "quiz", "mindmap") if p not in skipped)
        return {
            "skill_id": skill_id,
            "skill_name": name,
            "has_lesson": True,
            "generated": generated,
            "skipped": skipped,
            "errors": errors,
            "reason": "Cours indisponible — dérivés non générés.",
        }

    # 2) Fiche — déjà créée (même `pending` de Papa) → jamais régénérée, validée si besoin.
    try:
        existing_fiche = _existing_fiche(db, lesson_id)
        if existing_fiche is not None:
            if existing_fiche.validation_status == "pending":
                # Valide un brouillon PRÉEXISTANT de Papa : `parent_bulk` sans exception (§F.4).
                validate_fiche(db, existing_fiche.id, by=PARENT_BULK)
            skipped.append("fiche")
        else:
            fiche = generate_fiche(db, llm, embedder, lesson_id=lesson_id)
            validate_fiche(db, fiche.id, by=PARENT_BULK)
            generated.append("fiche")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "fiche", "message": str(exc)})

    # 3) Cartes SRS — déjà présentes → pas de rappel LLM (`generate_cards_for_skill` régénère).
    try:
        if _has_srs_cards(db, skill_id):
            skipped.append("srs")
        else:
            generate_cards_for_skill(db, llm, embedder, skill_id=skill_id)
            generated.append("srs")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "srs", "message": str(exc)})

    # 4) Quiz de mission — déjà créé pour la notion → pas de régénération.
    try:
        if _has_mission_quiz(db, skill_id):
            skipped.append("quiz")
        else:
            generate_quiz(
                db,
                llm,
                embedder,
                lesson_id=lesson_id,
                count=_EQUIP_QUIZ_COUNT,
                difficulty=_EQUIP_QUIZ_DIFFICULTY,
            )
            generated.append("quiz")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "quiz", "message": str(exc)})

    # 5) Mindmap — déjà créée (même `pending` de Papa) → jamais régénérée, validée si besoin.
    try:
        existing_mindmap = _existing_mindmap(db, lesson_id)
        if existing_mindmap is not None:
            if existing_mindmap.validation_status == "pending":
                # Idem fiche : brouillon préexistant validé en lot (§F.4).
                validate_mindmap(db, existing_mindmap.id, by=PARENT_BULK)
            skipped.append("mindmap")
        else:
            mindmap = generate_mindmap(db, llm, embedder, lesson_id=lesson_id)
            validate_mindmap(db, mindmap.id, by=PARENT_BULK)
            generated.append("mindmap")
    except Exception as exc:  # noqa: BLE001
        errors.append({"piece": "mindmap", "message": str(exc)})

    return {
        "skill_id": skill_id,
        "skill_name": name,
        "has_lesson": True,
        "generated": generated,
        "skipped": skipped,
        "errors": errors,
        "reason": None,
    }
