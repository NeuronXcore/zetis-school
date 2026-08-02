"""Le veto de Papa (ADR-0034 §6) — retirer ce que ZETIS a servi, tant que Massimo n'a pas ouvert.

## Ce que ce module n'est pas

**Ce n'est pas A4.** A4 dit que **ZETIS** ne supprime jamais tout seul ; ici c'est **Papa** qui
supprime. La classe n'est pas concernée, et il faut l'écrire, sinon quelqu'un lira une
contradiction là où il y a une symétrie.

## Suppression FRANCHE, pas archivage — à rebours de l'ADR-0025

L'agenda archive (`dismissed_at`) et ne supprime jamais physiquement, parce qu'il est **co-édité
par Massimo** : son archivage protège le travail de l'enfant. Ici, la pièce **n'a jamais existé
pour lui** (invariant V1) — une trace serait justement la trace de trop. Deux objets, deux
doctrines, écrites toutes les deux.

## La garde du cours, et pourquoi elle REFUSE au lieu de retirer à moitié

Le cours est la **source canonique** de ses dérivés (addendum ADR-0009). Le retirer en laissant
une fiche derrière servirait à Massimo un contenu dont la source n'existe plus.

Mais si un dérivé est **déjà consommé**, le retrait du cours est **refusé** — pas partiellement
appliqué. Retirer quand même ferait disparaître, sous les yeux de Massimo, la source d'une fiche
qu'il a lue : un trou inexpliqué, exactement ce que **V1** interdit. **Refuser est plus honnête que
retirer à moitié.**
"""

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import (
    Fiche,
    FicheView,
    Lesson,
    LessonSkill,
    LessonView,
    Mindmap,
    MindmapAttempt,
    MindmapView,
    Quiz,
    QuizAttempt,
    QuizAnswer,
    QuizQuestion,
    SpacedReviewAttempt,
    SpacedReviewCard,
)
from app.modules.production.journal import KINDS, _consumed_sets

_MODEL = {
    "cours": Lesson,
    "fiche": Fiche,
    "mindmap": Mindmap,
    "quiz": Quiz,
    "srs": SpacedReviewCard,
}


def _get_or_404(db: Session, kind: str, piece_id: int):
    if kind not in KINDS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Type de contenu inconnu.")
    row = db.get(_MODEL[kind], piece_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Contenu introuvable.")
    # ⚠️ Le veto ne s'exerce QUE sur ce qui vient d'un lot. Une pièce produite hors lot (Conseil de
    # classe, champion) a été demandée par un clic de Papa : elle n'a pas de fenêtre de veto, et
    # la supprimer d'ici court-circuiterait les surfaces qui la gèrent déjà.
    if getattr(row, "production_run_id", None) is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Ce contenu ne vient pas d'un lot de production : il n'est pas retirable ici.",
        )
    return row


def is_consumed(db: Session, kind: str, piece_id: int) -> bool:
    """Massimo a-t-il ouvert cette pièce ? La consommation ferme la fenêtre, pas l'horloge."""
    buckets = {k: [] for k in KINDS}
    buckets[kind] = [piece_id]
    return piece_id in _consumed_sets(db, buckets)[kind]


def _derivatives_of_lesson(db: Session, lesson_id: int) -> dict[str, list[int]]:
    """Ce qu'un cours emporte avec lui. Les cartes SRS passent par les notions de la leçon."""
    skill_ids = db.scalars(
        select(LessonSkill.skill_id).where(LessonSkill.lesson_id == lesson_id)
    ).all()
    return {
        "fiche": list(db.scalars(select(Fiche.id).where(Fiche.lesson_id == lesson_id)).all()),
        "mindmap": list(
            db.scalars(select(Mindmap.id).where(Mindmap.lesson_id == lesson_id)).all()
        ),
        "quiz": list(db.scalars(select(Quiz.id).where(Quiz.lesson_id == lesson_id)).all()),
        "srs": list(
            db.scalars(
                select(SpacedReviewCard.id).where(SpacedReviewCard.skill_id.in_(skill_ids))
            ).all()
        )
        if skill_ids
        else [],
    }


