"""add content_requests table (chat orchestrateur → demande de contenu à Papa)

Revision ID: c3d4e5f6a1b2
Revises: b2c3d4e5f8a0
Create Date: 2026-07-30

Addendum ADR-0027 (Point ouvert n°4). Quand Massimo réclame dans le chat un contenu ABSENT sur une
notion qui EXISTE, on trace la demande ici (file dédupliquée que Papa traite depuis la Couverture).
Sémantique inverse de `notion_requests` (notion hors programme, texte libre) : ici `skill_id` est
NOT NULL. `UniqueConstraint(student, skill, kind)` = dédup forte. Empilée sur la HEAD `b2c3d4e5f8a0`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a1b2"
down_revision: Union[str, None] = "b2c3d4e5f8a0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "content_requests",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "student_id", sa.Integer(), sa.ForeignKey("student_profiles.id"), nullable=False
        ),
        sa.Column("skill_id", sa.Integer(), sa.ForeignKey("skills.id"), nullable=False),
        sa.Column("content_kind", sa.String(length=15), nullable=False),
        sa.Column("status", sa.String(length=15), nullable=False, server_default="pending"),
        sa.Column(
            "source", sa.String(length=30), nullable=False, server_default="chat_orchestrator"
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint(
            "student_id", "skill_id", "content_kind", name="uq_content_request_student_skill_kind"
        ),
    )
    op.create_index(
        op.f("ix_content_requests_student_id"), "content_requests", ["student_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_content_requests_student_id"), table_name="content_requests")
    op.drop_table("content_requests")
