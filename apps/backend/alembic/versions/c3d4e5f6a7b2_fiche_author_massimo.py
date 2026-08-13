"""fiche_author_massimo — un seul objet, deux auteurs

Revision ID: c3d4e5f6a7b2
Revises: b2c3d4e5f9a1
Create Date: 2026-08-13

Addendum ADR-0015 §1 — la fiche que Massimo fabrique lui-même. **Pas de table parallèle** : la
comparaison champ à champ entre sa fiche et celle de ZETIS (§6) est tout l'intérêt du dispositif,
et elle serait coûteuse sur deux tables. On ajoute un **second axe** à `fiches`.

⚠️ **`author` n'est PAS une valeur de `source`.** `source` (`generated|manual`) dit COMMENT la
pièce a été produite ; `author` dit À QUI elle est. Mélanger les deux donnerait une fiche
personnelle partiellement assistée sans valeur juste, et tout lecteur existant de `source`
hériterait d'un sens qu'il n'attend pas.

⚠️ **`student_profiles`, pas `students`** — le bloc de code de l'ADR §1 nomme une table qui
n'existe pas dans ce dépôt. Relevé au read-before-code du 2026-08-13 ; c'est `student_profiles`
partout ailleurs (~20 FK).

⚠️ **Aucune migration de DONNÉES, et aucun Enum SQL à faire évoluer.** `server_default` donne
`zetis`/`1` aux lignes existantes, et `validation_status` est un `String(20)` avec un commentaire
— la 4ᵉ valeur `personal` ne coûte donc rien ici (l'ADR la comptait dans ses coûts). Le champ
`FicheSpec` reste littéralement inchangé : un `spec_json` existant valide sans être touché.

⚠️ **`server_default` conservé, pas retiré après coup** : la colonne est lue par des requêtes de
production (`equipment`, `coverage`, `veto`) où un `NULL` accidentel ferait silencieusement sortir
une fiche ZETIS de sa population. Le défaut en base est la ceinture de ce prédicat.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b2"
down_revision: Union[str, None] = "b2c3d4e5f9a1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "fiches",
        sa.Column("author", sa.String(length=10), nullable=False, server_default="zetis"),
    )
    # NULL = fiche ZETIS (la table n'était pas nominative : une fiche appartient à une leçon).
    op.add_column("fiches", sa.Column("student_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_fiches_student_id", "fiches", "student_profiles", ["student_id"], ["id"]
    )
    # Versions dans le temps (§7) : `lesson_id` est déjà indexé NON unique et
    # `list_fiches_for_lesson` rend déjà une liste — plusieurs fiches par leçon sont supportées
    # depuis l'origine. Le besoin se réduisait à un numéro et à un ordre.
    op.add_column(
        "fiches", sa.Column("version", sa.Integer(), nullable=False, server_default="1")
    )
    # Une fiche personnelle se lit par (élève, leçon) : c'est la requête de reprise (§1 bis).
    op.create_index("ix_fiches_student_lesson", "fiches", ["student_id", "lesson_id"])


def downgrade() -> None:
    op.drop_index("ix_fiches_student_lesson", table_name="fiches")
    op.drop_column("fiches", "version")
    op.drop_constraint("fk_fiches_student_id", "fiches", type_="foreignkey")
    op.drop_column("fiches", "student_id")
    op.drop_column("fiches", "author")
