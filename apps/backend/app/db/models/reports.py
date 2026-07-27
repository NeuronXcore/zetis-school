from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CouncilReport(Base):
    """Rapport « Conseil de classe IA » figé (ADR-0020) — Papa-only.

    Narration LLM **locale** posée sur le service d'évidence. On fige l'artefact ET l'évidence
    qui l'a produit (`evidence_snapshot_json`) : une génération LLM n'est pas rejouable, donc
    l'auditabilité vient du **figeage**, pas du déterminisme (contraste assumé avec l'élection de
    mission, ADR-0017 §Conséquences, qui ne stocke rien car rejouable).

    `subjects_json` porte la Spec validée **et ancrée** (recommandations dont les `skill_id` ont
    été vérifiés contre l'évidence). `period` est un simple libellé en v1 (pas de modèle de
    période riche — ADR-0020 déc. 7 ; l'évidence reflète l'état courant)."""

    __tablename__ = "council_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    period: Mapped[str] = mapped_column(String(30))
    global_summary: Mapped[str] = mapped_column(Text)
    subjects_json: Mapped[list] = mapped_column(JSON)
    prompt_version: Mapped[str] = mapped_column(String(20))
    evidence_snapshot_json: Mapped[dict] = mapped_column(JSON)
    created_by: Mapped[str] = mapped_column(String(20), default="ai")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
