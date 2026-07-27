"""add lesson content audit fields (provenance du cours)

Revision ID: dae1f2a3b4c5
Revises: c9dae1f2a3b4
Create Date: 2026-07-03

Provenance du COURS (`content_markdown`), distincte de la ligne leçon : `created_at`/
`updated_at` (TimestampMixin) bougent sur n'importe quelle édition (titre, notions…)
et `created_by` décrit la source de la LEÇON — aucun ne dit qui a écrit le cours ni
quand. Quatre colonnes dédiées, nullables (null = pas encore de cours) :
`content_created_*` posés au premier write, `content_updated_*` écrasés à chaque
write ; `*_by` ∈ ('ai', 'parent').

Backfill : le SEUL écrivain historique de `content_markdown` est la rédaction locale
(`generate_lesson_content`) → provenance 'ai' exacte, date approchée par `updated_at`.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "dae1f2a3b4c5"
down_revision: Union[str, None] = "c9dae1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "lessons", sa.Column("content_created_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "lessons", sa.Column("content_created_by", sa.String(length=20), nullable=True)
    )
    op.add_column(
        "lessons", sa.Column("content_updated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "lessons", sa.Column("content_updated_by", sa.String(length=20), nullable=True)
    )
    op.execute(
        "UPDATE lessons SET content_created_at = updated_at, content_created_by = 'ai', "
        "content_updated_at = updated_at, content_updated_by = 'ai' "
        "WHERE content_markdown IS NOT NULL"
    )


def downgrade() -> None:
    op.drop_column("lessons", "content_updated_by")
    op.drop_column("lessons", "content_updated_at")
    op.drop_column("lessons", "content_created_by")
    op.drop_column("lessons", "content_created_at")
