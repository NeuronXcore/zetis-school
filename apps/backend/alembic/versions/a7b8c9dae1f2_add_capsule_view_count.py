"""add capsule_views.count (repeat-view counter)

Revision ID: a7b8c9dae1f2
Revises: f6a7b8c9dae1
Create Date: 2026-07-01

Compteur de visionnages complets d'une capsule par un élève (répétitions). Les lignes
existantes valent 1 (server_default).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9dae1f2"
down_revision: Union[str, None] = "f6a7b8c9dae1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "capsule_views",
        sa.Column("count", sa.Integer(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    op.drop_column("capsule_views", "count")
