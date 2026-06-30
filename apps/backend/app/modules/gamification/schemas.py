from pydantic import BaseModel


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
    streak_days: int
    active_today: bool
    badges: list[BadgeOut]
    recent: list[XpEventOut]
