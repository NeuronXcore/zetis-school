"""le régime ZETIS sous lequel un lot a tourné (addendum ADR-0034)

Revision ID: d8e9f0a1b2c3
Revises: c7d8e9f0a1b2
Create Date: 2026-08-04

Le Journal disait ce qu'un lot avait fait, jamais **sous quel régime**. Or c'est le régime qui rend
le résultat lisible : un lot qui n'a rien produit sous *Manual* n'est pas une panne, c'est un gate
qui a fonctionné. Sans cette information, les deux se ressemblent — constaté le 2026-08-04 sur les
lots #21 et #22, lus comme des échecs.

⚠️ **Deux paliers, jamais le nom du régime.** L'ADR-0032 a refusé de persister le préréglage
(« un mode stocké *plus* six clés donnerait deux réponses à une seule question ») : `niveau_de()`
le dérive des valeurs. On garde donc les FAITS et on redérive le nom à la lecture, avec la même
fonction. Stocker « autonome » aurait créé une seconde source de vérité pour une chose dérivée.

⚠️ **Deux et pas six** : `NIVEAUX` ne nomme que `A0a` et `A1` — les deux classes réglables, celles
qui commandent la production. Recopier les quatre autres, verrouillées, aurait figé sur chaque lot
des valeurs qui ne peuvent pas changer.

`NULL` sur les lignes existantes, et **rien n'est rétro-attribué** : le régime d'un lot d'hier n'est
pas déductible des réglages d'aujourd'hui, et le Journal ne reconstitue pas le passé (doctrine
§F.4). Ces lots-là afficheront « régime non enregistré », ce qui est la vérité.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("production_runs", sa.Column("a0a_level", sa.Integer(), nullable=True))
    op.add_column("production_runs", sa.Column("a1_level", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("production_runs", "a1_level")
    op.drop_column("production_runs", "a0a_level")
