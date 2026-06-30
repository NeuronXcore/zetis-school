from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import SpacedReviewCard


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
