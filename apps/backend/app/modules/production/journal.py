"""Journal de production (ADR-0034) — ce que ZETIS a fait, et ce qui est encore rétractable.

Deux services en un fichier, parce qu'ils répondent à la même question sous deux angles :

- **le flux** : quand · quoi · notion · produit par · validé par · demandé par ;
- **la consommation** : Massimo a-t-il ouvert cette pièce ? C'est elle qui dit si le veto est
  encore exerçable, et elle seule (§G.3 : la consommation ferme la fenêtre, pas l'horloge).

## Portée v1 : ce qui vient d'un LOT — et la page le dit

`production_run_id IS NOT NULL`. ⚠️ Le Conseil de classe (ADR-0021) et la composition champion
(ADR-0022) appellent `equip_notion` **hors lot** : leurs pièces portent `production_run_id = NULL`
et n'apparaissent pas ici. Elles n'ont pas besoin de veto — Papa a cliqué pour elles, leur autorité
est `parent_bulk`. **Mais le silence sur elles ne doit pas se lire comme « rien d'autre n'a été
produit »** : la page l'écrit. Un journal qui paraît exhaustif sans l'être est pire qu'un journal
qui borne son sujet.

## La consommation se résout PAR FAMILLE, jamais par pièce

Cinq familles, cinq requêtes, quel que soit le nombre de pièces affichées. Résoudre pièce par pièce
ferait N requêtes pour une page qui en liste N — le motif qui a tué le sondage de l'en-tête Papa le
2026-08-02.
"""

from datetime import datetime
from typing import Iterable

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Fiche,
    FicheView,
    Lesson,
    LessonView,
    Mindmap,
    MindmapView,
    ProductionEvent,
    ProductionRun,
    Quiz,
    QuizAttempt,
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
)
from app.modules.production import runs

# Les cinq familles vetoables, et ce qui les rend « consommées ».
#
# ⚠️ Le §G.3 n'en énumérait que QUATRE — il oubliait le COURS, alors que c'est la classe (A1) dont
# le palier 3 justifie tout le chantier. `lesson_views` comble ce trou (ADR-0034 §4).
KINDS = ("cours", "fiche", "mindmap", "quiz", "srs")


def _ids(rows: Iterable) -> list[int]:
    return [r for r in rows if r is not None]


def _consumed_sets(db: Session, buckets: dict[str, list[int]]) -> dict[str, set[int]]:
    """Une requête par famille. Renvoie, pour chaque famille, les ids déjà consommés.

    Les `IN ()` vides sont sautés : PostgreSQL les accepte, mais une requête qui ne peut rien
    ramener n'a pas à partir.
    """
    out: dict[str, set[int]] = {k: set() for k in KINDS}

    if buckets["cours"]:
        out["cours"] = set(
            db.scalars(
                select(LessonView.lesson_id).where(LessonView.lesson_id.in_(buckets["cours"]))
            ).all()
        )
    if buckets["fiche"]:
        out["fiche"] = set(
            db.scalars(
                select(FicheView.fiche_id).where(FicheView.fiche_id.in_(buckets["fiche"]))
            ).all()
        )
    if buckets["mindmap"]:
        out["mindmap"] = set(
            db.scalars(
                select(MindmapView.mindmap_id).where(
                    MindmapView.mindmap_id.in_(buckets["mindmap"])
                )
            ).all()
        )
    if buckets["quiz"]:
        out["quiz"] = set(
            db.scalars(
                select(QuizAttempt.quiz_id).where(QuizAttempt.quiz_id.in_(buckets["quiz"]))
            ).all()
        )
    if buckets["srs"]:
        # Une carte est consommée dès sa PREMIÈRE révision (§G.3) : `SpacedReviewAttempt` existe.
        out["srs"] = set(
            db.scalars(
                select(SpacedReviewAttempt.card_id).where(
                    SpacedReviewAttempt.card_id.in_(buckets["srs"])
                )
            ).all()
        )
    return out


