"""quiz_attempts : reliability_json — les conditions d'une mesure de diagnostic

ADR-0048. **La SEULE migration du chantier anti-triche.** Une colonne JSON, nullable, écrite une
fois à la soumission et jamais recalculée à la lecture.

🔴 `NULL` ≠ « rien à signaler ». `NULL` veut dire **ZETIS ne regardait pas** : c'est l'état de
toutes les passations antérieures, et il n'y a **aucun backfill** — on ne peut pas reconstituer
après coup des conditions qu'on n'a pas observées. Prétendre le contraire produirait un instrument
qui rassure sans avoir mesuré, ce que l'ADR interdit en Contexte.

Rien d'autre ne bouge : les signaux par question logent dans `quiz_answers.answer_json`, qui est
déjà un JSON libre, et `duration_seconds` / `started_at` existent depuis toujours — ils cessent
simplement d'être faux.

⚠️ **Cette révision a d'abord été numérotée `c3d4e5f6a7b8`, un id DÉJÀ PRIS** par
`c3d4e5f6a7b8_add_capsule_lot1_fields.py`. Alembic ne dit pas « id dupliqué » : il répond
*« Cycle is detected in revisions (…42 révisions…) »*, une liste qui ne désigne pas la cause. Pour
trouver la tête, l'autorité est `alembic heads` — un `grep` sur `^down_revision =` rate les
migrations qui l'écrivent annotée (`down_revision: str | None = "…"`), et fait croire à une
fausse tête.

Revision ID: e2f3a4b5c6d7
Revises: a9b0c1d2e3f4
"""

import sqlalchemy as sa
from alembic import op

revision = "e2f3a4b5c6d7"
down_revision = "a9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("quiz_attempts", sa.Column("reliability_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("quiz_attempts", "reliability_json")
