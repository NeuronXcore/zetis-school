"""Modèle de lecture de la couverture de production (page Papa « Couverture »).

Répond à une question qu'aucune page ne traite : **où en est le stock de contenu de Massimo ?**
Ce qui existe, ce qui attend une relecture, ce qui a décroché de son cours, ce qui reste à
produire. Le pilotage par type donne cinq vues partielles du même objet ; ceci en est l'union.

**Lecture seule.** Ce module ne génère rien, ne valide rien, n'écrit rien — jamais, sous aucune
condition. Les actions de la page passent par les endpoints existants de chaque module.

Deux étages, séparés exprès :

1. des **fonctions pures** (`cell_state`, `row_state`) — testables exhaustivement, sans base ;
2. **une requête agrégée par matière** qui les alimente. Aucune boucle par leçon, aucun N+1 :
   une matière peut porter 8 chapitres × 12 leçons.
"""

from datetime import datetime
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Capsule,
    Chapter,
    Fiche,
    Lesson,
    LessonSkill,
    Mindmap,
    Quiz,
    SchoolYear,
    SchoolYearSubject,
    Skill,
    SpacedReviewCard,
    Subject,
)
from app.modules.ai.canonical_context import is_stale
from app.modules.memory.service import INACTIVE_CARD_STATUSES

CellState = Literal["absent", "pending", "validated", "stale", "blocked"]
RowState = Literal["blocked_lesson", "blocked_no_course", "ready", "complete"]

# Les trois dérivés leçon-centrés qui entrent dans le pourcentage de couverture. Le COURS n'y
# est pas : il est la CONDITION des dérivés, pas un dérivé. Le compter serait une faute de
# logique — et gonflerait mécaniquement le pourcentage d'un quart.
DERIVATIVE_KEYS = ("quiz", "fiche", "mindmap")


# ── Étage 1 — fonctions pures ───────────────────────────────────────────────────


def cell_state(
    *,
    lesson_servable: bool,
    exists: bool,
    derived_at: datetime | None,
    validation_status: str | None,
    content_updated_at: datetime | None,
    gated: bool = True,
) -> CellState:
    """État d'une cellule de la matrice, pour UN dérivé d'UNE leçon.

    `gated=False` pour le quiz : l'ADR-0014 §2 le sert sans validation, il ne connaît donc que
    trois états (`absent` | `validated` | `stale`) — un `pending` y serait un mensonge.

    L'ordre des tests porte le sens : `blocked` domine tout (rien n'est générable), puis
    `absent` (rien à qualifier), puis `stale` AVANT `validated` — un dérivé périmé est validé,
    et c'est précisément l'information qu'il ne faut pas laisser masquer par le ✓.

    **`absent` se déduit de l'EXISTENCE de la ligne, jamais d'une date.** Un dérivé sans
    horodatage existe quand même : le lire « absent » invite Papa à le régénérer indéfiniment
    et empile les doublons — c'est exactement ce qui s'est produit avec les horodatages nuls de
    `fiches` (migration `e6f7a8b9c0d1`). La date ne sert qu'à la FRAÎCHEUR, et son absence rend
    seulement le périmé indécidable — ce qui est un défaut acceptable, pas un mensonge.
    """
    if not lesson_servable:
        return "blocked"
    if not exists:
        return "absent"
    if gated and validation_status != "validated":
        return "pending"
    if is_stale(derived_at, content_updated_at):
        return "stale"
    return "validated"


def row_state(*, lesson_validated: bool, has_course: bool, cells: dict[str, CellState]) -> RowState:
    """État d'une ligne (une leçon).

    Les deux causes de blocage sont distinguées parce que l'UI propose une action DIFFÉRENTE
    pour chacune : cours jamais rédigé (le rédiger ici) vs leçon non validée (agir dans
    Programme). Une matrice qui affiche 40 trous sans distinguer combles et bloqués n'aide pas.
    """
    if not lesson_validated:
        return "blocked_lesson"
    if not has_course:
        return "blocked_no_course"
    if all(cells.get(key) == "validated" for key in DERIVATIVE_KEYS):
        return "complete"
    return "ready"


# ── Étage 2 — requêtes agrégées ─────────────────────────────────────────────────


def _active_year(db: Session) -> SchoolYear | None:
    return db.scalar(
        select(SchoolYear).where(SchoolYear.status == "active").order_by(SchoolYear.id.desc())
    )


