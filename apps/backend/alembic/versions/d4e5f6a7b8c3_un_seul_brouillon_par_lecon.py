"""un_seul_brouillon_par_lecon — l'idempotence cesse d'être une intention

Revision ID: d4e5f6a7b8c3
Revises: c3d4e5f6a7b2
Create Date: 2026-08-13

`open_or_get_draft` se voulait idempotent : un brouillon par (élève, leçon). Il ne l'était pas.

**Constaté en base le 2026-08-13 : 4 brouillons pour 2 leçons.** StrictMode monte deux fois en
dev — et un double-tap sur téléphone fait exactement pareil — donc deux `POST /draft` partaient
ensemble ; aucune des deux transactions ne voyait l'autre, chacune créait le sien. Pire, comme
`db.scalar` sans `ORDER BY` rend une ligne **arbitraire**, l'atelier lisait le brouillon rempli
pendant que la tuile de l'écran 2 lisait le vide : Massimo aurait vu son travail disparaître de
sa liste alors que le serveur le gardait.

Un ordre stable (posé côté code le même jour) fait que **tous les lecteurs voient le même**. Il
n'empêche pas la course. Seul un index unique le fait.

⚠️ **Index PARTIEL, et il ne peut pas en être autrement** : `student_id` est renseigné sur toutes
les fiches personnelles — brouillons ET fiches finies, dont il peut exister **plusieurs versions
par leçon** (§7). Un index unique sans condition interdirait les versions, c'est-à-dire la
décision fondatrice du §7. La condition porte donc sur le seul état dont l'unicité est vraie :
`personal_draft`.

⚠️ **Le dédoublonnage préalable SUPPRIME des lignes.** Il est nécessaire — une base portant déjà
un doublon refuserait l'index. La règle retenue est **exactement celle que le code applique en
lecture** : on garde le `MIN(id)`, celui que tous les lecteurs désignent déjà. On ne détruit donc
aucun travail visible ; on retire les jumeaux vides que la course a fabriqués derrière.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c3"
down_revision: Union[str, None] = "c3d4e5f6a7b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_INDEX = "uq_fiches_brouillon_par_lecon"


def upgrade() -> None:
    # 1. Dédoublonner AVANT de contraindre — sinon la création de l'index échoue sur toute base
    #    qui a déjà vu la course. On garde le plus petit id : celui que la lecture désigne.
    op.execute(
        sa.text(
            """
            DELETE FROM fiches f
             WHERE f.author = 'massimo'
               AND f.validation_status = 'personal_draft'
               AND f.id > (
                   SELECT MIN(g.id) FROM fiches g
                    WHERE g.author = 'massimo'
                      AND g.validation_status = 'personal_draft'
                      AND g.lesson_id = f.lesson_id
                      AND g.student_id IS NOT DISTINCT FROM f.student_id
               )
            """
        )
    )
    # 2. Un seul brouillon vivant par (élève, leçon). Les fiches FINIES restent libres d'exister
    #    en plusieurs versions — c'est le §7, et l'index ne doit surtout pas l'interdire.
    op.create_index(
        _INDEX,
        "fiches",
        ["student_id", "lesson_id"],
        unique=True,
        postgresql_where=sa.text("validation_status = 'personal_draft'"),
        sqlite_where=sa.text("validation_status = 'personal_draft'"),
    )


def downgrade() -> None:
    op.drop_index(_INDEX, table_name="fiches")
