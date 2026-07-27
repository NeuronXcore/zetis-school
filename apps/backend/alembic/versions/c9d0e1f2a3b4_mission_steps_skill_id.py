"""add mission_steps.skill_id (ADR-0022 — missions croisées « champion »)

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-07-06

Une mission `champion` croisée couvre plusieurs notions/matières ; le verdict d'acquisition
PAR NOTION (ADR-0022, arbitrage 3) exige de savoir à quelle notion chaque étape se rattache.
`mission_steps.skill_id` est **nullable** : les missions mono-notion existantes le laissent
NULL et retombent sur `mission.skill_id` (rétro-compatible, zéro backfill).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c9d0e1f2a3b4"
down_revision: Union[str, None] = "b8c9d0e1f2a3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("mission_steps", sa.Column("skill_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_mission_steps_skill_id",
        "mission_steps",
        "skills",
        ["skill_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_mission_steps_skill_id", "mission_steps", type_="foreignkey")
    op.drop_column("mission_steps", "skill_id")
