"""Schémas HTTP de la progression (lacunes ouvertes, notions consolidées).

Miroir Pydantic de `packages/types/src/activity.ts` (section progression).
"""

from pydantic import BaseModel


class OpenGapOut(BaseModel):
    skill_id: int
    skill_name: str
    subject_slug: str | None = None
    subject_name: str | None = None
    severity: str  # low | medium | high
    status: str  # open | in_progress
    first_detected_at: str | None = None
    # Une mission `planned|active` couvre-t-elle déjà cette notion ? C'est ce qui sépare, dans la
    # page Lacunes, ce qui ATTEND une décision de Papa de ce qui est déjà en route. Calculé
    # serveur : le client ne recroise pas deux listes.
    has_active_mission: bool = False


class ConsolidatedSkillOut(BaseModel):
    skill_id: int
    skill_name: str
    subject_slug: str | None = None
    subject_name: str | None = None
    mastery_score: int
    last_seen_at: str | None = None
