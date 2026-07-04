from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Callable

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import (
    Skill,
    SpacedReviewAttempt,
    SpacedReviewCard,
    StudentProfile,
    Subject,
)
from app.modules.gamification.service import award_xp


def interval_from_score(score: int) -> int:
    """Intervalle FIXE de révision selon le score (pas de SM-2, pas d'ease_factor)."""
    if score < 50:
        return 1
    if score < 75:
        return 3
    return 7


def schedule_review(
    db: Session, *, student_id: int, skill_id: int, interval: int, front: str, back: str
) -> SpacedReviewCard:
    """Crée ou met à jour LA carte de révision d'une notion (due_at = now + intervalle)."""
    now = datetime.now(timezone.utc)
    due = now + timedelta(days=interval)

    card = db.scalar(
        select(SpacedReviewCard).where(
            SpacedReviewCard.student_id == student_id,
            SpacedReviewCard.skill_id == skill_id,
        )
    )
    if card is None:
        card = SpacedReviewCard(
            student_id=student_id,
            skill_id=skill_id,
            front_markdown=front,
            back_markdown=back,
            card_type="definition",
            interval_days=interval,
            due_at=due,
            status="scheduled",
        )
        db.add(card)
    else:
        card.front_markdown = front
        card.back_markdown = back
        card.interval_days = interval
        card.due_at = due
        card.status = "scheduled"
    return card


def get_due_cards(db: Session, *, student_id: int) -> list[SpacedReviewCard]:
    now = datetime.now(timezone.utc)
    return list(
        db.scalars(
            select(SpacedReviewCard).where(
                SpacedReviewCard.student_id == student_id,
                SpacedReviewCard.due_at <= now,
            )
        )
    )


# --- Session de révision (page Massimo « Révision », spec docs/frontend-massimo/page-revision.md) ---
#
# Plafonds de session — constantes SERVEUR, jamais exposées au client : la mécanique SRS
# est invisible côté Massimo (cf. page-revision.md §Plafonds).
REVIEW_SESSION_MAX_MIX = 12  # « Mélange du jour » (toutes matières)
REVIEW_SESSION_MAX_SUBJECT = 8  # deck matière
REVIEW_SESSION_FLASH = 5  # « Mélange éclair »

# XP : récompense l'EFFORT, pas le score (aucune incitation à s'auto-noter « Facile »).
XP_PER_REVIEW = 5  # premier passage du jour, quel que soit le rating
XP_PER_CONSOLIDATION = 2  # re-tour immédiat (planification inchangée)
XP_REASON_REVIEW = "review"
XP_REASON_CONSOLIDATION = "review_consolidation"

# Intervalles MVP (rating → délai en jours). PAS de SM-2 : `ease_factor` reste à sa
# valeur par défaut (réserve d'évolution, docs/ai/spaced-memory.md §Adaptation).
RATING_INTERVALS = {"again": 1, "hard": 3, "good": 7, "easy": 14}
VALID_RATINGS = frozenset(RATING_INTERVALS)

# Une carte « active » (`scheduled`/`new`) est révisable ; on exclut les états non-servis
# (ADR-0012) : `pending` = générée sans cours validé (cas dégradé) ; `suspended` = orpheline
# (plus aucun cours validé ne la couvre, planification conservée) ; `archived` = réserve.
# Le gate `due_at IS NOT NULL` (cf. `_due_conditions`) exclut déjà `pending` (due_at null) ;
# ce filtre de statut protège aussi les cartes suspendues (qui gardent leur due_at).
INACTIVE_CARD_STATUSES = frozenset({"pending", "suspended", "archived"})


def _now() -> datetime:
    """Instant courant (UTC = timezone serveur). Isolé pour être figé dans les tests."""
    return datetime.now(timezone.utc)


def _due_conditions(student_id: int, now: datetime):
    """Clauses WHERE communes : cartes dues et actives d'un élève."""
    return (
        SpacedReviewCard.student_id == student_id,
        SpacedReviewCard.due_at.is_not(None),
        SpacedReviewCard.due_at <= now,
        SpacedReviewCard.status.not_in(INACTIVE_CARD_STATUSES),
    )


def get_reviews_summary(db: Session, student: StudentProfile) -> dict:
    """Cartes dues agrégées par matière (via `skill_id` → `Skill.subject_id`).

    Compteurs EXACTS : le « 15+ » est de la présentation (slice UI). `flash_size` = nombre
    de cartes que servirait le « Mélange éclair ».
    """
    now = _now()
    rows = db.execute(
        select(Subject.slug, Subject.name, func.count(SpacedReviewCard.id))
        .join(Skill, Skill.subject_id == Subject.id)
        .join(SpacedReviewCard, SpacedReviewCard.skill_id == Skill.id)
        .where(*_due_conditions(student.id, now))
        .group_by(Subject.id)
        .order_by(Subject.sort_order, Subject.name)
    ).all()
    subjects = [{"slug": slug, "name": name, "due_count": count} for slug, name, count in rows]
    total_due = sum(s["due_count"] for s in subjects)
    return {
        "subjects": subjects,
        "total_due": total_due,
        "flash_size": min(REVIEW_SESSION_FLASH, total_due),
    }


