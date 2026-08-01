"""suivi de vue des mindmaps — solde la dette du no-op (adr-0016 §3, adr-0030 §4)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-08-01

`POST /api/student/mindmaps/{id}/seen` existe depuis la slice A de l'adr-0016 et répond 204
depuis le premier jour — mais `service.mark_seen` ne persistait RIEN : il se contentait de
vérifier que la carte était servable. La route mentait poliment, et le commentaire le disait
(« placeholder Slice A »). Mindmaps était de ce fait la seule famille de dérivés sans témoin de
nouveauté, asymétrie nommée et datée par l'adr-0030 §4.

Cette table la solde. Elle est le **calque exact de `fiche_views`** — unicité
`(student_id, mindmap_id)`, un seul horodatage, aucun compteur : on veut savoir si Massimo a
regardé la carte une fois, jamais combien de fois. `capsule_views` porte un `count` parce qu'un
visionnage répété de vidéo est une information pédagogique ; relire une mindmap ne l'est pas, et
un compteur qu'on n'affiche nulle part finit par être affiché quelque part.

**Aucun backfill**, et c'est la même doctrine que `c1d2e3f4a5b6` : les vues passées n'ont jamais
été enregistrées, donc elles n'existent pas. Toutes les mindmaps validées comptent comme
nouvelles au premier chargement — la lecture honnête, et le badge retombe au premier regard.
L'alternative (marquer tout comme vu pour éviter un badge « 9+ » le premier jour) effacerait
silencieusement du contenu que Massimo n'a effectivement jamais ouvert.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d2e3f4a5b6c7"
down_revision: Union[str, None] = "c1d2e3f4a5b6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "mindmap_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("mindmap_id", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["mindmap_id"], ["mindmaps.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "student_id", "mindmap_id", name="uq_mindmap_views_student_mindmap"
        ),
    )
    op.create_index("ix_mindmap_views_student_id", "mindmap_views", ["student_id"])
    op.create_index("ix_mindmap_views_mindmap_id", "mindmap_views", ["mindmap_id"])


def downgrade() -> None:
    op.drop_index("ix_mindmap_views_mindmap_id", table_name="mindmap_views")
    op.drop_index("ix_mindmap_views_student_id", table_name="mindmap_views")
    op.drop_table("mindmap_views")
