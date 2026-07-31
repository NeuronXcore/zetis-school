"""historique des bascules de maîtrise (chantier « Dashboard Papa v2 », adr-0028 §3 ter)

Revision ID: a9b8c7d6e5f4
Revises: c3d4e5f6a1b2
Create Date: 2026-07-31

`skill_mastery` ne garde que l'état COURANT. Une notion qui redescend de `mastered` à `learning`
écrase son statut sans laisser de trace, et `mastered_at` (migration `f1a2b3c4d5e6`) ne date que
l'entrée dans `mastered`. Conséquence mesurée au read-before-code de l'adr-0028 : la courbe des
notions FRAGILES de la carte « Évolution de la mémoire » n'était tout simplement pas
reconstructible — alors que c'est le signal de régression qu'un parent a besoin de voir tôt.

Deux alternatives ont été écartées (adr-0028 §3 ter) : approximer la fragilité par les échecs de
quiz de la fenêtre mesure AUTRE CHOSE que le statut de maîtrise et contredirait les barres
empilées de la carte voisine ; n'afficher que deux courbes supprimerait précisément le signal
qu'on cherche.

Écrit par `progress/mastery.py::record_mastery_transition` et par lui seul — le module qui tenait
déjà l'invariant `mastered_at IS NOT NULL ⟺ status == "mastered"`. Une ligne par CHANGEMENT de
statut, jamais par passage : `quizzes/scoring.py` réévalue la maîtrise à chaque quiz de fin de
cours, et sans ce garde-fou la table enflerait d'un doublon par quiz.

Pas de FK vers `skill_mastery.id` : la ligne de maîtrise est souvent créée dans la même
transaction et n'a pas encore d'`id` au moment de la bascule ; une FK imposerait un `flush()` à
chaque appel. `(student_id, skill_id)` suffit et porte déjà l'unicité côté `skill_mastery`.

**Backfill partiel et assumé.** On reconstruit les seules entrées dans `mastered` déductibles de
`skill_mastery.mastered_at`, pour que la courbe verte ne reparte pas de zéro le jour de la mise en
service. Les lignes `mastered` héritées SANS date restent hors historique (on ne sait pas quand),
et les régressions passées sont définitivement perdues : la courbe ambre démarre aujourd'hui
plutôt que de raconter une histoire inventée. Même doctrine que `f1a2b3c4d5e6`, qui refusait de
backfiller depuis `last_seen_at`.

Le backfill est **idempotent** : il n'insère que ce qui n'a pas déjà une ligne `mastered` au même
instant, de sorte qu'un `downgrade` puis `upgrade` ne double rien.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a9b8c7d6e5f4"
down_revision: Union[str, None] = "c3d4e5f6a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "skill_mastery_history",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("mastery_score", sa.Float(), nullable=False),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_skill_mastery_history_student_changed",
        "skill_mastery_history",
        ["student_id", "changed_at"],
    )

    # Backfill des seules bascules datables. `COALESCE(mastery_score, 0)` parce que la colonne
    # porte un défaut applicatif, pas un `server_default` : d'anciennes lignes peuvent être à NULL.
    op.execute(
        """
        INSERT INTO skill_mastery_history (student_id, skill_id, status, mastery_score, changed_at)
        SELECT sm.student_id, sm.skill_id, 'mastered', COALESCE(sm.mastery_score, 0), sm.mastered_at
        FROM skill_mastery AS sm
        WHERE sm.mastered_at IS NOT NULL
          AND sm.status = 'mastered'
          AND NOT EXISTS (
            SELECT 1 FROM skill_mastery_history AS h
            WHERE h.student_id = sm.student_id
              AND h.skill_id = sm.skill_id
              AND h.status = 'mastered'
              AND h.changed_at = sm.mastered_at
          )
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_skill_mastery_history_student_changed", table_name="skill_mastery_history"
    )
    op.drop_table("skill_mastery_history")
