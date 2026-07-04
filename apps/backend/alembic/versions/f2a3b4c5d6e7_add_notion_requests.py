"""add notion_requests table (ELI5 hors-programme → demande à Papa)

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-07-04

Quand l'enfant demande sur ELI5 une notion absente de son programme, on trace la demande
ici (pas de FK skill : la notion n'existe pas encore). Papa la voit dans sa page Programme
et l'ajoute via le skills-backfill. Migration empilée sur la HEAD `e1f2a3b4c5d6`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notion_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "student_id", sa.Integer(), sa.ForeignKey("student_profiles.id"), nullable=False
        ),
        sa.Column("text", sa.String(length=160), nullable=False),
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=True),
        sa.Column("status", sa.String(length=15), nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        op.f("ix_notion_requests_student_id"), "notion_requests", ["student_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_notion_requests_student_id"), table_name="notion_requests")
    op.drop_table("notion_requests")
