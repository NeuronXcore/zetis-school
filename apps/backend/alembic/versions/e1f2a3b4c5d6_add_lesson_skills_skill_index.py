"""add ix_lesson_skills_skill index on lesson_skills(skill_id)

Revision ID: e1f2a3b4c5d6
Revises: dae1f2a3b4c5
Create Date: 2026-07-03

Invariant du cours canonique (addendum ADR-0009 §B/§C) : les dérivés résolvent « quelle
leçon validée enseigne cette notion » en filtrant `lesson_skills` PAR `skill_id`. La PK
composite `(lesson_id, skill_id)` créée par `c9dae1f2a3b4` est ordonnée sur `lesson_id`
en tête et ne couvre donc pas ce filtre. Migration EMPILÉE (jamais de réécriture de
`c9dae1f2a3b4`, déjà appliquée) ajoutant l'index dédié `ix_lesson_skills_skill`.
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "dae1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        op.f("ix_lesson_skills_skill"), "lesson_skills", ["skill_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_lesson_skills_skill"), table_name="lesson_skills")
