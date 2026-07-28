"""index composite learning_events (student_id, created_at) — chantier « Activité »

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-07-27

Le journal d'activité n'avait AUCUN index hors clé primaire (cf. `96c52d4ba103_initial_schema`).
Or toutes les lectures de pilotage scannent une fenêtre temporelle pour un élève donné :
heatmap 26 semaines, sessions d'une période, détail d'un jour. L'index composite
`(student_id, created_at)` sert exactement ce motif.

Seule migration du chantier : la table et le modèle existaient déjà, aucune colonne n'est
ajoutée et les sessions ne sont pas stockées (elles sont reconstruites à la lecture).
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d0e1f2a3b4c5"
down_revision: Union[str, None] = "c9d0e1f2a3b4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_learning_events_student_created",
        "learning_events",
        ["student_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_learning_events_student_created", table_name="learning_events")
