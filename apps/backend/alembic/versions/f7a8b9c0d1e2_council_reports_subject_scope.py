"""council_reports.subject_id — portée matière du Conseil de classe

Addendum ADR-0020 (2026-08-05). Additive et SANS backfill : `NULL` = rapport GLOBAL, ce que sont
par construction tous les rapports existants.

⚠️ Cette migration n'est exercée par AUCUN test — le `conftest` construit le schéma par
`Base.metadata.create_all`, jamais par `alembic upgrade`. Un `alembic upgrade head` manuel sur la
base de dev fait partie du lot ; côté Python, seul un test de fumée sur le modèle ORM attrape
l'oubli de la colonne.

Revision ID: f7a8b9c0d1e2
Revises: e9f0a1b2c3d4
"""

from alembic import op
import sqlalchemy as sa

revision: str = "f7a8b9c0d1e2"
down_revision: str | None = "e9f0a1b2c3d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "council_reports",
        sa.Column("subject_id", sa.Integer(), sa.ForeignKey("subjects.id"), nullable=True),
    )
    # Indexé sur le COUPLE : la liste filtre toujours par élève, et parfois en plus par matière.
    op.create_index(
        "ix_council_reports_student_subject", "council_reports", ["student_id", "subject_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_council_reports_student_subject", table_name="council_reports")
    op.drop_column("council_reports", "subject_id")
