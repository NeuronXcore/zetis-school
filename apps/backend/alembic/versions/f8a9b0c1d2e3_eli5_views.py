"""notions ouvertes en ELI5 — la trace de vue que l'adr-0030 §2 exigeait

Revision ID: f8a9b0c1d2e3
Revises: e5f6a7b8c9d4
Create Date: 2026-08-15

L'`adr-0030 §2` refusait un badge de navigation à ELI5 parce que son seul compteur disponible,
le `new_count` de `student_notions_summary`, est un critère de RÉCENCE (fenêtre de 7 jours sur
`Lesson.created_at`) : il décroît par le temps, pas par le regard. La règle n'est pas contournée
ici — elle est **payée**. Cette table est la trace de vue qui manquait
(`adr-0030-temoins-nouveaute-navigation.md` (Amendement 3)).

Calque de `mindmap_views` : unicité `(student_id, skill_id)`, un horodatage, **aucun compteur
d'ouvertures**. Combien de fois Massimo a redemandé la même explication n'est pas une information
de navigation, et un compteur qu'on n'affiche nulle part finit par être affiché quelque part.

🔴 **POINT ZÉRO — et il faut regarder en face le précédent qu'il contredit en apparence.**

La migration `d2e3f4a5b6c7` (mindmap_views) écrit, à propos de son absence de backfill :

    « L'alternative (marquer tout comme vu pour éviter un badge "9+" le premier jour) effacerait
      silencieusement du contenu que Massimo n'a effectivement jamais ouvert. »

Cette migration-ci fait l'inverse, **et ce n'est pas la même opération** :

- `d2e3f4a5b6c7` refusait de prétendre que le PASSÉ avait été lu — de fabriquer une donnée
  fausse sur ce qui s'est passé. On ne prétend rien ici non plus : on **pose l'origine du
  témoin**. Un témoin de nouveauté né aujourd'hui n'a, par définition, aucune nouveauté à
  annoncer. Ce qui existe avant sa naissance n'est pas de la nouveauté, c'est de l'arriéré — et
  l'arriéré est précisément ce que l'`adr-0030 §1` interdit d'afficher.
- Les ordres de grandeur n'ont rien à voir : 14 mindmaps le 2026-08-01, **267 notions** ici.
  Sans point zéro, le badge afficherait 236 — donc `9+` figé pendant des mois. Un témoin qui ne
  bouge jamais n'informe de rien, et l'`adr-0030 §6` interdit de relever le plafond en
  compensation (borne B3).

**Conséquence assumée, écrite pour ne pas être découverte plus tard** : Massimo ne verra jamais de
badge sur les notions déjà en base au jour de la pose. Le témoin ne s'allumera qu'à la prochaine
leçon validée par Papa.

`eli5_views` est **neuve et lue par le seul témoin** — aucun autre calcul n'en dépend, donc ce
point zéro ne fausse rien. C'est exactement ce qui n'est PAS vrai pour Matières, dont la trace
`lesson_views` est lue par la fiabilité du diagnostic et le Cahier de bord : ce témoin-là n'a
volontairement aucun point zéro (`adr-0030-temoins-nouveaute-navigation` (Amendement 2), borne 6).
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f8a9b0c1d2e3"
down_revision: Union[str, None] = "e5f6a7b8c9d4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


#: Population ELI5-éligible — miroir SQL de `curriculum.service.eligible_notion_ids`.
#: Le miroir est assumé (une migration ne doit pas dépendre du code applicatif, qui bougera) ; il
#: n'est joué qu'UNE fois, à la pose, et ne se re-synchronise jamais.
_NOTIONS_ELIGIBLES = """
    SELECT DISTINCT ls.skill_id AS skill_id
      FROM lesson_skills ls
      JOIN lessons l ON l.id = ls.lesson_id
      JOIN chapters c ON c.id = l.chapter_id
      JOIN school_year_subjects sys ON sys.id = c.school_year_subject_id
      JOIN school_years sy ON sy.id = sys.school_year_id
     WHERE sy.status = 'active'
       AND c.validation_status = 'validated'
       AND l.status = 'validated'
"""


def upgrade() -> None:
    op.create_table(
        "eli5_views",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("student_id", sa.Integer(), nullable=False),
        sa.Column("skill_id", sa.Integer(), nullable=False),
        sa.Column("seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["student_id"], ["student_profiles.id"]),
        sa.ForeignKeyConstraint(["skill_id"], ["skills.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("student_id", "skill_id", name="uq_eli5_views_student_skill"),
    )
    op.create_index("ix_eli5_views_student_id", "eli5_views", ["student_id"])
    op.create_index("ix_eli5_views_skill_id", "eli5_views", ["skill_id"])

    # Point zéro : tout ce qui est explicable AUJOURD'HUI est marqué vu. Le témoin démarre à 0.
    op.execute(
        f"""
        INSERT INTO eli5_views (student_id, skill_id, seen_at)
        SELECT sp.id, n.skill_id, now()
          FROM student_profiles sp
          CROSS JOIN ({_NOTIONS_ELIGIBLES}) n
        ON CONFLICT DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index("ix_eli5_views_skill_id", table_name="eli5_views")
    op.drop_index("ix_eli5_views_student_id", table_name="eli5_views")
    op.drop_table("eli5_views")