def interleave(cards: list, key: Callable[[object], str]) -> list:
    """Entrelace des cartes pour éviter deux matières identiques consécutives quand c'est
    possible — c'est le mécanisme pédagogique du deck mélange, pas un détail cosmétique
    (un `ORDER BY random()` ne le garantit PAS).

    Déterministe (aucun aléa) : à entrée égale, sortie égale. Stable : l'ordre d'entrée
    (due_at croissant) est préservé au sein d'une matière et sert de départage. Ne lève
    jamais : si l'alternance est impossible (ex. 5 cartes d'une matière + 1 d'une autre),
    le résultat reste complet, avec les collisions inévitables regroupées en fin.
    """
    groups: dict[str, deque] = {}
    order: list[str] = []  # ordre de première apparition = départage déterministe
    for card in cards:
        k = key(card)
        if k not in groups:
            groups[k] = deque()
            order.append(k)
        groups[k].append(card)

    result: list = []
    prev: str | None = None
    while len(result) < len(cards):
        eligible = [k for k in order if groups[k] and k != prev]
        if not eligible:  # seule la matière précédente reste : on la place quand même
            eligible = [k for k in order if groups[k]]
        # matière la plus fournie d'abord (évite de la coincer en fin, ce qui créerait
        # des collisions) ; à égalité, ordre d'apparition.
        best = max(eligible, key=lambda k: (len(groups[k]), -order.index(k)))
        result.append(groups[best].popleft())
        prev = best
    return result


def build_session(
    db: Session, student: StudentProfile, *, deck: str, subject_slug: str | None = None
) -> list[dict]:
    """Construit la liste de cartes d'une session, bornée et ordonnée côté serveur.

    `deck` ∈ {"mix_day", "mix_flash", "subject"} (+ `subject_slug` pour un deck matière).
    Sélection : cartes dues triées par `due_at` croissant (les plus anciennes d'abord),
    plafonnées selon le deck, puis entrelacées pour les mélanges. Le payload n'expose
    AUCUN champ de planification (`due_at`, `interval_days`, `ease_factor`).
    """
    now = _now()
    stmt = (
        select(SpacedReviewCard, Subject.slug)
        .join(Skill, SpacedReviewCard.skill_id == Skill.id)
        .join(Subject, Skill.subject_id == Subject.id)
        .where(*_due_conditions(student.id, now))
        .order_by(SpacedReviewCard.due_at.asc(), SpacedReviewCard.id.asc())
    )

    if deck == "mix_day":
        cap, mix = REVIEW_SESSION_MAX_MIX, True
    elif deck == "mix_flash":
        cap, mix = REVIEW_SESSION_FLASH, True
    elif deck == "subject":
        if not subject_slug:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matière manquante.")
        stmt = stmt.where(Subject.slug == subject_slug)
        cap, mix = REVIEW_SESSION_MAX_SUBJECT, False
    else:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deck inconnu.")

    rows = db.execute(stmt.limit(cap)).all()  # (card, slug), déjà les plus anciennes

    if deck == "subject" and not rows:
        # Matière inconnue OU sans carte due → même 400 (indiscernable, pas de fuite).
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Aucune carte à réviser pour cette matière."
        )

    selected = interleave(rows, key=lambda r: r[1]) if mix else rows
    return [
        {
            "card_id": card.id,
            "subject_slug": slug,
            "front_markdown": card.front_markdown,
            "back_markdown": card.back_markdown,
        }
        for card, slug in selected
    ]


def record_attempt(
    db: Session, student: StudentProfile, card_id: int, rating: str
) -> dict:
    """Enregistre une note de carte et crédite l'XP.

    Consolidation détectée CÔTÉ SERVEUR (pas de flag client) : si la carte a déjà un
    attempt du même élève aujourd'hui (jour civil serveur), c'est un re-tour →
    planification inchangée, XP réduit. Sinon, replanification selon le rating (XP plein,
    quel que soit le rating). Une carte inexistante ou d'un autre élève → 404 (pas de
    fuite d'existence).
    """
    if rating not in VALID_RATINGS:  # défense (le router garde déjà via Literal → 422)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Note de révision inconnue.")

    card = db.scalar(
        select(SpacedReviewCard).where(
            SpacedReviewCard.id == card_id,
            SpacedReviewCard.student_id == student.id,
        )
    )
    if card is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carte introuvable.")

    now = _now()
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    already_today = db.scalar(
        select(func.count(SpacedReviewAttempt.id)).where(
            SpacedReviewAttempt.card_id == card.id,
            SpacedReviewAttempt.student_id == student.id,
            SpacedReviewAttempt.reviewed_at >= day_start,
        )
    )
    is_consolidation = bool(already_today)

    skill = db.get(Skill, card.skill_id)
    subject_id = skill.subject_id if skill is not None else None

    if is_consolidation:
        # Re-tour : tracé, mais `due_at` / `interval_days` / `last_reviewed_at` intacts
        # (un « Bien » à 3 min ne doit pas honnêtement envoyer la carte à 7 jours).
        next_due_at = card.due_at
        xp, reason = XP_PER_CONSOLIDATION, XP_REASON_CONSOLIDATION
    else:
        interval = RATING_INTERVALS[rating]
        card.interval_days = interval
        card.due_at = now + timedelta(days=interval)
        card.last_reviewed_at = now
        card.status = "scheduled"
        next_due_at = card.due_at
        xp, reason = XP_PER_REVIEW, XP_REASON_REVIEW

    db.add(
        SpacedReviewAttempt(
            card_id=card.id,
            student_id=student.id,
            rating=rating,
            reviewed_at=now,
            next_due_at=next_due_at,
            is_consolidation=is_consolidation,
        )
    )
    award_xp(db, student_id=student.id, subject_id=subject_id, amount=xp, reason=reason)
    db.commit()
    return {
        "next_due_at": next_due_at,
        "xp_awarded": xp,
        "is_consolidation": is_consolidation,
    }
