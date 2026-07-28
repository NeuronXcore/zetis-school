"""Horodatages des dérivés : `fiches` et `mindmaps` sans `server_default` (défaut de schéma)

Constat live : `fiches.created_at` / `updated_at` et leurs jumelles sur `mindmaps` ont été
créées **nullable et sans défaut serveur**, contrairement à `quizzes` et `capsules` qui portent
bien `DEFAULT now() NOT NULL`. Conséquence : toute ligne insérée sans horodatage explicite naît
avec `updated_at = NULL`.

Le `TimestampMixin` déclare pourtant `server_default=func.now()` — la divergence vient de la
migration de création de ces deux tables, jamais alignée sur le mixin.

Ce que ça cassait, concrètement : la page Couverture lit `updated_at` comme date de production
du dérivé. Une fiche à `NULL` était donc lue « absente » alors qu'elle existait — Papa cliquait
« générer » en boucle et empilait les doublons sans jamais voir la cellule changer.

Reprise : `updated_at = COALESCE(created_at, now())`. Approximation assumée pour les lignes qui
n'ont ni l'un ni l'autre — leur vraie date de production est perdue, et `now()` est le seul
repère non mensonger disponible (il les marque « fraîches », jamais « périmées » à tort).

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e6f7a8b9c0d1"
down_revision: Union[str, None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = ("fiches", "mindmaps")


def upgrade() -> None:
    for table in _TABLES:
        op.execute(
            f"UPDATE {table} SET created_at = COALESCE(created_at, now()) WHERE created_at IS NULL"
        )
        op.execute(
            f"UPDATE {table} SET updated_at = COALESCE(updated_at, created_at, now()) "
            f"WHERE updated_at IS NULL"
        )
        for column in ("created_at", "updated_at"):
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                nullable=False,
                server_default=sa.text("now()"),
            )


def downgrade() -> None:
    for table in _TABLES:
        for column in ("created_at", "updated_at"):
            op.alter_column(
                table,
                column,
                existing_type=sa.DateTime(timezone=True),
                nullable=True,
                server_default=None,
            )
