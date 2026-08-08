"""le diagnostic entre sous le gate de relecture (ADR-0043 Décision 1)

Une colonne, additive, **avec backfill — et c'est le point délicat de cette migration.**

`quizzes` était la seule table de contenu sans `validation_status` : l'ADR-0014 Décision 2 la
servait sans gate, par doctrine. L'ADR-0043 constate que cette exemption valait pour les quiz
« dérivés d'un substrat déjà validé » et que le diagnostic n'en dérive d'aucun — il rejoint donc le
contenu soumis au gate. Les quiz de mission et de fin de cours, eux, restent exemptés.

🔴 **Toutes les lignes existantes passent à `validated`, y compris les diagnostics déjà générés.**
Le défaut de la colonne est `pending` ; l'appliquer rétroactivement fabriquerait une file de
relecture inventée sur du contenu **déjà servi à Massimo**. Papa se réveillerait avec des dizaines
de pièces « en attente » qu'il n'a jamais eu l'occasion de refuser. On acte l'état de fait : ce qui
est passé est passé.

⚠️ **Le backfill n'écrit AUCUNE provenance.** `validated_at`/`validated_by` restent `NULL` sur ces
lignes, et cela se lit correctement : personne ne les a laissées passer, elles sont passées faute
de gate. Leur inventer une provenance serait une rétro-attribution — exactement ce que la doctrine
§F.4 interdit. La seule écriture de provenance reste `provenance.mark_validated`.

⚠️ **`quizzes` porte désormais DEUX statuts, et ce n'est pas un doublon.** `status`
(`draft|ready|archived`) est le cycle de vie de l'objet — l'ADR-0014 Décision 3 s'en sert pour
retirer un quiz sans effacer ses tentatives. `validation_status` dit si Papa l'a laissé passer.
Un diagnostic peut très bien être `ready` et `pending` : il existe, il est complet, il n'est pas
servi. Les aligner ferait disparaître cette distinction.

Revision ID: a9b0c1d2e3f4
Revises: e7f8a9b0c1d2
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a9b0c1d2e3f4"
down_revision: str | None = "e7f8a9b0c1d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # `server_default` posé à la création pour que les lignes existantes soient remplies sans
    # NULL, puis le backfill les corrige. Il est CONSERVÉ après coup : un `INSERT` brut (script,
    # console psql) doit produire un quiz `pending`, pas un quiz sans statut.
    op.add_column(
        "quizzes",
        sa.Column(
            "validation_status",
            sa.String(length=20),
            nullable=False,
            server_default="pending",
        ),
    )
    op.execute("UPDATE quizzes SET validation_status = 'validated'")


def downgrade() -> None:
    op.drop_column("quizzes", "validation_status")