def preview_removal(db: Session, *, kind: str, piece_id: int) -> dict:
    """Ce que le retrait emporterait, SANS rien supprimer.

    La modale l'annonce **avant** le geste : un veto qui surprend n'est pas exercé deux fois.
    """
    _get_or_404(db, kind, piece_id)
    if is_consumed(db, kind, piece_id):
        return {
            "removable": False,
            "reason": "Massimo a déjà ouvert ce contenu — il peut être corrigé, pas retiré.",
            "cascade": {},
        }
    if kind != "cours":
        return {"removable": True, "reason": None, "cascade": {}}

    cascade = _derivatives_of_lesson(db, piece_id)
    consumed = _consumed_sets(db, {**{k: [] for k in KINDS}, **cascade})
    blocking = {k: sorted(set(cascade[k]) & consumed[k]) for k in cascade if consumed[k]}
    if blocking:
        return {
            "removable": False,
            # Le motif nomme CE QUI bloque : « refusé » sans dire pourquoi se lit comme une panne.
            "reason": (
                "Massimo a déjà ouvert un contenu tiré de ce cours. "
                "Le retirer laisserait ce contenu sans sa source : corrigez-le plutôt."
            ),
            "cascade": {k: v for k, v in cascade.items() if v},
        }
    return {
        "removable": True,
        "reason": None,
        "cascade": {k: v for k, v in cascade.items() if v},
    }


def remove(db: Session, *, kind: str, piece_id: int) -> dict:
    """Retire une pièce non consommée. Suppression franche, aucune trace, aucun signal (V1)."""
    row = _get_or_404(db, kind, piece_id)
    verdict = preview_removal(db, kind=kind, piece_id=piece_id)
    if not verdict["removable"]:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=verdict["reason"])

    removed: dict[str, int] = {}
    if kind == "cours":
        cascade = _derivatives_of_lesson(db, piece_id)
        for child_kind in ("fiche", "mindmap", "quiz", "srs"):
            for child_id in cascade[child_kind]:
                _delete_one(db, child_kind, child_id)
            if cascade[child_kind]:
                removed[child_kind] = len(cascade[child_kind])
        db.execute(delete(LessonSkill).where(LessonSkill.lesson_id == piece_id))

    _delete_one(db, kind, piece_id)
    removed[kind] = removed.get(kind, 0) + 1
    db.commit()
    return {"removed": removed}


def _delete_one(db: Session, kind: str, piece_id: int) -> None:
    """Supprime UNE pièce et ce qui pend après elle.

    ⚠️ Les dépendances sont supprimées explicitement, dans l'ordre. Une FK pendante ferait
    échouer la suppression en base — et le patron existe déjà dans `delete_mindmap` : on le relit,
    on ne le réinvente pas.
    """
    if kind == "fiche":
        db.execute(delete(FicheView).where(FicheView.fiche_id == piece_id))
        db.execute(delete(Fiche).where(Fiche.id == piece_id))
    elif kind == "mindmap":
        db.execute(delete(MindmapView).where(MindmapView.mindmap_id == piece_id))
        db.execute(delete(MindmapAttempt).where(MindmapAttempt.mindmap_id == piece_id))
        db.execute(delete(Mindmap).where(Mindmap.id == piece_id))
    elif kind == "quiz":
        question_ids = db.scalars(
            select(QuizQuestion.id).where(QuizQuestion.quiz_id == piece_id)
        ).all()
        attempt_ids = db.scalars(
            select(QuizAttempt.id).where(QuizAttempt.quiz_id == piece_id)
        ).all()
        if attempt_ids:
            db.execute(delete(QuizAnswer).where(QuizAnswer.attempt_id.in_(attempt_ids)))
        db.execute(delete(QuizAttempt).where(QuizAttempt.quiz_id == piece_id))
        if question_ids:
            db.execute(delete(QuizQuestion).where(QuizQuestion.quiz_id == piece_id))
        db.execute(delete(Quiz).where(Quiz.id == piece_id))
    elif kind == "srs":
        db.execute(delete(SpacedReviewAttempt).where(SpacedReviewAttempt.card_id == piece_id))
        db.execute(delete(SpacedReviewCard).where(SpacedReviewCard.id == piece_id))
    elif kind == "cours":
        db.execute(delete(LessonView).where(LessonView.lesson_id == piece_id))
        db.execute(delete(Lesson).where(Lesson.id == piece_id))
