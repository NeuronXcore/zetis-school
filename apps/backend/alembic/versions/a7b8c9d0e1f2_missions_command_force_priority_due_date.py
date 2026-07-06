"""missions: force_priority flag + due_date (ADR-0018, Commander une mission)

Revision ID: a7b8c9d0e1f2
Revises: f3a4b5c6d7e8
Create Date: 2026-07-05

Deux colonnes sur `missions` pour le flux « Commander une mission » (ADR-0018) :

- `force_priority` (bool, NOT NULL, défaut false) : plancher de score PAR MISSION. Le sélecteur
  lit ce flag (v2) au lieu du type `manual` — une thématique non prioritaire n'est plus
  plancher-isée. Backfill des lignes existantes → false (aucune mission forcée avant ce chantier).
- `due_date` (date, nullable) : échéance PUREMENT informationnelle (affichage/tri pilotage Papa).
  Jamais sérialisée côté student ; aucun effet mécanique propre (l'urgence passe par
  force_priority).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a7b8c9d0e1f2"
down_revision: Union[str, None] = "f3a4b5c6d7e8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "missions",
        sa.Column(
            "force_priority",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    op.add_column("missions", sa.Column("due_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("missions", "due_date")
    op.drop_column("missions", "force_priority")
