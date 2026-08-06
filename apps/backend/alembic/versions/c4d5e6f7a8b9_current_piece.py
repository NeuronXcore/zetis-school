"""la pièce en cours, pour que la barre bouge vraiment (addendum 2 ADR-0041 §20 bis)

Une colonne, additive, nullable, **aucun backfill** — un lot passé n'a pas de position courante et
n'a pas à s'en inventer une (doctrine §F.4 : le Journal ne reconstitue pas le passé).

Pourquoi elle existe, en un paragraphe : les cinq `ProductionEvent` d'une notion naissent dans le
MÊME commit que `done_notions` (`runner.py`, « un lot tué entre les deux laisserait un journal qui
ment sur ce qu'il a fait »). Compter des pièces sur le journal plutôt que des notions donne donc
exactement le même pas au même instant — `5/155` et `1/31` valent tous deux 3,23 %. Cette colonne
porte la position DANS la notion en vol ; c'est elle, et elle seule, qui fait avancer la barre
toutes les ~14 s au lieu de ~69 s.

⚠️ `String(32)` et non un `Enum` : le vocabulaire vit dans `PIECES` (`db/models/production.py`), et
un type PostgreSQL en doublerait la définition — il faudrait alors une migration pour ajouter une
sixième pièce à un tuple Python. Même choix que `production_events.piece`, qui est déjà un `String`.

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c4d5e6f7a8b9"
down_revision: str | None = "b3c4d5e6f7a8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "production_runs", sa.Column("current_piece", sa.String(length=32), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("production_runs", "current_piece")