def _lesson_rows(db: Session, subject_id: int, year_id: int) -> list[tuple]:
    """UNE requête : toutes les leçons d'une matière + leurs trois dérivés leçon-centrés.

    `LEFT JOIN` sur chaque table de dérivé — une leçon sans fiche donne simplement des NULL.
    Les dérivés sont agrégés (`MAX`) plutôt que joints en ligne : 0..N fiches par leçon sont
    possibles, on retient la plus récente et son statut. `GROUP BY` sur la leçon.
    """
    return list(
        db.execute(
            select(
                Chapter.id,
                Chapter.name,
                Chapter.sort_order,
                Lesson.id,
                Lesson.title,
                Lesson.status,
                Lesson.content_markdown.is_not(None),
                Lesson.content_updated_at,
                Lesson.validated_by,
                Lesson.sort_order,
                func.max(Fiche.updated_at),
                func.max(Fiche.validation_status),
                func.max(Fiche.validated_by),
                func.max(Fiche.id),
                func.max(Mindmap.updated_at),
                func.max(Mindmap.validation_status),
                func.max(Mindmap.validated_by),
                func.max(Mindmap.id),
                func.max(Quiz.updated_at),
                func.max(Quiz.validated_by),
                func.max(Quiz.id),
            )
            .select_from(Chapter)
            .join(Lesson, Lesson.chapter_id == Chapter.id)
            .outerjoin(Fiche, Fiche.lesson_id == Lesson.id)
            .outerjoin(Mindmap, Mindmap.lesson_id == Lesson.id)
            .outerjoin(Quiz, (Quiz.lesson_id == Lesson.id) & (Quiz.status != "archived"))
            .join(
                SchoolYearSubject,
                SchoolYearSubject.id == Chapter.school_year_subject_id,
            )
            .where(
                SchoolYearSubject.school_year_id == year_id,
                SchoolYearSubject.subject_id == subject_id,
                Lesson.status != "archived",
            )
            .group_by(
                Chapter.id,
                Chapter.name,
                Chapter.sort_order,
                Lesson.id,
                Lesson.title,
                Lesson.status,
                Lesson.content_markdown,
                Lesson.content_updated_at,
                Lesson.validated_by,
                Lesson.sort_order,
            )
            .order_by(Chapter.sort_order, Chapter.id, Lesson.sort_order, Lesson.id)
        )
    )


def _notion_details(db: Session, lesson_ids: list[int]) -> dict[int, dict]:
    """Colonnes NOTION-centrées : le détail par notion, et les fractions qui s'en déduisent.

    Ces deux objets ne dérivent pas d'une leçon mais d'une notion (§E.5) : d'où une fraction et
    **aucun état de fraîcheur**. Ne pas en ajouter, même si ça paraît symétrique — la source
    canonique d'une notion peut changer de leçon d'une génération à l'autre, le badge serait
    ininterprétable.

    « Couvert » = porte au moins un objet **consommable** : carte active (une carte suspendue
    ou archivée ne tombe jamais en révision) ; capsule validée ET rendue en MP4 — même
    prédicat que `capsules.service.list_published`, car une capsule sans voix ni vidéo ne se
    regarde pas.

    Le détail par notion existe pour que Papa puisse AGIR depuis la matrice : sans lui, un clic
    sur une fraction générerait à l'aveugle, sans dire sur quoi. **Une seule requête** pour
    toutes les leçons de la matière — la granularité fine ne coûte pas un N+1.
    """
    out: dict[int, dict] = {
        lesson_id: {
            "cards": {"covered": 0, "total": 0},
            "capsules": {"covered": 0, "total": 0},
            "items": [],
        }
        for lesson_id in lesson_ids
    }
    if not lesson_ids:
        return out

    rows = db.execute(
        select(
            LessonSkill.lesson_id,
            Skill.id,
            Skill.name,
            func.count(func.distinct(SpacedReviewCard.id)),
            func.count(func.distinct(Capsule.id)),
        )
        .select_from(LessonSkill)
        .join(Skill, Skill.id == LessonSkill.skill_id)
        .outerjoin(
            SpacedReviewCard,
            (SpacedReviewCard.skill_id == LessonSkill.skill_id)
            & SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
        )
        .outerjoin(
            Capsule,
            (Capsule.skill_id == LessonSkill.skill_id)
            & (Capsule.validation_status == "validated")
            & Capsule.video_url.is_not(None),
        )
        .where(LessonSkill.lesson_id.in_(lesson_ids))
        .group_by(LessonSkill.lesson_id, Skill.id, Skill.name)
        .order_by(LessonSkill.lesson_id, Skill.id)
    )
    for lesson_id, skill_id, name, cards, capsules in rows:
        entry = out[lesson_id]
        entry["items"].append(
            {
                "skill_id": skill_id,
                "name": name,
                "has_card": bool(cards),
                "has_capsule": bool(capsules),
            }
        )
        entry["cards"]["total"] += 1
        entry["capsules"]["total"] += 1
        if cards:
            entry["cards"]["covered"] += 1
        if capsules:
            entry["capsules"]["covered"] += 1
    return out


