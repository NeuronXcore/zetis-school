"""add capsule Lot 1 fields (instruction, spec_json, validation_status)

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-07-01

Champs du Lot 1 capsules (ADR-0007) : l'instruction Papa, le CapsuleSpec généré (JSON)
et le statut de validation (pending | validated | rejected).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("capsules", sa.Column("instruction", sa.Text(), nullable=True))
    op.add_column("capsules", sa.Column("spec_json", sa.JSON(), nullable=True))
    op.add_column(
        "capsules",
        sa.Column(
            "validation_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )


def downgrade() -> None:
    op.drop_column("capsules", "validation_status")
    op.drop_column("capsules", "spec_json")
    op.drop_column("capsules", "instruction")
