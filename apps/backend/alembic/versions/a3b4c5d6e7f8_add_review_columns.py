"""add review scheduling columns (spaced_review — page Révision)

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-07-04

Migration additive pour la slice backend Révision (SRS). Les tables `spaced_review_*`
existaient depuis le schéma initial, mais deux colonnes documentées dans `DATA_MODEL.md`
/ requises par la page Révision manquaient :

- `spaced_review_cards.last_reviewed_at` : dernier passage noté (bookkeeping Papa) ;
- `spaced_review_attempts.is_consolidation` : marque un re-tour de consolidation (2e
  passage le même jour, sans effet sur la planification) — lisibilité du dashboard Papa.

Empilée sur la HEAD `f2a3b4c5d6e7`. Le `server_default` false backfill les lignes
existantes ; on le conserve (inserts directs sûrs), l'ORM pose la valeur autrement.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3b4c5d6e7f8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "spaced_review_cards",
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "spaced_review_attempts",
        sa.Column(
            "is_consolidation", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    op.drop_column("spaced_review_attempts", "is_consolidation")
    op.drop_column("spaced_review_cards", "last_reviewed_at")
