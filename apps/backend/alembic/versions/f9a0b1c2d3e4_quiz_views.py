"""quiz ouverts — la trace qui permet un témoin qui ne compte PAS du travail

Revision ID: f9a0b1c2d3e4
Revises: f8a9b0c1d2e3
Create Date: 2026-08-15

⚠️ **Chaînée sur `f8a9b0c1d2e3`, pas posée en parallèle sur `e5f6a7b8c9d4`.** Deux migrations
sœurs sur la même tête donnent deux têtes Alembic, silencieusement, et l'entrypoint de production
fait `upgrade head` au démarrage.

Table de vue (`adr-0030-addendum-temoin-quiz.md`), calque de `mindmap_views`.

🔴 **« Ouvert », jamais « passé ».** Le témoin qui en vit meurt de l'OUVERTURE. La forme
INTERDITE — compter les quiz non passés — était gratuite : `QuizAttempt.completed_at` existe
depuis toujours, il n'y avait aucune table à créer. Elle a été écartée parce qu'elle serait une
**seconde** exception à « NOUVEAU jamais DÛ » (`adr-0030 §1`), sur l'entrée la plus proche de
l'évaluation ; l'exception du Diagnostic est bornée par « une seule entrée », et l'étendre
reviendrait à dire que la règle n'en est plus une. La forme légale coûte cette table ; elle est
payée. **L'arbitrage est de valeurs, pas de coût.**

Conséquence assumée de la borne 1 : ouvrir un quiz puis l'abandonner sans répondre éteint quand
même le témoin. C'est le prix de ne pas compter du travail.

🔴 **POINT ZÉRO** — même raisonnement que `f8a9b0c1d2e3` (y lire la confrontation détaillée avec
le « aucun backfill » de `d2e3f4a5b6c7`) : tous les quiz jouables au jour de la pose sont marqués
vus, le témoin démarre à **0** et ne compte que ce qui est produit ensuite. Sans lui, le badge
afficherait 20 — donc `9+` — pour du contenu déjà là depuis des mois.

⚠️ **Le point zéro se fait sur l'EXISTENCE du quiz, jamais sur `completed_at`.** Il aurait été
tentant de marquer vus « les quiz déjà tentés » : ce serait faire entrer la notion de travail dans
la table par la porte de la migration, et le compteur en hériterait sans qu'aucun test ne le voie.

`quiz_views` est neuve et lue par le seul témoin — ce point zéro ne fausse aucun autre calcul.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9a0b1c2d3e4"
down_revision: Union[str, None] = "f8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: Miroir SQL de `quizzes.service.servable_quiz_ids`, joué UNE fois à la pose. Le miroir est
#: assumé : une migration ne doit pas dépendre du code applicatif, qui bougera.
_QUIZ_JOUABLES = """
    SELECT q.id AS quiz_id
      FROM quizzes q
      JOIN lessons l ON l.id = q.lesson_id
      JOIN chapters c ON c.id = l.chapter_id
      JOIN school_year_subjects sys ON sys.id = c.school_year_subject_id
      JOIN school_years sy ON sy.id = sys.school_year_id
     WHERE sy.status = 'active'
       AND c.validation_status = 'validated'
       AND l.status = 'validated'
       AND q.quiz_type = 'mission'
       AND q.status <> 'archived'
       AND EXISTS (
             SELECT 1 FROM quiz_questions qq
              WHERE qq.quiz_id = q.id AND qq.status = 'active'
           )
"""


def upgrade() -> None:
    op.create_table(
        "quiz_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("quiz_id", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["quiz_id"], ["quizzes.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "quiz_id", name="uq_quiz_views_student_quiz"),
    )
    op.create_index("ix_quiz_views_student_id", "quiz_views", ["student_id"])
    op.create_index("ix_quiz_views_quiz_id", "quiz_views", ["quiz_id"])

    # Point zéro : tout ce qui est jouable AUJOURD'HUI est marqué vu. Le témoin démarre à 0.
    op.execute(
        f"""
        INSERT INTO quiz_views (student_id, quiz_id, seen_at)
        SELECT sp.id, q.quiz_id, now()
          FROM student_profiles sp
          CROSS JOIN ({_QUIZ_JOUABLES}) q
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_quiz_views_quiz_id", table_name="quiz_views")
    op.drop_index("ix_quiz_views_student_id", table_name="quiz_views")
    op.drop_table("quiz_views")
