"""add lessons table and lesson_skills link (curriculum pass 2)

Revision ID: c9dae1f2a3b4
Revises: b8c9dae1f2a3
Create Date: 2026-07-03

Référentiel de programme, passe 2 (ADR-0009, Lot 2 Slice A) : la table `lessons`
documentée dans DATA_MODEL.md n'existait pas encore — écart relevé au Lot 1 Slice A,
résorbé ici. Sémantique co-construction (§3) : `created_by` ≈ source, `status` ≈
validation — on réutilise les champs documentés, pas de duplication du motif
`source`/`validation_status` des chapitres. `content_markdown` reste vide en passe 2
(réservé à la génération de cours downstream). `lesson_skills` = liaison minimale
leçon ↔ notion (`Skill`, référentiel persistant) avec unicité de la paire (PK
composite) — aucune table `curriculum_*` (§2). Aucune valeur de reprise à seeder.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9dae1f2a3b4"
down_revision: Union[str, None] = "b8c9dae1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lessons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("chapter_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content_markdown", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="draft"),
        sa.Column("created_by", sa.String(length=20), nullable=False),
        sa.Column("source_document_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("program_version", sa.String(length=20), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"]),
        sa.ForeignKeyConstraint(["source_document_id"], ["rag_documents.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_lessons_chapter_id"), "lessons", ["chapter_id"], unique=False)
    op.create_table(
        "lesson_skills",
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("lesson_id", "skill_id"),
    )


def downgrade() -> None:
    op.drop_table("lesson_skills")
    op.drop_index(op.f("ix_lessons_chapter_id"), table_name="lessons")
    op.drop_table("lessons")
