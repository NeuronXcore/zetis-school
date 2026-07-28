from pydantic import BaseModel

from app.modules.motivation.schemas import WeekEngagementOut


class BadgeOut(BaseModel):
    code: str
    label: str
    icon: str


class XpEventOut(BaseModel):
    amount: int
    reason: str
    created_at: str | None


class GamificationSummary(BaseModel):
    total_xp: int
    level: int
    xp_into_level: int  # XP acquis dans le niveau courant
    xp_for_next: int  # XP nécessaires pour passer un niveau
    # A remplacé `streak_days`/`active_today` (retirés) : un compte hebdomadaire qui ne peut
    # pas casser, là où la série tombait à zéro après un seul jour manqué.
    regularity: WeekEngagementOut
    badges: list[BadgeOut]
    recent: list[XpEventOut]
