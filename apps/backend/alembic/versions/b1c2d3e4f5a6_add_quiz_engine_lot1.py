"""add quiz engine lot 1 columns (ADR-0014)

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-07-05

Moteur de quiz unifié — Lot 1 (formats à correction déterministe). Migration légère,
la seule de la slice (ADR-0014 « migration minime ») :

- `quizzes.lesson_id` : rattache un quiz de fin de cours à sa leçon (0..N par leçon).
  Nullable — les autres contextes (diagnostic, révision) ne sont pas liés à une leçon.
- `quiz_questions.source` (generated|manual) et `quiz_questions.status` (active|retired) :
  la co-construction Papa (question éditée = `manual`, survit aux régénérations) et le
  retrait d'une question défectueuse hors des tirages (les réponses passées restent).

`question_type` est un `String(20)` (pas un enum PostgreSQL) : l'extension des types
(`mcq_multi`, `true_false`, `cloze`, `numeric`) ne demande AUCUN changement de schéma —
seules les nouvelles valeurs applicatives sont émises. Empilée sur la HEAD `a3b4c5d6e7f8`.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1c2d3e4f5a6"
down_revision: Union[str, None] = "a3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "quizzes",
        sa.Column("lesson_id", sa.Integer(), sa.ForeignKey("lessons.id"), nullable=True),
    )
    op.add_column(
        "quiz_questions",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="generated"),
    )
    op.add_column(
        "quiz_questions",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
    )


def downgrade() -> None:
    op.drop_column("quiz_questions", "status")
    op.drop_column("quiz_questions", "source")
    op.drop_column("quizzes", "lesson_id")
