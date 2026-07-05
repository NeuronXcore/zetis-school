from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
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
    # Nullable depuis ADR-0017 (5ter) : les missions « croisées » multi-matières n'ont pas
    # de matière unique — la matière se dérive alors des Skill des étapes. Aucune logique de
    # croisée en Lot 1 ; la colonne est seulement rendue nullable.
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    mission_type: Mapped[str] = mapped_column(String(20), default="practice")
    status: Mapped[str] = mapped_column(String(15), default="planned")
    # ADR-0017 (5ter) : validation Papa découplée du cycle de vie (même séparation que
    # Lesson.status). Toute mission générée naît `pending` ; le gate `validated` est dans la
    # requête des routes student (jamais un filtre Python aval). Défaut `validated` : les voies
    # non génératives (manuel Papa) sont validées par construction — le générateur force `pending`.
    validation_status: Mapped[str] = mapped_column(
        String(15), default="validated", server_default="validated", nullable=False
    )  # pending|validated|rejected
    # Horodatage du passage planned→active (POST /start). Fait foi pour la PREUVE des étapes :
    # une trace (QuizAttempt, score reverse) ne valide une étape que si elle est POSTÉRIEURE au
    # start (une vieille tentative ne valide pas une notion jamais retravaillée — ADR-0017 §5).
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(20), default="ai")
    # ADR-0018 : missions commandées par Papa (« Commander une mission »).
    # `force_priority` alimente le facteur `forced_priority` du sélecteur (plancher de score, lu
    # PAR MISSION depuis v2 — plus par le type). `due_date` est PUREMENT informationnelle (repère
    # d'affichage/tri côté pilotage Papa) : jamais sérialisée dans un schéma student, aucun effet
    # mécanique propre — l'urgence passe exclusivement par `force_priority`.
    force_priority: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="false", nullable=False
    )
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)


class MissionStep(Base):
    __tablename__ = "mission_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    mission_id: Mapped[int] = mapped_column(ForeignKey("missions.id"))
    step_type: Mapped[str] = mapped_column(String(20))  # eli5|vocal_explain|quiz|lesson
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cible réelle de l'étape (ADR-0017 §5, ajout Lot 1) : `skill_id` pour eli5/vocal_explain,
    # `quiz_id` pour quiz. Nullable : une étape de consultation peut ne rien cibler. Sans lui,
    # la preuve « ce quiz-ci, postérieur au start » serait invérifiable.
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
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


class FicheView(Base):
    """Fiche de révision vue par un élève (ADR-0015). Unique(student, fiche) → « vu » = la ligne
    existe (retrait futur du badge « Nouveau »). Analogue à `CapsuleView`, sans compteur."""

    __tablename__ = "fiche_views"
    __table_args__ = (
        UniqueConstraint("student_id", "fiche_id", name="uq_fiche_views_student_fiche"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    fiche_id: Mapped[int] = mapped_column(ForeignKey("fiches.id"), index=True)
    seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


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
    # Horodatage du dernier passage noté (DATA_MODEL.md) — inchangé lors d'une
    # consolidation (re-tour le même jour). Réservé au dashboard Papa ; jamais servi à
    # l'élève (la mécanique SRS est invisible).
    last_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(15), default="new")


class SpacedReviewAttempt(Base):
    __tablename__ = "spaced_review_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_id: Mapped[int] = mapped_column(ForeignKey("spaced_review_cards.id"))
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    rating: Mapped[str] = mapped_column(String(10))  # again|hard|good|easy
    reviewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Re-tour de consolidation (2e passage d'une carte le même jour) : tracé pour la
    # lisibilité du dashboard Papa, sans effet sur la planification. Détecté côté serveur.
    is_consolidation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
