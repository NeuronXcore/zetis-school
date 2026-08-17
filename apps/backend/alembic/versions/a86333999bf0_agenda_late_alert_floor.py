"""agenda_late_alert_floor : le bord bas de la fenêtre d'alerte (ADR-0025 Amdt 9 §D12)

🔴 **Une seule date ne pouvait pas porter les deux questions.** `agenda_late_alert_on` dit « en
ai-je montré un aujourd'hui ? » ; celle-ci dit « à partir d'où je regarde ? ». Confondues, l'accusé
de réception poussait le bord bas à `today` et brûlait toute la fenêtre alors qu'UNE seule échéance
en était sortie — les autres étaient perdues définitivement, le plancher n'avançant que.

⚠️ Toujours une date PAR ÉLÈVE, jamais une marque par item : rien ne dit « vu le 12, jamais fait ».

⚠️ `NULL` sur les élèves existants : le premier passage pose le plancher sans alerter, comme pour
sa colonne sœur. Le passé antérieur ne sera jamais signalé, et c'est voulu.

Revision ID: a86333999bf0
Revises: a8d76627dc51
"""

from alembic import op
import sqlalchemy as sa

revision = "a86333999bf0"
down_revision = "a8d76627dc51"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_profiles", sa.Column("agenda_late_alert_floor", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "agenda_late_alert_floor")
