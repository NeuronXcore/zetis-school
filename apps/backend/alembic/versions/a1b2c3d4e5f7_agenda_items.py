"""agenda: table agenda_items (ADR-0025, Lot 1)

Revision ID: a1b2c3d4e5f7
Revises: e6f7a8b9c0d1
Create Date: 2026-07-29

Seule migration du chantier Agenda. Table NEUVE, aucune table existante touchée : l'agenda est
un objet à part (déclaratif, non probant) et non une extension de `missions`.

Deux choix qui se lisent mal sans l'ADR :

- `due_on` (et pas `due_date`) : sur `missions`, `due_date` porte la sémantique INVERSE —
  informationnelle, Papa-only, jamais exposée à l'élève (ADR-0018 §1). Les deux ne doivent pas
  se confondre en relecture.
- `chapter_id` nullable posé dès maintenant : c'est la clé de l'analyse du Lot 3 (§11), sans
  aucune logique ici. Une colonne nullable sur une table neuve coûte moins qu'une seconde
  migration dans trois semaines.

Aucune contrainte d'unicité : les doublons sont TOLÉRÉS et signalés à la saisie (§2d) — une
fusion erronée coûte plus cher qu'un doublon.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f7"
down_revision: Union[str, None] = "e6f7a8b9c0d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agenda_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=True),
        sa.Column("chapter_id", sa.Integer(), nullable=True),
        sa.Column("due_on", sa.Date(), nullable=False),
        sa.Column("label", sa.String(length=300), nullable=False),
        sa.Column("kind", sa.String(length=15), nullable=False),
        sa.Column("created_by", sa.String(length=10), nullable=False),
        sa.Column("edited_by_parent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("parent_note", sa.Text(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"]),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_agenda_items_student_due", "agenda_items", ["student_id", "due_on"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_agenda_items_student_due", table_name="agenda_items")
    op.drop_table("agenda_items")
