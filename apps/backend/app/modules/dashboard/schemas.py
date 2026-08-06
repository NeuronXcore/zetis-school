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
    # Notions `weak` + `learning` — le seul signal de RÉGRESSION du bandeau (addendum ADR-0028
    # §5 bis). Volontairement `KpiValue` et non `KpiOutOf` : « 13 / 280 » rapporterait les
    # fragiles au programme entier, non abordées comprises, et suggérerait une proportion
    # rassurante qui n'existe pas.
    fragile: KpiValue
    open_gaps: KpiGaps


class Sparks(BaseModel):
    active_minutes: list[int]
    active_days: list[int]
    consolidated: list[int]
    fragile: list[int]
    open_gaps: list[int]


class PeriodOut(BaseModel):
    kpis: Kpis
    sparks: Sparks


class SchoolYearOut(BaseModel):
    level: str
    label: str
    program_version: str | None = None


class InboxSegment(BaseModel):
    """Une part cliquable du détail d'une ligne de la file (ADR-0039 §5).

    Le `href` est **servi par le serveur**, comme celui de la ligne elle-même : c'est le contrat de
    la file, et l'addendum ADR-0028 §6 est explicite — *« une règle d'adressage n'a rien à faire
    dans un composant de présentation »*.
    """

    kind: str  # lesson | fiche | mindmap | capsule | chapter
    count: int
    label: str  # « 27 leçons »
    href: str


class InboxItem(BaseModel):
    kind: str  # validation | gap | demande | referentiel | source
    count: int
    label: str
    detail: str | None = None
    href: str
    # Vide pour les quatre familles autres que `validation` : elles n'ont rien à décomposer, et le
    # front garde son repli sur `detail`.
    breakdown: list[InboxSegment] = []


class CalendarDay(BaseModel):
    date: str
    active_minutes: int


class Notions(BaseModel):
    consolidated: int
    fragile: int
    in_progress: int
    total: int


class ReviewRatings(BaseModel):
    """Passages SRS notés, par intervalle — quatre listes de même longueur que les séries."""

    again: list[int]
    hard: list[int]
    good: list[int]
    easy: list[int]


class SubjectSeries(BaseModel):
    # Quatre STOCKS reconstruits à rebours : croissants par construction, ils ne peuvent pas
    # redescendre (`projections.reconstruct_series`).
    covered: list[int]
    consolidated: list[int]
    fragile: list[int]
    in_progress: list[int]
    # Deux FLUX datés, qui eux peuvent varier dans les deux sens. ⚠️ Ils ne se réconcilient PAS
    # avec les stocks ci-dessus et ne doivent jamais être présentés comme leur dérivée.
    gained: list[int]
    lost: list[int]
    reviews: ReviewRatings


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
    # Où va Papa pour produire ce qui manque à CETTE marche (ADR-0039 §9). Servi par le serveur
    # comme les `href` de la file : une règle d'adressage n'a rien à faire dans un composant de
    # présentation (addendum ADR-0028 §6). `None` = rien à ouvrir.
    missing_href: str | None = None
    # Combien la destination en ouvre RÉELLEMENT — et non `target - value`, qui compte aussi ce
    # qui n'est pas encore produisible. Le couple (nombre, lien) doit tenir ensemble ou ne pas
    # exister : c'est toute la raison d'être de l'ADR-0039.
    missing_count: int | None = None


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
    # Plus ancienne bascule connue de `skill_mastery_history` (`null` si la table est vide). Sert
    # UNIQUEMENT à ce que l'avertissement sur la jeunesse de la courbe ambre s'auto-périme : le
    # client ne l'affiche que si la fenêtre regardée commence AVANT cette date. Une phrase figée
    # aurait été juste six mois puis fausse pour toujours, et personne ne serait revenu la retirer.
    history_since: str | None = None
    subjects: list[SubjectOut]
    content_chain: list[ContentStage]
    reading: list[ReadingItem]
    # `null` = aucune lacune découverte. La carte ne propose alors rien, plutôt que d'inventer
    # un travail à faire.
    proposed_mission: ProposedMission | None = None
