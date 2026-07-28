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
    # DÉPRÉCIÉS (chantier « auto-motivation ») : remplacés par `regularity`, retirés une fois
    # le frontend basculé. Servis inchangés d'ici là.
    streak_days: int
    active_today: bool
    regularity: WeekEngagementOut
    badges: list[BadgeOut]
    recent: list[XpEventOut]
