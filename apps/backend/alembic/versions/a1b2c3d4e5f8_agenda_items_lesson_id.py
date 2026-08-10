"""agenda_items.lesson_id — l'échéance pointe vers SON cours

Revision ID: a1b2c3d4e5f8
Revises: e2f3a4b5c6d7
Create Date: 2026-08-10

Addendum ADR-0025 §15. **Révoque le §13.3**, qui avait écarté cette colonne au motif qu'elle
« n'alimenterait aujourd'hui aucun moteur ». Le motif était exact ; le consommateur qui manquait
existe désormais — le lien de l'agenda de Massimo vers son cours.

Nullable, et elle le restera : une échéance sans leçon rattachée est parfaitement valide (Papa
saisit un intitulé libre, ou Massimo saisira un jour sans sélecteur). Le lien dégrade alors vers
le chapitre, puis vers la matière.

⚠️ Aucun backfill. Les échéances antérieures n'ont pas de leçon et n'en auront pas : la
rétro-attribution supposerait de deviner, et `provenance.py` §F.4 refuse ce geste ailleurs pour
la même raison.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f8"
down_revision: Union[str, None] = "e2f3a4b5c6d7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agenda_items", sa.Column("lesson_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_agenda_items_lesson_id", "agenda_items", "lessons", ["lesson_id"], ["id"]
    )


def downgrade() -> None:
    op.drop_constraint("fk_agenda_items_lesson_id", "agenda_items", type_="foreignkey")
    op.drop_column("agenda_items", "lesson_id")
