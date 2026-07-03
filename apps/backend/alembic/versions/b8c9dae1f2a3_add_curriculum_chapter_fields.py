"""add curriculum fields on chapters (source, validation_status, program_version, metadata_json)

Revision ID: b8c9dae1f2a3
Revises: a7b8c9dae1f2
Create Date: 2026-07-03

Référentiel de programme (ADR-0009 §3) : co-construction Papa/IA par nœud.
`source` + `validation_status` s'ajoutent à `chapters.status` (progression
temporelle, intact — les deux statuts coexistent). Valeurs de reprise pour les
lignes existantes : `manual` / `validated` (l'existant a été écrit/accepté par
Papa). `metadata_json` (JSONB) porte les métadonnées structurées de génération
(themes, suggested_class, repartition, prompt_version) — `description` reste du
texte humain (étape 13-bis, amendée avant tout push/merge de la branche). La
table `lessons` documentée dans DATA_MODEL.md n'existe pas encore en base : sa
création (avec `program_version`) arrive avec la passe 2 (Lot 2).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b8c9dae1f2a3"
down_revision: Union[str, None] = "a7b8c9dae1f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chapters",
        sa.Column("source", sa.String(length=20), nullable=False, server_default="manual"),
    )
    op.add_column(
        "chapters",
        sa.Column(
            "validation_status",
            sa.String(length=20),
            nullable=False,
            server_default="validated",
        ),
    )
    op.add_column(
        "chapters", sa.Column("program_version", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "chapters",
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("chapters", "metadata_json")
    op.drop_column("chapters", "program_version")
    op.drop_column("chapters", "validation_status")
    op.drop_column("chapters", "source")
