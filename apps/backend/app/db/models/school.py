from datetime import date, datetime

from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Index, Integer, String, Text
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
    # Provenance de la validation (addendum ADR-0011 §F) : `validation_status` dit SI c'est
    # passé, ces deux colonnes disent QUI a laissé passer. `validate-all` est le chemin le plus
    # « en lot » du projet — sans elles, rien ne distingue un chapitre relu d'un chapitre
    # emporté par un raccourci. NULL = non validé, ou antérieur à la traçabilité.
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # parent | parent_bulk | system
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


class Lesson(Base, TimestampMixin):
    __tablename__ = "lessons"

    id: Mapped[int] = mapped_column(primary_key=True)
    chapter_id: Mapped[int] = mapped_column(ForeignKey("chapters.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Cours complet, rempli par la rédaction locale (`job_type="lesson_content"`) —
    # la passe 2 (ADR-0009) ne le remplit pas.
    content_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Co-construction (ADR-0009 §3) : `created_by` ≈ source, `status` ≈ validation —
    # champs documentés de DATA_MODEL.md, pas de doublon du motif `source`/
    # `validation_status` des chapitres. Rejet d'une leçon `draft` → `archived`
    # (l'énuméré documenté n'a pas de `rejected`).
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|validated|archived
    created_by: Mapped[str] = mapped_column(String(20))  # parent|ai|imported
    source_document_id: Mapped[int | None] = mapped_column(
        ForeignKey("rag_documents.id"), nullable=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020
    # Provenance du COURS (≠ TimestampMixin, qui bouge sur toute édition de la ligne) :
    # `created_*` posés au premier write du cours, `updated_*` écrasés à chaque write.
    # Null = pas encore de cours. `*_by` ∈ ('ai', 'parent').
    content_created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    content_created_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    content_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    content_updated_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Provenance de la validation de la LEÇON (addendum ADR-0011 §F). Distincte de
    # `content_updated_by` (`ai`/`parent`), qui dit qui a ÉCRIT le cours : ici, qui l'a laissé
    # ATTEINDRE Massimo. L'équipement ADR-0021 §2 génère ET auto-valide le cours dans son kit —
    # un cours `parent_bulk` dit donc « Massimo lit un cours que Papa n'a jamais ouvert ».
    validated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    validated_by: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # parent | parent_bulk | system
    # Lot de production qui a produit cette pièce (ADR-0031 §4). `NULL` = produit hors lot,
    # ou antérieur au journal — **aucune rétro-attribution** (doctrine §F.4).
    production_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_runs.id"), nullable=True
    )



class LessonSkill(Base):
    """Liaison leçon ↔ notion (`Skill`) — minimale : PK composite = unicité de la paire.

    Aucune table `curriculum_*` (ADR-0009 §2) : les notions upsertées par la passe 2
    SONT des `Skill` (le référentiel persistant) ; cette table ne fait que rattacher."""

    __tablename__ = "lesson_skills"
    # La PK composite est ordonnée `(lesson_id, skill_id)` et n'aide donc pas les requêtes
    # filtrant par notion — c'est le cas de la résolution du cours canonique (addendum
    # ADR-0009 §B/§C : « quelle leçon validée enseigne cette skill »). Index dédié requis.
    __table_args__ = (Index("ix_lesson_skills_skill", "skill_id"),)

    lesson_id: Mapped[int] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), primary_key=True
    )
    skill_id: Mapped[int] = mapped_column(ForeignKey("skills.id"), primary_key=True)
