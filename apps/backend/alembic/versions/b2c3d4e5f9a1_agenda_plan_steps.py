"""agenda_plan_steps — le plan de préparation d'une échéance

Revision ID: b2c3d4e5f9a1
Revises: a1b2c3d4e5f8
Create Date: 2026-08-10

ADR-0050, qui réalise le §8 rôle 1 de l'ADR-0025 — le rôle de « traducteur », *« le seul rôle qui
justifie la fonctionnalité ; sans lui, ZETIS construit un carnet de plus »*.

**Une table plutôt qu'un `MissionStep`** : une mission porte un verdict, un scoring, de l'XP et un
`skill_id` obligatoire, et elle est *par notion* ; un plan est *par échéance* et ne mesure rien.
Réutiliser aurait fait entrer tout le moteur de missions dans l'agenda — ce que l'en-tête de
`models/agenda.py` refuse déjà pour `AgendaItem` lui-même.

⚠️ **`ondelete="CASCADE"` est le SEUL DELETE physique de ce domaine.** `AgendaItem` s'archive
(`dismissed_at`, jamais de suppression) ; une étape de plan, elle, se supprime — et se supprime
aussi quand Papa **déplace la date**, parce qu'un rétro-planning est une fonction de la date.

⚠️ **Aucun backfill, et il n'y en aura pas** : les plans se composent à la première lecture de
chaque échéance. Les échéances existantes en auront un dès qu'elles seront lues ; celles qui sont
passées n'en auront jamais, et c'est correct.

⚠️ **Pas d'Enum SQL sur `kind`** — même raisonnement que `AGENDA_KINDS` juste à côté : une valeur
nouvelle ne doit pas coûter une migration. Le vocabulaire fermé est validé côté Pydantic.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b2c3d4e5f9a1"
down_revision: Union[str, None] = "a1b2c3d4e5f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agenda_plan_steps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("agenda_item_id", sa.Integer(), nullable=False),
        # Jours AVANT l'échéance : 1 = la veille. Un offset et non une date — une date stockée
        # survivrait au déplacement qui, lui, révoque le plan.
        sa.Column("day_offset", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=15), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=True),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        # Déclaration de Massimo (ADR-0050 Décision 5 option A) : ne prouve rien, ne crédite
        # aucun XP, et n'est jamais posée par le fait de jouer l'activité.
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["agenda_item_id"], ["agenda_items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agenda_plan_steps_agenda_item_id", "agenda_plan_steps", ["agenda_item_id"]
    )
    # Toutes les lectures partent de l'échéance et rendent ses étapes dans l'ordre.
    op.create_index(
        "ix_agenda_plan_steps_item", "agenda_plan_steps", ["agenda_item_id", "sort_order"]
    )


def downgrade() -> None:
    op.drop_index("ix_agenda_plan_steps_item", table_name="agenda_plan_steps")
    op.drop_index("ix_agenda_plan_steps_agenda_item_id", table_name="agenda_plan_steps")
    op.drop_table("agenda_plan_steps")
