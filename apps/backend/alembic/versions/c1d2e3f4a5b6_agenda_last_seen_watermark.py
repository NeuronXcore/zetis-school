"""high-water mark du témoin de nouveauté de l'agenda (addendum adr-0025 §12)

Revision ID: c1d2e3f4a5b6
Revises: a9b8c7d6e5f4
Create Date: 2026-08-01

Le badge « nouveauté » de l'entrée Agenda (adr-0030) compte ce qui est ARRIVÉ depuis le dernier
regard de Massimo. Il lui faut donc une trace de regard, et la forme de cette trace est la vraie
décision — pas le badge.

**Un horodatage par ÉLÈVE, jamais un `seen_at` par item.** Une colonne de vue sur `agenda_items`
serait la modélisation spontanée ; jointe à `done_at`, elle fabriquerait la donnée persistée
« vu le 12, jamais fait ». Papa ne verrait pas cette colonne, mais il verrait ce qu'elle permet de
déduire : exactement la surveillance par la porte de service que l'adr-0025 §2 condamne, et un
objet PIRE que le compteur d'arriéré qu'on cherchait à éviter. La granularité est la protection,
et c'est pour ça qu'elle vit ici et pas sur `agenda_items`.

`student_profiles` plutôt que `app_settings` : cette dernière est une table clé/valeur GLOBALE
(PK `key`), sans scope élève. L'utiliser demanderait de fabriquer une convention de clé
`agenda_last_seen_at:{student_id}` et de sérialiser une date en texte, pour un invariant
(« un enregistrement par élève ») que la colonne tient par construction.

**Nullable, sans `server_default`, et AUCUN backfill.** Poser `now()` à la migration marquerait
comme « déjà vus » tous les items que Papa a saisis avant que le témoin n'existe — un effacement
silencieux, invisible en revue. NULL veut dire « Massimo n'a encore rien regardé depuis que ce
témoin existe », donc tout compte comme nouveau : c'est la lecture honnête, et le badge retombe au
premier regard. Même doctrine de non-backfill que `f1a2b3c4d5e6` (qui refusait de reconstruire
depuis `last_seen_at`) et que la partie perdue de `a9b8c7d6e5f4`.

Écrit par `agenda/service.py::mark_agenda_seen` et par lui seul, avec `func.now()` — l'horloge SQL
des deux côtés de la comparaison `agenda_items.created_at > agenda_last_seen_at`, `created_at`
venant lui-même d'un `server_default=func.now()`. Un `datetime.now(timezone.utc)` Python se
sérialise sur SQLite avec un suffixe `+00:00` qui trie APRÈS le naïf du server_default à instant
égal : deux horloges donneraient un compteur faux à la seconde près.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c1d2e3f4a5b6"
down_revision: Union[str, None] = "a9b8c7d6e5f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "student_profiles",
        sa.Column("agenda_last_seen_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("student_profiles", "agenda_last_seen_at")
