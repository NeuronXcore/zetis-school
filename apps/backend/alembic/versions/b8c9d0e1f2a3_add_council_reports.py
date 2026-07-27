"""add council_reports (ADR-0020)

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-07-06

Conseil de classe IA (Papa-only) : rapport figé de narration LLM locale posée sur le service
d'évidence. `subjects_json` = Spec validée + ancrée (recommandations typées) ;
`evidence_snapshot_json` = évidence figée au moment de la génération (auditabilité, car un
artefact LLM n'est pas rejouable). `period` = libellé simple (pas de modèle de période en v1).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c9d0e1f2a3"
down_revision: Union[str, None] = "a7b8c9d0e1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "council_reports",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("period", sa.String(length=30), nullable=False),
        sa.Column("global_summary", sa.Text(), nullable=False),
        sa.Column("subjects_json", sa.JSON(), nullable=False),
        sa.Column("prompt_version", sa.String(length=20), nullable=False),
        sa.Column("evidence_snapshot_json", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_council_reports_student_id", "council_reports", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_council_reports_student_id", table_name="council_reports")
    op.drop_table("council_reports")
