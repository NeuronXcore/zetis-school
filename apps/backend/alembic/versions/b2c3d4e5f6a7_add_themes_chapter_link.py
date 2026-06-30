"""add themes table + theme_id on chapters (Subject -> Theme -> Chapter)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-30

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "themes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # Un chapitre peut désormais vivre sous un thème, hors année scolaire.
    op.add_column("chapters", sa.Column("theme_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_chapters_theme_id_themes", "chapters", "themes", ["theme_id"], ["id"]
    )
    op.alter_column(
        "chapters", "school_year_subject_id", existing_type=sa.Integer(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "chapters", "school_year_subject_id", existing_type=sa.Integer(), nullable=False
    )
    op.drop_constraint("fk_chapters_theme_id_themes", "chapters", type_="foreignkey")
    op.drop_column("chapters", "theme_id")
    op.drop_table("themes")
