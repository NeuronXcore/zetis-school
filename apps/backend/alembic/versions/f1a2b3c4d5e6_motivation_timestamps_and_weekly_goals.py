"""horodatages de bascule + engagement hebdomadaire (chantier « auto-motivation »)

Revision ID: f1a2b3c4d5e6
Revises: d0e1f2a3b4c5
Create Date: 2026-07-27

Trois objets, un seul chantier — ils partent ensemble et un `downgrade -1` doit rendre l'état
d'avant.

`skill_mastery.mastered_at` et `gaps.resolved_at` : sans eux, « notions consolidées cette
semaine » et « lacunes refermées cette semaine » ne sont PAS calculables honnêtement. La
transition de statut est détruite à l'écriture — contrairement aux sessions du chantier
« Activité », elle n'est pas recalculable depuis le journal, d'où deux colonnes plutôt qu'une
projection. `resolved_at` était d'ailleurs déjà spécifié dans DATA_MODEL.md : c'est un rattrapage.

**Aucun backfill, volontairement.** Les lignes existantes restent à NULL = « consolidée / refermée
avant qu'on sache dater ». Elles comptent dans le STOCK, jamais dans une SEMAINE. Backfiller
depuis `last_seen_at` (qui veut dire « vue », pas « consolidée ») jetterait au hasard des acquis
anciens dans la semaine courante et gonflerait le premier compteur montré à Massimo.

`student_weekly_goals` : l'engagement que l'enfant se donne (« cette semaine, je viens 3 jours »).
Table et non colonne sur `student_profiles`, parce qu'une colonne unique ne distingue pas « pas
encore choisi cette semaine » de « a choisi 3 » — or c'est l'absence de ligne qui déclenche
l'invitation du lundi. `target_days` sans `server_default` : la table est neuve, et défaulter
inventerait un engagement que l'enfant n'a pas pris.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, None] = "d0e1f2a3b4c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "skill_mastery", sa.Column("mastered_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("gaps", sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        "student_weekly_goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("target_days", sa.Integer(), nullable=False),
        # `server_default` aligné sur `TimestampMixin` (app/db/base.py) : sans lui, un INSERT
        # qui ne fournit pas ces colonnes échouerait sur la contrainte NOT NULL.
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "week_start", name="uq_weekly_goal_student_week"),
    )
    op.create_index(
        "ix_student_weekly_goals_student_id", "student_weekly_goals", ["student_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_student_weekly_goals_student_id", table_name="student_weekly_goals")
    op.drop_table("student_weekly_goals")
    op.drop_column("gaps", "resolved_at")
    op.drop_column("skill_mastery", "mastered_at")
