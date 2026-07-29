"""settings: table app_settings (réglages à chaud de Papa, ADR-0025 §10)

Revision ID: b2c3d4e5f8a0
Revises: a1b2c3d4e5f7
Create Date: 2026-07-29

Table clé/valeur minimale, née d'un besoin précis : l'interrupteur « autoriser Massimo à
ajouter ses propres échéances » est un **geste de Papa sur sa page**, pas un choix de
déploiement. La variable d'environnement `AGENDA_STUDENT_ENTRY_ENABLED` reste la valeur par
défaut ; la première bascule depuis l'UI crée la ligne, qui prime ensuite.

Aucun back-fill : l'absence de ligne EST l'état « valeur par défaut ».
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f8a0"
down_revision: Union[str, None] = "a1b2c3d4e5f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("value", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
