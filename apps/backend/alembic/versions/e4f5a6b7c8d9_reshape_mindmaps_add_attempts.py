"""reshape mindmaps (leçon-centré) + add mindmap_attempts (ADR-0016)

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-07-05

La table `mindmaps` du schéma initial était un vestige notion-centré (subject_id/skill_id/
student_id/title/mode/status) qu'aucun code n'utilisait. Slice A des mindmaps (ADR-0016) la
réaligne sur le patron **leçon-centré** des fiches (dérivé du cours canonique validé) :
`lesson_id`, `validation_status`, `source`, `program_version`. `mindmap_attempts` porte les
tentatives de reconstruction (score + détail juste/faux, calculés côté serveur).

Reshape destructif assumé : la table était vide de tout usage réel (aucun service n'y écrivait).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Réaligner `mindmaps` sur le patron leçon-centré (table vestige, vide → drop + recreate).
    op.drop_table("mindmaps")
    op.create_table(
        "mindmaps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lesson_id", sa.Integer(), nullable=False),
        sa.Column("mindmap_json", sa.JSON(), nullable=True),
        sa.Column("validation_status", sa.String(length=20), nullable=False),
        sa.Column("source", sa.String(length=20), nullable=False),
        sa.Column("program_version", sa.String(length=20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mindmaps_lesson_id", "mindmaps", ["lesson_id"])

    # 2. Tentatives de reconstruction (mode student_reconstruction) — score + détail serveur.
    op.create_table(
        "mindmap_attempts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("mindmap_id", sa.Integer(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("details_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["mindmap_id"], ["mindmaps.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_mindmap_attempts_student_id", "mindmap_attempts", ["student_id"])
    op.create_index("ix_mindmap_attempts_mindmap_id", "mindmap_attempts", ["mindmap_id"])


def downgrade() -> None:
    op.drop_index("ix_mindmap_attempts_mindmap_id", table_name="mindmap_attempts")
    op.drop_index("ix_mindmap_attempts_student_id", table_name="mindmap_attempts")
    op.drop_table("mindmap_attempts")

    op.drop_index("ix_mindmaps_lesson_id", table_name="mindmaps")
    op.drop_table("mindmaps")
    # Restaure la forme vestige notion-centrée (schéma initial 96c52d4ba103).
    op.create_table(
        "mindmaps",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=True),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("mindmap_json", sa.JSON(), nullable=True),
        sa.Column("mode", sa.String(length=25), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
