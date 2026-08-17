"""agenda_late_alert_item_id : départager deux échéances du même jour (ADR-0025 Amdt 9 §D12)

🔴 Le plancher était une DATE seule : deux échéances tombant le même jour ne pouvaient pas être
départagées, et montrer la première l'avançait par-dessus la seconde — perdue définitivement. Le
cas est ordinaire : un contrôle et sa leçon tombent le même jour.

Le plancher devient un COUPLE `(due_on, id)`, comme l'ordre de sortie.

⚠️ UN identifiant par élève — celui du dernier alerté — jamais un `seen_at` par échéance.

Revision ID: a8a71c84f86e
Revises: a86333999bf0
"""

from alembic import op
import sqlalchemy as sa

revision = "a8a71c84f86e"
down_revision = "a86333999bf0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_profiles", sa.Column("agenda_late_alert_item_id", sa.Integer(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "agenda_late_alert_item_id")
