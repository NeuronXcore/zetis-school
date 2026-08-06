"""skill_mastery_history : index (student_id, skill_id, changed_at DESC)

L'index existant `ix_skill_mastery_history_student_changed` porte sur `(student_id, changed_at)`.
Il sert le BALAYAGE DE FENÊTRE du dashboard (« toutes les bascules des 90 derniers jours »), pas
« la DERNIÈRE bascule de CHAQUE notion » — le `group_by(skill_id)` de l'index des notions
(adr-0040 §12), qui devrait sinon parcourir tout l'historique de l'élève.

Aucune colonne, aucun backfill.

Revision ID: a1b2c3d4e5f9
Revises: f7a8b9c0d1e2
"""

from alembic import op

revision = "a1b2c3d4e5f9"
down_revision = "f7a8b9c0d1e2"
branch_labels = None
depends_on = None

INDEX_NAME = "ix_skill_mastery_history_student_skill_changed"


def upgrade() -> None:
    # `changed_at DESC` : la requête ne veut que la ligne la plus récente par notion. SQLite ignore
    # le sens et scanne l'index dans l'ordre utile de toute façon — la précision sert Postgres,
    # qui est la cible réelle.
    op.create_index(
        INDEX_NAME,
        "skill_mastery_history",
        ["student_id", "skill_id", "changed_at"],
        unique=False,
        postgresql_ops={"changed_at": "DESC"},
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="skill_mastery_history")
