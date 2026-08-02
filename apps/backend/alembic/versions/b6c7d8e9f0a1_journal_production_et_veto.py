"""journal de production, battement de coeur, lesson_views (adr-0034)

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-08-02

Une seule migration pour les quatre changements de schéma de l'ADR-0034 — ils n'ont de sens
qu'ensemble : un journal sans signal de consommation ne peut pas porter le veto, et un veto sans
journal n'a pas de surface.

1. `production_events` — le détail par pièce, que `runner.execute` calculait déjà et JETAIT
   (`results` partait au job RQ, dont personne ne lit le retour). La table retient ce qui était
   déjà produit ; aucun générateur n'est instrumenté.

2. `production_runs` gagne `started_at`, `heartbeat_at`, `current_skill_id`. ⚠️ `created_at`
   n'était PAS l'heure de démarrage : le job attend en file (concurrence 1, un seul GPU). Le
   battement rend les lots zombies détectables À LA LECTURE — aucun balayage, aucun ordonnanceur.

3. `spaced_review_cards.created_at` — seule table de contenu sans horodatage (`Lesson`, `Fiche`,
   `Mindmap`, `Quiz` portent tous `TimestampMixin`). `server_default=now()` vaut pour les lignes
   FUTURES ; les anciennes restent `NULL` — aucune rétro-attribution (doctrine §F.4).

4. `lesson_views` — quatrième table du patron `*_views`. ⚠️ Le §G.3 énumérait quatre familles
   consommables et oubliait le COURS, alors que c'est la classe (A1) dont le palier 3 justifie
   tout le chantier. Sans elle, le veto sur un cours ne sait pas s'il est encore rétractable.

Nullables partout sur les colonnes ajoutées : les lignes antérieures n'ont pas ces valeurs et
n'en auront jamais.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "b6c7d8e9f0a1"
down_revision: Union[str, None] = "a5b6c7d8e9f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1) Le journal par pièce.
    op.create_table(
        "production_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.Integer(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=True),
        sa.Column("piece", sa.String(length=10), nullable=True),
        sa.Column("outcome", sa.String(length=10), nullable=False),
        sa.Column("detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["production_runs.id"]),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_production_events_run_id", "production_events", ["run_id"])
    op.create_index(
        "ix_production_events_run_created", "production_events", ["run_id", "created_at"]
    )

    # 2) Le lot devient racontable.
    op.add_column(
        "production_runs", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "production_runs", sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("production_runs", sa.Column("current_skill_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_production_runs_current_skill",
        "production_runs",
        "skills",
        ["current_skill_id"],
        ["id"],
    )

    # 3) Les cartes deviennent datables.
    op.add_column(
        "spaced_review_cards",
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=True,
            server_default=sa.func.now(),
        ),
    )

    # 4) Le signal de consommation qui manquait — celui du COURS.
    op.create_table(
        "lesson_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "lesson_id", name="uq_lesson_views_student_lesson"),
    )
    op.create_index("ix_lesson_views_student_id", "lesson_views", ["student_id"])
    op.create_index("ix_lesson_views_lesson_id", "lesson_views", ["lesson_id"])


def downgrade() -> None:
    op.drop_index("ix_lesson_views_lesson_id", table_name="lesson_views")
    op.drop_index("ix_lesson_views_student_id", table_name="lesson_views")
    op.drop_table("lesson_views")

    op.drop_column("spaced_review_cards", "created_at")

    op.drop_constraint("fk_production_runs_current_skill", "production_runs", type_="foreignkey")
    op.drop_column("production_runs", "current_skill_id")
    op.drop_column("production_runs", "heartbeat_at")
    op.drop_column("production_runs", "started_at")

    op.drop_index("ix_production_events_run_created", table_name="production_events")
    op.drop_index("ix_production_events_run_id", table_name="production_events")
    op.drop_table("production_events")
