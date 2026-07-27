"""add capsule_views (per-student view tracking)

Revision ID: e5f6a7b8c9da
Revises: d4e5f6a7b8c9
Create Date: 2026-07-01

Suivi des visionnages de capsules par élève (Massimo). Unique(student, capsule) : « vu » =
ligne existe, « capsules distinctes vues » = nombre de lignes.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9da"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "capsule_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("capsule_id", sa.Integer(), nullable=False),
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["capsule_id"], ["capsules.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "student_id", "capsule_id", name="uq_capsule_views_student_capsule"
        ),
    )
    op.create_index("ix_capsule_views_student_id", "capsule_views", ["student_id"])
    op.create_index("ix_capsule_views_capsule_id", "capsule_views", ["capsule_id"])


def downgrade() -> None:
    op.drop_index("ix_capsule_views_capsule_id", table_name="capsule_views")
    op.drop_index("ix_capsule_views_student_id", table_name="capsule_views")
    op.drop_table("capsule_views")
