"""agenda_late_alert_on : le jour de la dernière alerte de retard (ADR-0025 Amdt 9 §D12)

🔴 **UNE date par élève, jamais une marque par item.** Le commentaire d'`agenda_last_seen_at`
interdit la seconde : jointe à `done_at`, elle fabriquerait « vu le 12, jamais fait », lisible côté
Papa — de la surveillance par la porte de service. Une date par élève suffit à répondre aux deux
questions du §D12 (« est-ce du NOUVEAU retard ? », « en ai-je déjà montré un aujourd'hui ? ») sans
rien enregistrer d'attribuable à une échéance précise.

⚠️ `Date` et non `DateTime` : la borne est un JOUR. Un horodatage inviterait à comparer des heures,
donc à reconstituer un rythme de visite.

Revision ID: a8d76627dc51
Revises: f9a0b1c2d3e4

⚠️ **L'identifiant a été refait DEUX FOIS, et c'est instructif.** J'ai d'abord inventé
`a1b2c3d4e5f9` — déjà pris par `skill_mastery_history_skill_index` — puis `c1d2e3f4a5b6`, déjà pris
par `agenda_last_seen_watermark`. Les identifiants « à la main » de ce dépôt sont tirés d'un
alphabet si étroit (`a1b2c3d4…`) que la collision est la règle, pas l'accident. Celui-ci est tiré
**au hasard et vérifié contre l'ensemble des révisions existantes**.

🔴 Le défaut n'aurait éclaté qu'au **démarrage de la production** (`alembic upgrade head` →
*« Revision … is present more than once »*), jamais dans la suite de tests normale, qui tourne sur
un SQLite créé par `metadata.create_all` et ne traverse pas alembic. Il a été attrapé par
`test_migrations_graph.py`, qui existe précisément pour ça.
"""

from alembic import op
import sqlalchemy as sa

revision = "a8d76627dc51"
down_revision = "f9a0b1c2d3e4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "student_profiles", sa.Column("agenda_late_alert_on", sa.Date(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "agenda_late_alert_on")