def _cells_for(row) -> dict[str, dict]:
    """Les quatre cellules leçon-centrées d'une ligne, à partir d'un tuple de `_lesson_rows`."""
    (
        _chapter_id,
        _chapter_name,
        _chapter_sort,
        _lesson_id,
        _title,
        lesson_status,
        has_course,
        content_updated_at,
        lesson_validated_by,
        _lesson_sort,
        fiche_at,
        fiche_status,
        fiche_by,
        fiche_id,
        mindmap_at,
        mindmap_status,
        mindmap_by,
        mindmap_id,
        quiz_at,
        quiz_by,
        quiz_id,
    ) = row

    lesson_validated = lesson_status == "validated"
    servable = lesson_validated and bool(has_course)

    # Le COURS n'est pas un dérivé : sa cellule décrit la leçon elle-même. Elle n'a donc que
    # trois états et JAMAIS `stale` — le cours est la source de la fraîcheur, il ne peut pas
    # être périmé par rapport à lui-même.
    if not lesson_validated:
        cours: CellState = "blocked"
    elif not has_course:
        cours = "absent"
    else:
        cours = "validated"

    return {
        # `object_id` = cible d'un « Régénérer » côté Papa. Pour le cours, c'est la leçon
        # elle-même. Pour les dérivés, `MAX(id)` = le plus récemment créé : une leçon porte 0..1
        # fiche/mindmap, et pour les 0..N quiz d'une leçon c'est le dernier généré qui fait foi.
        "cours": {
            "state": cours,
            "derived_at": content_updated_at,
            "validated_by": lesson_validated_by,
            "object_id": _lesson_id,
        },
        "quiz": {
            "state": cell_state(
                lesson_servable=servable,
                exists=quiz_id is not None,
                derived_at=quiz_at,
                validation_status=None,
                content_updated_at=content_updated_at,
                gated=False,  # ADR-0014 §2 : pas de `pending` pour le quiz
            ),
            "derived_at": quiz_at,
            "validated_by": quiz_by,
            "object_id": quiz_id,
        },
        "fiche": {
            "state": cell_state(
                lesson_servable=servable,
                exists=fiche_id is not None,
                derived_at=fiche_at,
                validation_status=fiche_status,
                content_updated_at=content_updated_at,
            ),
            "derived_at": fiche_at,
            "validated_by": fiche_by,
            "object_id": fiche_id,
        },
        "mindmap": {
            "state": cell_state(
                lesson_servable=servable,
                exists=mindmap_id is not None,
                derived_at=mindmap_at,
                validation_status=mindmap_status,
                content_updated_at=content_updated_at,
            ),
            "derived_at": mindmap_at,
            "validated_by": mindmap_by,
            "object_id": mindmap_id,
        },
    }


