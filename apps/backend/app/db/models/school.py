from datetime import date

from sqlalchemy import JSON, Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Subject(Base):
    __tablename__ = "subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    color: Mapped[str | None] = mapped_column(String(20), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(20), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class SchoolYear(Base, TimestampMixin):
    __tablename__ = "school_years"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    label: Mapped[str] = mapped_column(String(40))  # ex: 2026-2027
    level: Mapped[str] = mapped_column(String(20))  # ex: 4e
    starts_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    ends_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # draft|active|archived
    # Déprécié — cf. ADR-0009 §4 : jamais lu (la co-construction est un état par nœud,
    # `source`/`validation_status` sur Chapter). Suppression à la première migration
    # touchant `school_years`.
    mode: Mapped[str] = mapped_column(String(20), default="hybrid")  # ai_auto|hybrid|manual


class SchoolYearSubject(Base):
    __tablename__ = "school_year_subjects"

    id: Mapped[int] = mapped_column(primary_key=True)
    school_year_id: Mapped[int] = mapped_column(ForeignKey("school_years.id"))
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    weekly_target_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")


class Theme(Base):
    __tablename__ = "themes"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class Chapter(Base):
    __tablename__ = "chapters"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Rattachement par programme (Étape 9). Nullable depuis le module subjects :
    # un chapitre peut désormais vivre directement sous un thème (Subject → Theme → Chapter).
    school_year_subject_id: Mapped[int | None] = mapped_column(
        ForeignKey("school_year_subjects.id"), nullable=True
    )
    theme_id: Mapped[int | None] = mapped_column(ForeignKey("themes.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    period: Mapped[str | None] = mapped_column(String(40), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="planned")  # planned|active|completed|skipped
    # --- Référentiel de programme (ADR-0009 §3) : co-construction Papa/IA par nœud. ---
    # `status` ci-dessus reste la progression temporelle ; `validation_status` est le
    # statut de validation du référentiel — les deux coexistent, ne pas fusionner.
    source: Mapped[str] = mapped_column(String(20), default="manual")  # generated|manual
    validation_status: Mapped[str] = mapped_column(
        String(20), default="validated"
    )  # pending|validated|rejected — manuel = validé d'office ; généré = pending
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020
    # Métadonnées structurées de génération (étape 13-bis) : {themes, suggested_class,
    # repartition, prompt_version}. `description` reste du texte humain librement éditable
    # par Papa — jamais de sérialisation dedans. JSONB sur Postgres (requêtable), JSON en
    # tests SQLite.
    metadata_json: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"), nullable=True
    )


class LearningObjective(Base):
    __tablename__ = "learning_objectives"

    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"))
    label: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_mastery_level: Mapped[int | None] = mapped_column(Integer, nullable=True)


class Skill(Base):
    __tablename__ = "skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    level: Mapped[str | None] = mapped_column(String(20), nullable=True)  # 5e, 4e...
    parent_skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