def _pieces_of_run(db: Session, run_id: int) -> list[dict]:
    """Les pièces réellement produites par ce lot, tamponnées par le filigrane (ADR-0031)."""
    pieces: list[dict] = []

    for kind, model, title_attr in (
        ("cours", Lesson, "title"),
        ("fiche", Fiche, "title"),
        ("mindmap", Mindmap, "title"),
        ("quiz", Quiz, "title"),
    ):
        for row in db.scalars(
            select(model).where(model.production_run_id == run_id).order_by(model.id)
        ).all():
            pieces.append(
                {
                    "kind": kind,
                    "id": row.id,
                    "label": getattr(row, title_attr, None) or f"{kind} #{row.id}",
                    "validated_by": getattr(row, "validated_by", None),
                    "skill_id": None,
                }
            )

    # Les cartes SRS portent un `skill_id` : elles se rattachent à la notion, pas à la leçon.
    for card in db.scalars(
        select(SpacedReviewCard)
        .where(SpacedReviewCard.production_run_id == run_id)
        .order_by(SpacedReviewCard.id)
    ).all():
        pieces.append(
            {
                "kind": "srs",
                "id": card.id,
                "label": card.front_markdown[:80],
                # `spaced_review_cards` n'a NI `validation_status` NI `validated_by` — constat de
                # code, pas un oubli : c'est la raison pour laquelle A0b est verrouillée au palier
                # 3 (ADR-0032, décision active n°5). `None` se lit « aucune étape de validation
                # n'existe », jamais « non validé ».
                "validated_by": None,
                "skill_id": card.skill_id,
            }
        )
    return pieces


def _decorate_consumption(db: Session, pieces: list[dict]) -> None:
    """Pose `consumed` sur chaque pièce — cinq requêtes, sur place."""
    buckets: dict[str, list[int]] = {k: [] for k in KINDS}
    for p in pieces:
        buckets[p["kind"]].append(p["id"])
    consumed = _consumed_sets(db, buckets)
    for p in pieces:
        p["consumed"] = p["id"] in consumed[p["kind"]]


def _events_of_run(db: Session, run_id: int, names: dict[int, str]) -> list[dict]:
    """Le détail par pièce, dans l'ordre de production."""
    rows = db.scalars(
        select(ProductionEvent)
        .where(ProductionEvent.run_id == run_id)
        .order_by(ProductionEvent.created_at, ProductionEvent.id)
    ).all()
    return [
        {
            "skill_id": e.skill_id,
            "skill_name": names.get(e.skill_id) if e.skill_id else None,
            "piece": e.piece,
            "outcome": e.outcome,
            "detail": e.detail,
            "created_at": e.created_at,
        }
        for e in rows
    ]


def run_status(run: ProductionRun, *, now: datetime | None = None) -> str:
    """Le statut RENDU — `stale` est une lecture, jamais une valeur stockée (ADR-0034 §2)."""
    return "stale" if runs.is_stale(run, now=now) else run.status


def list_journal(db: Session, *, limit: int = 20, offset: int = 0) -> dict:
    """Le flux, du lot le plus récent au plus ancien.

    Pagination explicite : un journal qui grossit sans borne finit par charger toute l'histoire
    du dispositif à chaque ouverture de page.
    """
    total = db.scalar(select(func.count(ProductionRun.id))) or 0
    rows = db.scalars(
        select(ProductionRun)
        .order_by(ProductionRun.created_at.desc(), ProductionRun.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()

    # UN seul aller-retour pour tous les noms de notions de la page — jamais un par événement.
    run_ids = [r.id for r in rows]
    skill_ids: set[int] = {r.current_skill_id for r in rows if r.current_skill_id}
    if run_ids:
        skill_ids.update(
            _ids(
                db.scalars(
                    select(ProductionEvent.skill_id).where(
                        ProductionEvent.run_id.in_(run_ids)
                    )
                ).all()
            )
        )
    names: dict[int, str] = {}
    if skill_ids:
        names = {
            s.id: s.name
            for s in db.scalars(select(Skill).where(Skill.id.in_(skill_ids))).all()
        }

    out_runs = []
    for run in rows:
        pieces = _pieces_of_run(db, run.id)
        _decorate_consumption(db, pieces)
        for p in pieces:
            p["skill_name"] = names.get(p["skill_id"]) if p["skill_id"] else None
        out_runs.append(
            {
                "id": run.id,
                "status": run_status(run),
                "trigger": run.trigger,
                "authorized_by": run.authorized_by,
                "chapter_id": run.chapter_id,
                "total_notions": run.total_notions,
                "done_notions": run.done_notions,
                "current_skill_id": run.current_skill_id,
                "current_skill_name": names.get(run.current_skill_id)
                if run.current_skill_id
                else None,
                "created_at": run.created_at,
                "started_at": run.started_at,
                "finished_at": run.finished_at,
                "events": _events_of_run(db, run.id, names),
                "pieces": pieces,
            }
        )

    return {
        "runs": out_runs,
        # ⚠️ AUCUN total de provenance, aucun ratio ZETIS/Papa (§F.2 : la provenance est un fait,
        # jamais un reproche — elle s'affiche par objet et ne se totalise pas). Ce compteur-ci est
        # celui des LOTS, pour la pagination, et rien d'autre.
        "has_more": offset + len(rows) < total,
    }
