"""Contrat de sortie de l'agrégat dashboard (ADR-0028, `page-dashboard.md §Contrat API`).

Les clés de `periods`, `minutes`, `slots` et `series` sont les CHAÎNES `"7"`, `"30"`, `"90"`,
`"365"` : JSON n'a pas de clé entière, et un `dict[int, …]` piégerait le client TypeScript qui
lirait `payload.periods[7]` sur un objet dont la clé est `"7"`.
"""

from pydantic import BaseModel


class KpiValue(BaseModel):
    value: int
    delta: int


class KpiOutOf(KpiValue):
    """KPI portant son dénominateur : « 5 / 7 jours », « 12 / 46 notions »."""

    of: int


class KpiGaps(KpiValue):
    # Le sous-compte qui rend le KPI actionnable : une lacune sans mission est la seule qui
    # demande un geste. Servi par le serveur — le client ne recroise rien.
    without_mission: int


class Kpis(BaseModel):
    active_minutes: KpiValue
    active_days: KpiOutOf
    consolidated: KpiOutOf
    open_gaps: KpiGaps


class Sparks(BaseModel):
    active_minutes: list[int]
    active_days: list[int]
    consolidated: list[int]
    open_gaps: list[int]


class PeriodOut(BaseModel):
    kpis: Kpis
    sparks: Sparks


class SchoolYearOut(BaseModel):
    level: str
    label: str
    program_version: str | None = None


class InboxItem(BaseModel):
    kind: str  # validation | gap | demande | referentiel | source
    count: int
    label: str
    detail: str | None = None
    href: str


class CalendarDay(BaseModel):
    date: str
    active_minutes: int


class Notions(BaseModel):
    consolidated: int
    fragile: int
    in_progress: int
    total: int


class SubjectSeries(BaseModel):
    covered: list[int]
    consolidated: list[int]
    fragile: list[int]


class SubjectOut(BaseModel):
    id: int
    slug: str
    name: str
    # `NULL` n'est pas une erreur : `Subject.color` est nullable et le repli est une palette
    # déterministe côté client — c'est de la présentation (adr-0028 §3).
    color: str | None = None
    minutes: dict[str, int]
    # 26 semaines, indépendant de la période : la grille sert la tendance longue. Jours vides
    # OMIS, reconstruits côté client.
    calendar: list[CalendarDay]
    # Matrice 8 créneaux × 7 jours, 8 h → 24 h, Europe/Paris.
    slots: dict[str, list[list[int]]]
    # Activité de 0 h à 8 h, renvoyée à part plutôt que repliée dans un créneau qui la daterait
    # faussement (adr-0028 §6).
    slots_outside_minutes: dict[str, int]
    notions: Notions
    series: dict[str, SubjectSeries]
    review_load: list[int]  # 14 entiers, J+0 → J+13
    gaps_open: int
    # `false` = matière SANS AUCUN CHAPITRE dans l'année active. Elle reste dans la liste : le
    # trou est une information, pas une ligne à masquer.
    #
    # ⚠️ À ne pas confondre avec `notions.total == 0`. Les deux états existent et ne veulent pas
    # dire la même chose : une matière peut avoir ses chapitres sans qu'aucune notion y soit
    # encore rattachée (chapitres générés, rattrapage des notions pas encore fait). C'est
    # `notions.total == 0` qui commande la barre vide et le libellé « référentiel non généré » de
    # la carte « État des notions » ; `has_referentiel` sert à savoir s'il faut ouvrir le
    # Programme.
    has_referentiel: bool


class ContentStage(BaseModel):
    stage: str
    label: str
    value: int
    target: int


class Evidence(BaseModel):
    count: int
    kind: str
    href: str


class ReadingItem(BaseModel):
    trend: str  # up | flat | watch
    text: str
    # OBLIGATOIRE : un constat sans preuve adressable n'est pas émis (adr-0028, spec §8).
    evidence: Evidence


class ProposedStep(BaseModel):
    step_type: str  # eli5 | vocal_explain | mindmap | quiz | lesson
    instruction: str


class ProposedMission(BaseModel):
    """Mission composée EN LECTURE par le moteur de missions (patron preview/confirm ADR-0010).

    Rien n'est créé par le GET qui la sert : Papa confirme sur la surface Missions, et c'est la
    route de création déjà en place qui écrit. La proposition et la création voient exactement
    les mêmes lacunes — sinon la carte proposerait une notion que le bouton ne créerait pas.
    """

    skill_id: int | None = None
    skill_name: str
    title: str
    steps: list[ProposedStep]
    estimated_minutes: int
    mission_type: str
    confirm_href: str


class DashboardOut(BaseModel):
    school_year: SchoolYearOut | None = None
    generated_at: str
    last_activity_at: str | None = None
    days_inactive: int
    inbox: list[InboxItem]
    # Temps actif non imputable à une matière (connexion, navigation, chat). Servi à part pour que
    # la somme des parts du donut égale le KPI « temps actif » — sans lui, les deux chiffres se
    # contredisaient sur le même écran.
    unattributed_minutes: dict[str, int]
    periods: dict[str, PeriodOut]
    subjects: list[SubjectOut]
    content_chain: list[ContentStage]
    reading: list[ReadingItem]
    # `null` = aucune lacune découverte. La carte ne propose alors rien, plutôt que d'inventer
    # un travail à faire.
    proposed_mission: ProposedMission | None = None
