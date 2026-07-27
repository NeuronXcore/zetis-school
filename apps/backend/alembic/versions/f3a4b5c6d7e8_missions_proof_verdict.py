"""missions: proof-based steps + acquisition verdict (ADR-0017 lot 1)

Revision ID: f3a4b5c6d7e8
Revises: e4f5a6b7c8d9
Create Date: 2026-07-05

Seule migration du chantier missions (ADR-0017). Quatre changements sur les tables
existantes `missions` / `mission_steps` :

- `missions.validation_status` (pending|validated|rejected, NOT NULL) : validation Papa
  découplée du cycle de vie (5ter). Backfill des lignes existantes → `validated` (nées d'un
  endpoint Papa : l'invariant « un humain a approuvé » était déjà satisfait).
- `missions.subject_id` → nullable : missions croisées multi-matières futures (aucune logique
  en Lot 1).
- `missions.started_at` : horodatage du start, socle de la PREUVE des étapes (une trace ne
  valide une étape que si elle est postérieure au start).
- `mission_steps.resource_id` : cible réelle de l'étape (skill_id ou quiz_id). Amende la
  prémisse « zéro migration de ciblage » de l'ADR (le champ n'existait pas dans le modèle réel).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f3a4b5c6d7e8"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # validation_status : ajout avec server_default='validated' → backfill automatique des
    # lignes existantes (missions de l'étape 15, nées d'un endpoint Papa).
    op.add_column(
        "missions",
        sa.Column(
            "validation_status",
            sa.String(length=15),
            nullable=False,
            server_default="validated",
        ),
    )
    op.add_column(
        "missions",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.alter_column("missions", "subject_id", existing_type=sa.Integer(), nullable=True)
    op.add_column(
        "mission_steps",
        sa.Column("resource_id", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mission_steps", "resource_id")
    op.alter_column("missions", "subject_id", existing_type=sa.Integer(), nullable=False)
    op.drop_column("missions", "started_at")
    op.drop_column("missions", "validation_status")
