"""add fiches + fiche_views (ADR-0015)

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-07-05

Fiches de révision dérivées du cours canonique validé (leçon-centré : une fiche = 1 leçon).
`fiches.spec_json` porte le `FicheSpec` typé ; `fiche_views` suit les fiches vues par l'élève
(Unique(student, fiche) → « vu »).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fiches",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("spec_json", sa.JSON(), nullable=True),
        sa.Column("validation_status", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("program_version", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_fiches_lesson_id", "fiches", ["lesson_id"])

    op.create_table(
        "fiche_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("fiche_id", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["fiche_id"], ["fiches.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "fiche_id", name="uq_fiche_views_student_fiche"),
    )
    op.create_index("ix_fiche_views_student_id", "fiche_views", ["student_id"])
    op.create_index("ix_fiche_views_fiche_id", "fiche_views", ["fiche_id"])


def downgrade() -> None:
    op.drop_index("ix_fiche_views_fiche_id", table_name="fiche_views")
    op.drop_index("ix_fiche_views_student_id", table_name="fiche_views")
    op.drop_table("fiche_views")
    op.drop_index("ix_fiches_lesson_id", table_name="fiches")
    op.drop_table("fiches")
