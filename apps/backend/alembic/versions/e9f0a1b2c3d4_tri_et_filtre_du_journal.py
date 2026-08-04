"""tri et filtre du Journal : la provenance du régime, et les index qui manquaient

Revision ID: e9f0a1b2c3d4
Revises: d8e9f0a1b2c3
Create Date: 2026-08-04

Addendum ADR-0034 « le Journal se trie et se filtre, et pour ça son passé cesse de bouger ».

## `zetis_mode_source` — un champ qui existait déjà, sauf en base

`JournalRun.zetis_mode_source` voyage **depuis l'addendum précédent** dans le contrat d'API et dans
`packages/types`. Il était **calculé à chaque lecture** : capture si le lot portait ses paliers,
sinon déduit de ses actes. Cette migration ne l'invente pas — elle lui donne une colonne, pour que
la réponse cesse de dépendre d'artefacts que le veto peut retirer.

⚠️ **La colonne naît VIDE, et cette migration n'importe aucune logique métier.** Une migration qui
appellerait `deduire_regime` ferait dépendre le schéma du code, et se rejouerait différemment selon
la version déployée au moment du `upgrade`. C'est `scripts/backfill_zetis_mode.py` qui remplit, une
fois, avec un `--dry-run` par défaut.

`NULL` = ce que rien ne prouve. **Aucune rétro-attribution** (doctrine §F.4).

## Les index — mesurés absents, pas supposés

`pg_indexes` sur la base de dev ne rendait **aucune** ligne contenant `production_run_id`, dans
aucune des cinq tables produites. `_pieces_of_run` interroge ces cinq tables **par lot** pour
l'affichage, et le script de reprise les balaiera en entier.

`production_runs.created_at` n'en avait pas non plus (la table ne portait que `pkey`, `student_id`
et `status`) — or c'est la clé de tri par défaut du Journal, celle qui commande toute la pagination.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "e9f0a1b2c3d4"
down_revision: Union[str, None] = "d8e9f0a1b2c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Les cinq familles produites par un lot. La liste est celle des tables qui portent réellement la
# colonne, vérifiée dans `information_schema` — pas celle qu'on croit de mémoire.
TABLES_PRODUITES = ("lessons", "fiches", "mindmaps", "quizzes", "spaced_review_cards")


def upgrade() -> None:
    op.add_column(
        "production_runs", sa.Column("zetis_mode_source", sa.String(length=10), nullable=True)
    )
    for table in TABLES_PRODUITES:
        op.create_index(
            f"ix_{table}_production_run_id", table, ["production_run_id"], unique=False
        )
    op.create_index(
        "ix_production_runs_created_at", "production_runs", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_production_runs_created_at", table_name="production_runs")
    for table in reversed(TABLES_PRODUITES):
        op.drop_index(f"ix_{table}_production_run_id", table_name=table)
    op.drop_column("production_runs", "zetis_mode_source")
