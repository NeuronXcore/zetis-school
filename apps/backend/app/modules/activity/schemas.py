"""Schémas HTTP de l'activité (heatmap, détail-jour, sessions, KPI, télémétrie).

Miroir Pydantic des types partagés `packages/types/src/activity.ts` (règle CLAUDE.md n°8).
`extra="forbid"` sur les entrées : aucun champ en trop toléré — en particulier, le client de
télémétrie ne peut PAS glisser un horodatage, c'est le serveur qui date.
"""

from pydantic import BaseModel, ConfigDict, Field


# --- Écriture (seule écriture cliente autorisée dans le journal) -------------------------------


class PageViewRequest(BaseModel):
    """Body de `POST /api/telemetry/pageview`. Déclaratif observationnel : n'influence ni XP, ni
    score, ni verdict — c'est ce qui borne l'exception au « never trust the client »."""

    model_config = ConfigDict(extra="forbid")

    route: str = Field(min_length=1, max_length=200)


# --- Lectures parent --------------------------------------------------------------------------


# `HeatmapDay` et `HeatmapOut` sont partis avec la route `/activity/heatmap` (ADR-0028). La grille
# est désormais servie par matière dans le contrat du module `dashboard`, où `days_inactive` reste
# calculé TOUTES matières — un filtre ne doit pas fausser le signal de décrochage.


class ActivityEntry(BaseModel):
    time: str
    event_type: str
    label: str
    subject_slug: str | None = None
    skill_name: str | None = None
    xp: int = 0
    minutes: int = 0
    detail: str | None = None
    # Présent uniquement sur une ligne de révisions agrégées (« Révision SRS · n cartes »).
    count: int | None = None


class DayDetailOut(BaseModel):
    date: str
    events: list[ActivityEntry]


class SessionOut(BaseModel):
    # Instants bruts (ISO 8601 UTC) pour tout calcul, ET bornes pré-formatées en heure locale
    # pour l'affichage — mêmes règles que le `time` d'un événement, donc aucune heure
    # contradictoire dans une même carte.
    started_at: str
    ended_at: str
    started_time: str
    ended_time: str
    active_minutes: int
    events: list[ActivityEntry]


class SessionDay(BaseModel):
    date: str
    sessions: list[SessionOut]


class SessionsOut(BaseModel):
    days: list[SessionDay]


# Les schémas de KPI du dashboard ont quitté ce module avec la route (ADR-0028 §1) : le nouveau
# contrat vit dans `modules/dashboard/schemas.py`. `sessions`, `xp` et `missions_completed` n'y
# figurent plus — un KPI de pilotage doit être décisionnel, et l'XP reste sur Progression (§5).
