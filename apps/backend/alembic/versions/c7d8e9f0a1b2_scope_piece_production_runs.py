"""scope PIECE sur un lot de production (adr-0036 §2)

Revision ID: c7d8e9f0a1b2
Revises: b6c7d8e9f0a1
Create Date: 2026-08-03

Un lot pouvait produire UN CHAPITRE, et rien d'autre. Une demande de Massimo porte une NOTION et
UN type de contenu : la brancher sans scope de pièce ferait produire ~30 objets parce qu'une fiche
manque. D'où deux colonnes, et une contrainte qui interdit l'entre-deux.

⚠️ **Le scope n'est pas dérivé de `content_request_id`**, bien que ce soit possible. L'ADR-0031 §4
a tranché l'inverse : « ses colonnes disent POURQUOI on a produit, jamais SUR QUOI ». Un lot ne
doit pas avoir besoin de son déclencheur pour savoir ce qu'il a à faire — sans quoi un lot manuel
sur une pièce (le bouton « Produire » de la page Demandes) n'aurait aucun scope du tout.

⚠️ **`skill_id` n'est pas réutilisé** : c'est déjà la référence de déclencheur d'`evidence` et
`derived`. Une colonne à deux sens est l'ambiguïté exacte qui a fait rejeter `notion_requests`.

`ck_production_runs_exactly_one_scope` s'applique aux lignes EXISTANTES : elles portent toutes un
`chapter_id` (c'était le seul scope possible), donc elles la satisfont déjà. Si la migration échoue
ici, c'est qu'un lot sans chapitre existe — et c'est une information, pas un incident à contourner.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "b6c7d8e9f0a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "production_runs", sa.Column("scope_skill_id", sa.Integer(), nullable=True)
    )
    op.add_column("production_runs", sa.Column("scope_kind", sa.String(length=10), nullable=True))
    op.create_foreign_key(
        "fk_production_runs_scope_skill_id",
        "production_runs",
        "skills",
        ["scope_skill_id"],
        ["id"],
    )
    op.create_check_constraint(
        "ck_production_runs_exactly_one_scope",
        "production_runs",
        "(chapter_id IS NOT NULL AND scope_skill_id IS NULL AND scope_kind IS NULL) "
        "OR (chapter_id IS NULL AND scope_skill_id IS NOT NULL AND scope_kind IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_production_runs_exactly_one_scope", "production_runs", type_="check"
    )
    op.drop_constraint("fk_production_runs_scope_skill_id", "production_runs", type_="foreignkey")
    op.drop_column("production_runs", "scope_kind")
    op.drop_column("production_runs", "scope_skill_id")
