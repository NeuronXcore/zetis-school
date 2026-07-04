from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SkillMastery(Base):
    __tablename__ = "skill_mastery"
    __table_args__ = (UniqueConstraint("student_id", "skill_id", name="uq_skill_mastery_student_skill"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    mastery_score: Mapped[float] = mapped_column(Float, default=0)
    confidence_score: Mapped[float] = mapped_column(Float, default=0)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="unknown")


class Gap(Base):
    __tablename__ = "gaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    source: Mapped[str] = mapped_column(String(20), default="diagnostic")
    severity: Mapped[str] = mapped_column(String(10), default="medium")  # low|medium|high
    status: Mapped[str] = mapped_column(String(15), default="open")  # open|in_progress|resolved|ignored
    first_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class NotionRequest(Base, TimestampMixin):
    """Notion demandée par l'enfant sur ELI5 mais absente de son programme.

    L'enfant tape une notion en champ libre non résolue (ex. « pythagore ») et clique
    « Dis à Papa d'ajouter ». Papa la voit dans sa page Programme et l'ajoute via le
    skills-backfill. PAS de FK skill (la notion n'existe pas encore) ; `subject_id`
    optionnel (inconnu la plupart du temps). Statut : pending|added|dismissed.
    """

    __tablename__ = "notion_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    text: Mapped[str] = mapped_column(String(160))
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="pending")  # pending|added|dismissed


class Mission(Base, TimestampMixin):
    __tablename__ = "missions"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mission_type: Mapped[str] = mapped_column(String(20), default="practice")
    status: Mapped[str] = mapped_column(String(15), default="planned")
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(20), default="ai")


class MissionStep(Base):
    __tablename__ = "mission_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id"))
    step_type: Mapped[str] = mapped_column(String(20))
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(15), default="pending")


class XPEvent(Base):
    __tablename__ = "xp_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(40))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class LearningEvent(Base):
    __tablename__ = "learning_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    event_type: Mapped[str] = mapped_column(String(40))
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CapsuleView(Base):
    """Visionnage d'une capsule par un élève. Unique(student, capsule) → « vu » = ligne
    existe, « capsules distinctes vues » = nombre de lignes. `viewed_at` = 1er visionnage."""

    __tablename__ = "capsule_views"
    __table_args__ = (
        UniqueConstraint("student_id", "capsule_id", name="uq_capsule_views_student_capsule"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    capsule_id: Mapped[int] = mapped_column(ForeignKey("capsules.id"), index=True)
    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # Nombre total de visionnages complets (incrémenté à chaque fin de vidéo). `viewed_at` =
    # dernier visionnage. La ligne existe dès le 1er → « vu ».
    count: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class SpacedReviewCard(Base):
    __tablename__ = "spaced_review_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"))
    front_markdown: Mapped[str] = mapped_column(Text)
    back_markdown: Mapped[str] = mapped_column(Text)
    card_type: Mapped[str] = mapped_column(String(20), default="definition")
    interval_days: Mapped[int] = mapped_column(Integer, default=1)
    ease_factor: Mapped[float] = mapped_column(Float, default=2.5)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="new")


class SpacedReviewAttempt(Base):
    __tablename__ = "spaced_review_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("spaced_review_cards.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    rating: Mapped[str] = mapped_column(String(10))  # again|hard|good|easy
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
