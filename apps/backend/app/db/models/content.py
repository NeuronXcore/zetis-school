from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Capsule(Base, TimestampMixin):
    __tablename__ = "capsules"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # Classement pédagogique : une capsule peut être rattachée à un chapitre (facultatif).
    # Sert au regroupement matière → chapitre dans les listes Papa et Massimo.
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id"), nullable=True)
    # Niveau de difficulté choisi par Papa (facile|moyen|difficile) : pilote la génération IA
    # et s'affiche via un badge côté Massimo. NULL pour les capsules d'avant cette option.
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    storyboard_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    # --- Lot 1 (ADR-0007) : génération LLM → CapsuleSpec typé, validé par Papa. ---
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected


class Fiche(Base, TimestampMixin):
    """Fiche de révision d'UNE leçon (ADR-0015), dérivée du cours canonique validé.

    Leçon-centré : une fiche = 1 leçon = 1 page (`lesson_id`). `spec_json` porte le `FicheSpec`
    typé (validé par Pydantic avant persistance — jamais de spec invalide en base). Conventions
    de colonnes reprises de `capsules` (`validation_status`, `source`, `program_version`).
    """

    __tablename__ = "fiches"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), index=True)
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated | manual
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020


class Mindmap(Base, TimestampMixin):
    """Carte mentale d'UNE leçon (ADR-0016), dérivée du cours canonique validé — sœur des fiches.

    Leçon-centré : une mindmap = 1 leçon (`lesson_id`). `mindmap_json` porte un ARBRE STRICT
    (nœuds reliés par `parent`) **sans positions** — le layout est de la présentation, calculé
    côté client (Slice B). Conventions de colonnes reprises de `fiches`/`capsules`
    (`validation_status`, `source`, `program_version`).
    """

    __tablename__ = "mindmaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), index=True)
    mindmap_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated | manual
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020


class MindmapAttempt(Base, TimestampMixin):
    """Tentative de reconstruction d'une mindmap (mode `student_reconstruction`, ADR-0016).

    Le `score` (0–100) et le détail juste/faux par nœud (`details_json`) sont calculés **côté
    serveur** de façon déterministe (comparaison des nœuds placés à l'arbre de référence). Aucune
    position n'est stockée : seule la structure est notée.
    """

    __tablename__ = "mindmap_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    mindmap_id: Mapped[int] = mapped_column(ForeignKey("mindmaps.id"), index=True)
    score: Mapped[int] = mapped_column(default=0)  # 0–100, sur les nœuds requis
    details_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
