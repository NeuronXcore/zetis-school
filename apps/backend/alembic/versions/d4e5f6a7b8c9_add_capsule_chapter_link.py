"""add capsule chapter link (chapter_id FK)

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-07-01

Rattachement facultatif d'une capsule à un chapitre (`chapters.id`) pour le regroupement
matière → chapitre dans les listes Papa et Massimo. Les capsules existantes restent à NULL
(bucket « Sans chapitre » côté UI).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("capsules", sa.Column("chapter_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_capsules_chapter_id_chapters",
        "capsules",
        "chapters",
        ["chapter_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_capsules_chapter_id_chapters", "capsules", type_="foreignkey")
    op.drop_column("capsules", "chapter_id")
