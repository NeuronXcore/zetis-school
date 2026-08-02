"""annonce des demandes traitées — ferme la boucle vers Massimo (addendum adr-0026)

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-08-02

`content_requests` et `notion_requests` sont les deux seuls endroits où Massimo parle en son nom
propre, et les deux seules boucles asynchrones sans retour : ZETIS dit « je le note pour Papa »,
et rien ne revient jamais. Ces deux colonnes portent l'extinction de l'annonce — « dite une fois,
éteinte » — et rien d'autre.

`NULL` = jamais annoncé. **Aucun backfill**, même doctrine que `d2e3f4a5b6c7` : les demandes déjà
triées `done`/`added` avant cette révision seront annoncées à la prochaine ouverture du chat **si
et seulement si leur contenu est réellement disponible** (le gate est `resolve_panoply`, jamais le
statut). La dette d'honnêteté se solde donc d'elle-même, sans écriture rétroactive.

L'alternative — tamponner tout l'existant pour éviter une annonce de rattrapage — effacerait
silencieusement des promesses réellement faites à Massimo et jamais tenues. C'est exactement ce
que cet addendum existe pour réparer.

Pas d'index : les deux colonnes ne sont lues qu'en `IS NULL` sur des files bornées (une poignée
de lignes par élève), toujours en compagnie d'un filtre de statut. Un index ici coûterait des
écritures pour un gain nul.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e3f4a5b6c7d8"
down_revision: Union[str, None] = "d2e3f4a5b6c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "content_requests",
        sa.Column("announced_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "notion_requests",
        sa.Column("announced_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notion_requests", "announced_at")
    op.drop_column("content_requests", "announced_at")