def coverage(db: Session, subject_id: int | None = None) -> dict:
    """Arborescence matière → chapitre → leçon + `totals`. Lecture seule.

    Une matière sans leçon validée apparaît avec ses chapitres vides — **jamais filtrée
    silencieusement** : une matière absente se lit « rien à produire », ce qui est faux.
    """
    year = _active_year(db)
    if year is None:
        return {"school_year": None, "totals": _empty_totals(), "subjects": []}

    subject_query = (
        select(Subject)
        .join(SchoolYearSubject, SchoolYearSubject.subject_id == Subject.id)
        .where(SchoolYearSubject.school_year_id == year.id)
        .order_by(Subject.sort_order, Subject.id)
    )
    if subject_id is not None:
        subject_query = subject_query.where(Subject.id == subject_id)
    subjects = list(db.scalars(subject_query))

    totals = _empty_totals()
    out_subjects = []
    for subject in subjects:
        rows = _lesson_rows(db, subject.id, year.id)
        fractions = _notion_details(db, [row[3] for row in rows])
        chapters: dict[int, dict] = {}
        for row in rows:
            chapter_id, chapter_name = row[0], row[1]
            lesson_id, title, lesson_status, has_course = row[3], row[4], row[5], row[6]
            cells = _cells_for(row)
            states = {key: cell["state"] for key, cell in cells.items()}

            totals["lessons"] += 1
            if lesson_status == "validated":
                totals["lessons_validated"] += 1
            if has_course:
                totals["courses_written"] += 1
            for key in DERIVATIVE_KEYS:
                totals["_derivative_slots"] += 1
                if states[key] in ("validated", "stale"):
                    totals["_derivatives_produced"] += 1
                if states[key] == "pending":
                    totals["pending_count"] += 1
                if states[key] == "stale":
                    totals["stale_count"] += 1

            chapters.setdefault(
                chapter_id, {"id": chapter_id, "title": chapter_name, "lessons": []}
            )["lessons"].append(
                {
                    "id": lesson_id,
                    "title": title,
                    "row_state": row_state(
                        lesson_validated=lesson_status == "validated",
                        has_course=bool(has_course),
                        cells=states,
                    ),
                    "cells": cells,
                    "notions": fractions[lesson_id],
                }
            )
        out_subjects.append(
            {
                "id": subject.id,
                "name": subject.name,
                "slug": subject.slug,
                "chapters": list(chapters.values()),
            }
        )

    totals["orphan_count"] = _orphan_count(db)
    slots = totals.pop("_derivative_slots")
    produced = totals.pop("_derivatives_produced")
    totals["derivatives_percent"] = round(produced * 100 / slots) if slots else 0
    return {
        "school_year": {"id": year.id, "label": year.label, "level": year.level},
        "totals": totals,
        "subjects": out_subjects,
    }


def _empty_totals() -> dict:
    return {
        "lessons": 0,
        "lessons_validated": 0,
        "courses_written": 0,
        "derivatives_percent": 0,
        "pending_count": 0,
        "stale_count": 0,
        "orphan_count": 0,
        "_derivative_slots": 0,
        "_derivatives_produced": 0,
    }


# ── Orphelins ───────────────────────────────────────────────────────────────────


def _orphan_count(db: Session) -> int:
    return sum(len(rows) for rows in _orphan_rows(db).values())


def _orphan_rows(db: Session) -> dict[str, list]:
    """Dérivés dont la leçon est archivée. Une anomalie, pas une case vide : ils n'ont aucune
    ligne dans la matrice, puisque leur leçon n'y figure plus."""
    out = {}
    for key, model in (("fiche", Fiche), ("mindmap", Mindmap), ("quiz", Quiz)):
        out[key] = list(
            db.execute(
                select(model.id, model.lesson_id, Lesson.title, Lesson.updated_at, Subject.name)
                .join(Lesson, Lesson.id == model.lesson_id)
                .join(Chapter, Chapter.id == Lesson.chapter_id)
                .outerjoin(
                    SchoolYearSubject,
                    SchoolYearSubject.id == Chapter.school_year_subject_id,
                )
                .outerjoin(Subject, Subject.id == SchoolYearSubject.subject_id)
                .where(Lesson.status == "archived")
                .order_by(model.id)
            )
        )
    return out


def orphans(db: Session) -> list[dict]:
    """Liste des dérivés orphelins + `has_history`. **Lecture seule** : ne supprime ni ne
    réattache rien (hors périmètre v1) — l'UI désactive la suppression quand `has_history` est
    vrai, car un score n'a plus de sens sans l'objet qui l'a produit, mais on n'efface pas
    l'histoire de Massimo pour faire propre.
    """
    from app.db.models import MindmapAttempt, QuizAttempt

    rows = _orphan_rows(db)
    out: list[dict] = []
    for key, entries in rows.items():
        for object_id, _lesson_id, lesson_title, archived_at, subject_name in entries:
            if key == "quiz":
                has_history = (
                    db.scalar(
                        select(func.count(QuizAttempt.id)).where(QuizAttempt.quiz_id == object_id)
                    )
                    or 0
                ) > 0
            elif key == "mindmap":
                has_history = (
                    db.scalar(
                        select(func.count(MindmapAttempt.id)).where(
                            MindmapAttempt.mindmap_id == object_id
                        )
                    )
                    or 0
                ) > 0
            else:
                has_history = False  # une fiche ne porte aucune tentative
            out.append(
                {
                    "type": key,
                    "id": object_id,
                    "title": lesson_title,
                    "subject": subject_name,
                    "archived_at": archived_at,
                    "has_history": has_history,
                }
            )
    return out
