from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Capsule(Base, TimestampMixin):
    __tablename__ = "capsules"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
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


class Mindmap(Base, TimestampMixin):
    __tablename__ = "mindmaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int | None] = mapped_column(ForeignKey("student_profiles.id"), nullable=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    mindmap_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    mode: Mapped[str] = mapped_column(String(25), default="reference")
    status: Mapped[str] = mapped_column(String(20), default="draft")
