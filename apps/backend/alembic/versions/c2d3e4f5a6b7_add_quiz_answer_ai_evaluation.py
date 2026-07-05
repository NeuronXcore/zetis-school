"""add quiz_answers.ai_evaluation_json (open format, LLM judge)

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-07-05

Moteur de quiz — Lot 2 (ADR-0014, format `open`). Le jugement d'une réponse écrite libre est
structuré (critère par critère + drapeau d'ambiguïté, jamais une note globale opaque) et
persisté dans `quiz_answers.ai_evaluation_json`. Null pour les formats à correction
déterministe du Lot 1. Empilée sur la HEAD `b1c2d3e4f5a6`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b1c2d3e4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("quiz_answers", sa.Column("ai_evaluation_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("quiz_answers", "ai_evaluation_json")
