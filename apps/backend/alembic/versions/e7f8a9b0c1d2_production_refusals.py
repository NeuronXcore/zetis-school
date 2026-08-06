"""un régulateur qui refuse laisse une trace (addendum 2 ADR-0041 §21)

Une table, additive, **aucun backfill** : les refus passés sont perdus et le resteront. Les
inventer serait pire que les taire — la doctrine §F.4 vaut ici comme ailleurs, le dépôt ne
reconstitue pas ce qu'il n'a pas vu.

Le trou qu'elle bouche : les cinq régulateurs de `runs.create_run` lèvent un `409`. Quand Papa
clique, il le lit à l'écran. Quand le scan nocturne se le prend, `triggers.py` l'attrape et le
range dans le retour d'un job RQ **que personne ne lit** — la journée passait sans production et
sans explication.

⚠️ Seuls les refus AUTOMATIQUES y entrent (`trigger != "manual"`), et seuls ceux qui viennent d'un
RÉGULATEUR (`ProductionRefused`) : un `404` sur un chapitre effacé est un défaut de donnée, pas une
décision de politique.

Revision ID: e7f8a9b0c1d2
Revises: c4d5e6f7a8b9
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: str | None = "c4d5e6f7a8b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "production_refusals",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("regulator", sa.String(length=20), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("chapter_id", sa.Integer(), sa.ForeignKey("chapters.id"), nullable=True),
        sa.Column("skill_id", sa.Integer(), sa.ForeignKey("skills.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )
    # La seule lecture de cette table : les non-acquittés, du plus récent au plus ancien.
    op.create_index(
        "ix_production_refusals_ack_created",
        "production_refusals",
        ["acknowledged_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_production_refusals_ack_created", table_name="production_refusals")
    op.drop_table("production_refusals")
