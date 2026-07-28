"""Schémas HTTP de la motivation (régularité douce, engagement hebdomadaire).

Miroir Pydantic de `packages/types/src/motivation.ts`.

**Aucune clé punitive n'existe dans ces schémas** — ni `missed`, ni `failed`, ni `remaining`, ni
`streak`, ni `best`. C'est volontaire et testé : un frontend ne peut pas afficher une punition
dont le contrat ne porte pas la donnée.
"""

from pydantic import BaseModel, ConfigDict, Field

from app.modules.motivation.service import MAX_TARGET_DAYS, MIN_TARGET_DAYS


class WeekDayOut(BaseModel):
    """Une case de la semaine. Les 7 sont toujours servies, jours à venir compris — le client
    n'a ainsi ni grille à reconstruire ni date à calculer."""

    date: str
    active: bool
    is_today: bool


class WeekEngagementOut(BaseModel):
    week_start: str
    days: list[WeekDayOut]
    days_done: int
    today_done: bool
    # `null` = aucun engagement pris cette semaine. C'est l'état qui déclenche l'invitation du
    # lundi côté UI, et il se distingue d'un objectif à 0 — qui n'existe pas.
    goal_days: int | None = None
    goal_met: bool


class WeekGoalRequest(BaseModel):
    """Body de `PUT /api/student/motivation/week`.

    Pas de champ `week_start` : la semaine est déduite serveur. `extra="forbid"` le garantit —
    un client qui tenterait de viser une semaine passée reçoit un 422."""

    model_config = ConfigDict(extra="forbid")

    target_days: int = Field(ge=MIN_TARGET_DAYS, le=MAX_TARGET_DAYS)


# --- Messages (accueil, clôture de séance) -----------------------------------------------------


class MessageCtaOut(BaseModel):
    """Action proposée. `null` quand il n'y en a pas — le client n'a alors aucun bouton."""

    label: str
    target: str


class WelcomeContextOut(BaseModel):
    """Ce qui a servi à choisir le message. Sert à l'UI pour l'illustration et pour alimenter
    d'autres blocs — **jamais** pour recomposer une phrase.

    `days_since_last_visit` est ici et n'apparaît dans AUCUN texte : le nombre de jours d'absence
    ne doit jamais être lu par l'enfant."""

    first_name: str
    last_notion: str | None = None
    days_since_last_visit: int | None = None
    consolidated_this_week: int
    gaps_closed_this_week: int
    reviews_due: int
    regularity: WeekEngagementOut


class MessageOut(BaseModel):
    """Message composé SERVEUR. Le `code` sert au client à choisir une illustration, jamais à
    réinterpréter le texte."""

    code: str
    title: str
    subtitle: str | None = None
    cta: MessageCtaOut | None = None


class WelcomeOut(MessageOut):
    context: WelcomeContextOut
