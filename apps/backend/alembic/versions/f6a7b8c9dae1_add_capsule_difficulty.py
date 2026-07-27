"""add capsule difficulty (facile|moyen|difficile)

Revision ID: f6a7b8c9dae1
Revises: e5f6a7b8c9da
Create Date: 2026-07-01

Niveau de difficulté choisi par Papa à la génération : pilote l'IA (vocabulaire/profondeur)
et s'affiche à Massimo via un badge. NULL pour les capsules antérieures à cette option.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9dae1"
down_revision: Union[str, None] = "e5f6a7b8c9da"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("capsules", sa.Column("difficulty", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("capsules", "difficulty")
