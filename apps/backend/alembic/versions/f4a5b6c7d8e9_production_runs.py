"""journal de production — le lot, et ce qu'il a produit (adr-0031 §4)

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-08-02

`trigger` vit sur le LOT, jamais sur la pièce : un même déclencheur engendre un cours, trois
fiches, deux quiz et huit cartes. Le poser sur chaque ligne de contenu, c'est le recopier sur cinq
tables et le voir diverger au premier correctif.

Les références de déclencheur sont des **FK typées**, jamais un `trigger_ref_id` polymorphe : ce
dernier reproduirait l'ambiguïté qui a fait rejeter `notion_requests` pour porter les demandes de
contenu (« un `skill_id` optionnel qui vaut tantôt inconnu tantôt connu serait ambigu »).

`chapter_id` porte le **scope** — sur quoi le lot a produit. Il ne figure pas dans le schéma de
l'ADR-0031 §4, qui n'a que des colonnes de déclencheur : elles disent POURQUOI on a produit, jamais
SUR QUOI. Sans lui, un run manuel n'aurait rien porté de son propre périmètre.

**Aucune rétro-attribution** : `production_run_id` reste `NULL` sur tout l'existant, même doctrine
que l'addendum ADR-0011 §F.4. Prétendre reconstituer les lots passés fabriquerait une histoire.

Pas d'index sur les FK de déclencheur : elles sont nulles dans le seul régime émis en v1
(`trigger='manual'`), et un index sur une colonne vide coûte des écritures pour rien. `status` et
`student_id` en portent un — ce sont les deux seuls filtres de lecture prévus.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f4a5b6c7d8e9"
down_revision: Union[str, None] = "e3f4a5b6c7d8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONTENT_TABLES = ("lessons", "fiches", "mindmaps", "quizzes", "spaced_review_cards")


def upgrade() -> None:
    op.create_table(
        "production_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("trigger", sa.String(length=20), nullable=False),
        sa.Column("authorized_by", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=15), nullable=False, server_default="queued"),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column("agenda_item_id", sa.Integer(), nullable=True),
        sa.Column("content_request_id", sa.Integer(), nullable=True),
        sa.Column("council_report_id", sa.Integer(), nullable=True),
        sa.Column("skill_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"]),
        sa.ForeignKeyConstraint(["agenda_item_id"], ["agenda_items.id"]),
        sa.ForeignKeyConstraint(["content_request_id"], ["content_requests.id"]),
        sa.ForeignKeyConstraint(["council_report_id"], ["council_reports.id"]),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "(trigger <> 'manual') OR ("
            "agenda_item_id IS NULL AND content_request_id IS NULL "
            "AND council_report_id IS NULL AND skill_id IS NULL)",
            name="ck_production_runs_manual_has_no_reference",
        ),
    )
    op.create_index("ix_production_runs_student_id", "production_runs", ["student_id"])
    op.create_index("ix_production_runs_status", "production_runs", ["status"])

    for table in _CONTENT_TABLES:
        op.add_column(table, sa.Column("production_run_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_production_run_id",
            table,
            "production_runs",
            ["production_run_id"],
            ["id"],
        )


def downgrade() -> None:
    for table in reversed(_CONTENT_TABLES):
        op.drop_constraint(f"fk_{table}_production_run_id", table, type_="foreignkey")
        op.drop_column(table, "production_run_id")
    op.drop_index("ix_production_runs_status", table_name="production_runs")
    op.drop_index("ix_production_runs_student_id", table_name="production_runs")
    op.drop_table("production_runs")
