from datetime import datetime

from sqlalchemy import JSON, DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AIJob(Base):
    """Un TRAVAIL IA : sa trace, et — depuis l'ADR-0041 — son attente (CLAUDE.md : trace
    obligatoire pour toute fonction IA).

    ## Deux natures dans une seule table, et elles se distinguent par `status`

    - **Une trace** — l'appel synchrone qui se raconte après coup. Créé directement en `running`
      par `flush()`, donc **invisible hors de sa transaction**, puis `succeeded`. Il n'apparaît
      jamais dans `/activity` : quand une autre connexion peut le lire, il est déjà fini.
    - **Un travail de file** (ADR-0041 §3) — créé en **`queued` et COMMITÉ** avant d'être enfilé,
      pris par le worker qui le passe `running` puis `succeeded`/`failed`. C'est celui-là que la
      barre du header montre.

    ⚠️ **Aucune colonne d'origine ici, et c'est une décision** (ADR-0041 §3.2, corrigée au
    read-before-code). `db/models/production.py` l'interdit en tête de fichier — un déclencheur se
    pose sur le LOT, jamais recopié sur ce qu'il engendre. Et elle serait inutile : les deux
    scans automatiques passent par `create_run`, donc **hors lot ⇒ `manual`, toujours**.

    ⚠️ `created_by` porte l'**acteur** (`"child"`, `"worker-media"`), pas l'origine. Ne pas le
    détourner.
    """

    __tablename__ = "ai_jobs"
    __table_args__ = (
        # La lecture d'activité : « qu'est-ce qui attend ou tourne, le plus récent d'abord ».
        Index("ix_ai_jobs_status_created", "status", "created_at"),
        # `quizzes/service.py` (`_discard_rate`, `_generation_stats_by_subject`) balayait TOUTE la
        # table : elle n'avait aucun index depuis sa création (migration `5678d02df7f6`).
        Index("ix_ai_jobs_type_status", "job_type", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[str] = mapped_column(String(40))  # eli5_explain | eli5_reverse | ...
    status: Mapped[str] = mapped_column(String(15), default="queued")  # queued|running|succeeded|failed
    input_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    output_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Papa a-t-il VU cet échec ? (ADR-0041 §8) — serveur, jamais `localStorage` : un acquittement
    # par navigateur reviendrait au prochain appareil.
    acknowledged_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
