"""Provenance de la validation — `validated_at` / `validated_by` (addendum ADR-0011 §F)

`source` dit qui a PRODUIT, `validation_status` dit SI c'est passé — rien ne disait QUI a
laissé passer. Trois situations portaient jusqu'ici la même valeur `validated` : la relecture
pièce à pièce, la validation groupée (`validate-all`, équipement ADR-0021 §2), et l'absence
totale de relecture (quiz, ADR-0014 §2).

Périmètre (§F.1) : les dérivés validables (`fiches`, `mindmaps`, `capsules`) ET le référentiel
(`chapters`, `lessons`) — `validate-all` est le chemin le plus « en lot » du projet. La table
`missions` est **explicitement exclue** : elles naissent `validated` par construction, toujours
par le même chemin, la colonne vaudrait invariablement la même valeur.

Reprise : **NULL partout**, aucune rétro-attribution. Prétendre savoir ce qui a été relu avant
l'existence de la colonne serait exactement le mensonge que cette décision corrige.

Revision ID: d5e6f7a8b9c0
Revises: f1a2b3c4d5e6
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# `quizzes` en fait partie bien qu'il n'ait PAS de `validation_status` : l'ADR-0014 §2 le sert
# sans gate, et l'addendum §F.3 exige qu'il porte `validated_by='system'` à la génération —
# c'est le seul moyen de rendre visible, par objet, qu'un contenu atteint Massimo sans relecture.
# `missions` reste exclue (§F.1) : validée par construction, la colonne serait invariable.
_TABLES = ("fiches", "mindmaps", "capsules", "chapters", "lessons", "quizzes")


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(
            table, sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True)
        )
        op.add_column(table, sa.Column("validated_by", sa.String(length=20), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, "validated_by")
        op.drop_column(table, "validated_at")
