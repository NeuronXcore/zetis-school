"""cle_de_carte_a_trois_colonnes — la base tranche ce dont le code ne s'accordait pas

Revision ID: e5f6a7b8c9d4
Revises: d4e5f6a7b8c3
Create Date: 2026-08-13

Addendum ADR-0015 §13. Le module `memory` ne s'accordait pas avec lui-même sur la clé de cette
table : `generation.py` produit jusqu'à **trois** cartes par notion, une par `card_type`, et
commente explicitement « clé (student, skill, card_type) unique » ; `schedule_review` en cherchait
**une** par `(student_id, skill_id)`, sans type et sans `ORDER BY`, puis écrasait recto, verso,
intervalle, échéance et statut.

⚠️ **Le défaut était LATENT, pas manifeste** — et c'est écrit ici parce que ça change ce que cette
migration prétend faire. Mesuré sur la base de dev le 2026-08-13 :

| Mesure (317 cartes) | Résultat |
|---|---|
| notions portant plusieurs cartes | **106** |
| parmi elles, `MIN(id)` = la carte `definition` | **106 / 106** |
| notions sans carte `definition` | **0** |
| doublons sur `(student_id, skill_id, card_type)` | **0** |

`generation.py` émet `definition` en premier, elle porte donc le plus petit `id`, et le balayage
séquentiel de Postgres la rendait en premier : l'écrasement tombait sur la bonne carte **par
coïncidence d'ordre physique**. Un `UPDATE` qui déplace une ligne, un `VACUUM` ou un autre plan
suffit à défaire la coïncidence.

Cette migration ne répare donc **pas une panne** : elle **retire une dépendance accidentelle**, et
elle est la condition du pont fiche → SRS (une carte `definition_perso` ne doit jamais pouvoir
écraser la carte `definition` de ZETIS, ni l'inverse).

⚠️ **Le dédoublonnage ci-dessous est un NO-OP MESURÉ en dev** (zéro doublon sur la clé). Il est
conservé pour la **prod, non mesurée** — mais il ne faut pas lui prêter un travail qu'il ne fait
pas. Sa règle est celle que la lecture applique : on garde le `MIN(id)`.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5f6a7b8c9d4"
down_revision: Union[str, None] = "d4e5f6a7b8c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CONTRAINTE = "uq_srs_cards_student_skill_type"


def upgrade() -> None:
    # 1. Dédoublonner AVANT de contraindre — no-op mesuré en dev, filet pour la prod.
    #    On garde le plus petit id : celui que la lecture désignait déjà.
    op.execute(
        sa.text(
            """
            DELETE FROM spaced_review_cards c
             WHERE c.id > (
                 SELECT MIN(d.id) FROM spaced_review_cards d
                  WHERE d.student_id = c.student_id
                    AND d.skill_id   = c.skill_id
                    AND d.card_type  = c.card_type
             )
            """
        )
    )
    # 2. La clé que `generation.py` croyait déjà avoir.
    op.create_unique_constraint(
        _CONTRAINTE, "spaced_review_cards", ["student_id", "skill_id", "card_type"]
    )


def downgrade() -> None:
    op.drop_constraint(_CONTRAINTE, "spaced_review_cards", type_="unique")
