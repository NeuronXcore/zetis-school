"""avancement du lot : total_notions / done_notions (adr-0031 slice C bis)

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-08-02

Le journal savait s'il tournait, pas OÙ IL EN ÉTAIT. L'indicateur d'en-tête Papa demandait un
pourcentage réel ; le déduire du contenu déjà produit aurait été faux (une notion dont tout existe
déjà ne produit rien et compte pourtant comme faite).

Deux compteurs plutôt qu'une table d'étapes : l'ORDRE de `scope.plan` est déterministe et testé,
donc « les N premières notions du plan sont faites » suffit à reconstituer le détail sans le
persister. Une table d'étapes aurait triplé le coût d'écriture d'un lot pour la même information.

Nullables : les runs antérieurs n'ont pas ces compteurs et n'en auront jamais — aucune
rétro-attribution, même doctrine que `production_run_id`.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "a5b6c7d8e9f0"
down_revision: Union[str, None] = "f4a5b6c7d8e9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("production_runs", sa.Column("total_notions", sa.Integer(), nullable=True))
    op.add_column("production_runs", sa.Column("done_notions", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("production_runs", "done_notions")
    op.drop_column("production_runs", "total_notions")
