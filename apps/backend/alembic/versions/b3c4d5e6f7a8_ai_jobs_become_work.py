"""ai_jobs devient une file de travaux visibles, et un échec s'acquitte (ADR-0041)

Trois gestes, tous **additifs** — aucune colonne supprimée, aucun backfill :

1. `ai_jobs` reçoit ses **deux premiers index**. La table n'en avait AUCUN depuis sa création
   (`5678d02df7f6`), alors que `quizzes/service.py` la balaie entièrement à deux endroits.
   - `(status, created_at)` — la lecture d'activité de la barre du header ;
   - `(job_type, status)` — les statistiques de génération de quiz.
2. `ai_jobs.acknowledged_at` — un échec reste affiché jusqu'à ce que Papa le ferme (§8).
3. `production_runs.acknowledged_at` — la même chose pour un lot.

⚠️ **Aucune colonne d'origine sur `ai_jobs`** : le §3.2 de l'ADR l'a retirée au read-before-code.
`db/models/production.py` interdit de recopier un déclencheur hors du lot, et l'origine se dérive
(les deux scans automatiques passent par `create_run`, donc hors lot ⇒ `manual`).

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f9
"""

from typing import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b3c4d5e6f7a8"
down_revision: str | None = "a1b2c3d4e5f9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "ai_jobs", sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_ai_jobs_status_created", "ai_jobs", ["status", "created_at"])
    op.create_index("ix_ai_jobs_type_status", "ai_jobs", ["job_type", "status"])
    op.add_column(
        "production_runs",
        sa.Column("acknowledged_at", sa.DateTime(timezone=True), nullable=True),
    )

    # 🔴 **UN backfill, et il est nécessaire** — corrigé pendant l'implémentation.
    #
    # L'ADR annonçait « aucun backfill », en pensant que `NULL` était sans ambiguïté. Il ne l'est
    # pas : `NULL` veut dire « jamais acquitté », donc **tout échec de l'historique remonterait
    # dans la barre au premier démarrage** — des lots morts il y a des semaines, présentés comme
    # des nouvelles à traiter. Ce qui a échoué avant que l'acquittement existe est réputé VU.
    #
    # `finished_at` plutôt que `now()` : on date l'acquittement de l'instant où la chose s'est
    # produite, pas de l'instant où on a livré la fonctionnalité.
    op.execute(
        "UPDATE production_runs SET acknowledged_at = COALESCE(finished_at, created_at) "
        "WHERE status = 'failed' AND acknowledged_at IS NULL"
    )
    op.execute(
        "UPDATE ai_jobs SET acknowledged_at = COALESCE(finished_at, created_at) "
        "WHERE status = 'failed' AND acknowledged_at IS NULL"
    )


def downgrade() -> None:
    op.drop_column("production_runs", "acknowledged_at")
    op.drop_index("ix_ai_jobs_type_status", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_status_created", table_name="ai_jobs")
    op.drop_column("ai_jobs", "acknowledged_at")
