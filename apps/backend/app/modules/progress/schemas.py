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


# --- Panneau d'analyse d'une matière (adr-0028-addendum-analyse-par-matiere) ---------------------
#
# ⚠️ Ce contrat ne sert QUE ce que l'agrégat du dashboard ne peut pas porter : des NOMS. Les
# compteurs de notions, les minutes, le calendrier, les créneaux et la charge SRS des 14 jours sont
# déjà dans `SubjectOut` — donc déjà en mémoire côté client. Les re-servir ici fabriquerait une
# seconde source pour une mesure affichée dans la bulle juste au-dessus, ce qui est précisément le
# bug que ce chantier corrige.
#
# Corollaire : rien ici ne dépend d'une PÉRIODE. C'est ce qui garantit que changer de période avec
# le panneau ouvert ne déclenche aucune requête.


class AnalysisNotionOut(BaseModel):
    """Une notion à renforcer, NOMMÉE.

    ⚠️ `is_fragile` et `has_open_gap` sont DEUX mesures distinctes, jamais additionnées :
    « fragile » est un statut de `SkillMastery` (`weak`/`learning`), « lacune ouverte » est une
    ligne `Gap`. Une notion peut être l'un sans l'autre. Les confondre a déjà coûté un bug.
    """

    skill_id: int
    skill_name: str
    is_fragile: bool
    has_open_gap: bool
    # Renseignés seulement si `has_open_gap` : une notion fragile n'a pas de sévérité.
    severity: str | None = None
    gap_status: str | None = None
    first_detected_at: str | None = None
    # Renseignés seulement si une ligne de maîtrise existe.
    mastery_status: str | None = None
    mastery_score: int | None = None
    # Signal quiz pondéré (ADR-0014), `None` si aucune tentative.
    weak_quiz_signal: float | None = None
    last_seen_at: str | None = None
    # MÊME source que la page `/lacunes` (`skills_with_active_mission`) : les deux surfaces ne
    # peuvent pas se contredire sur « est-ce déjà pris en charge ».
    has_active_mission: bool


class AnalysisMissionOut(BaseModel):
    id: int
    title: str
    mission_type: str
    status: str  # planned | active
    validation_status: str
    skill_id: int | None = None
    skill_name: str | None = None


class AnalysisInProgressOut(BaseModel):
    """Ce qui tourne déjà — pour ne pas commander deux fois la même chose."""

    missions: list[AnalysisMissionOut]
    pending_content: int
    stale_content: int
    # ⚠️ RETARD accumulé (`due_at <= maintenant`), à ne pas confondre avec `SubjectOut.review_load`,
    # qui est la charge À VENIR sur 14 jours. Deux mesures, deux noms — `srs_pressure` ne filtre
    # d'ailleurs pas les cartes suspendues, là où `review_load` le fait.
    review_overdue: int
    review_max_overdue_days: int


class AnalysisReferentielOut(BaseModel):
    """Y a-t-il seulement de quoi travailler ? Évite de lancer un conseil sur un programme vide."""

    has_referentiel: bool
    lessons: int
    lessons_validated: int
    courses_written: int
    derivatives_percent: int


class AnalysisEngagedNotionOut(BaseModel):
    """Une notion ENGAGÉE — elle porte une ligne de maîtrise (addendum ADR-0038 §2).

    `segment` est celui de `notions_breakdown`, jamais reclassé ici : un statut inconnu tombe dans
    `in_progress` plutôt que d'être perdu.
    """

    skill_id: int
    skill_name: str
    segment: str  # consolidated | fragile | in_progress
    mastery_status: str | None = None
    mastery_score: int | None = None


class AnalysisNotStartedOut(BaseModel):
    """Une notion AU PROGRAMME que rien n'a encore touchée — le reste de la barre d'avancement."""

    skill_id: int
    skill_name: str


class AnalysisXpByReasonOut(BaseModel):
    """L'XP d'une matière réparti par GESTE.

    ⚠️ **Par motif, jamais par notion.** `XPEvent` ne porte pas de `skill_id` : « quelles notions
    ont rapporté ces 367 XP » n'a aucune réponse en base. Ce n'est pas une approximation faute de
    mieux, c'est le plafond de ce que la donnée permet (addendum ADR-0038 §3).
    """

    reason: str
    count: int
    amount: int


class SubjectAnalysisOut(BaseModel):
    subject_id: int
    slug: str
    name: str
    generated_at: str
    # Fragiles ∪ lacunes ouvertes, les plus graves d'abord. NON PLAFONNÉ : le plafond de 8 du
    # Conseil borne un PROMPT, pas un panneau.
    to_reinforce: list[AnalysisNotionOut]
    # Redondants avec la liste, et c'est VOULU : ils rendent la cohérence vérifiable dans une seule
    # charge utile — par un test comme par un humain. C'est ce qui ferme le motif « un constat
    # annonce un nombre que sa preuve ne sert pas ».
    fragile_count: int
    open_gap_count: int
    without_mission_count: int
    in_progress: AnalysisInProgressOut
    referentiel: AnalysisReferentielOut
    # --- Dépliage d'une ligne de Progression (addendum ADR-0038) -------------------------------
    #
    # 🔴 Ces trois listes doivent RECOMPOSER les nombres de la ligne qu'elles expliquent :
    # `len(engaged) == notions.engaged`, `len(engaged) + len(not_started) == notions.total`,
    # `Σ xp_by_reason.amount == xp`. Un détail qui ne recompose pas son nombre est le défaut que
    # tout ce chantier ferme, reproduit à quelques pixels d'écart.
    #
    # Le `SubjectAnalysisPanel` du dashboard les ignore : il n'a pas eu à changer.
    engaged: list[AnalysisEngagedNotionOut] = []
    not_started: list[AnalysisNotStartedOut] = []
    xp_by_reason: list[AnalysisXpByReasonOut] = []


# --- Page « Progression » : l'avancement du programme, matière par matière (ADR-0038) ------------
#
# ⚠️ **Deux mesures, jamais fondues.** `engaged` dit ce qui a été ABORDÉ, `notions.consolidated` dit
# ce qui est ACQUIS. Elles ne s'additionnent pas et aucune n'est un raffinement de l'autre : « où
# en est-on dans l'année » et « qu'est-ce qui est acquis » sont deux questions, et le contrat doit
# le montrer avant qu'on le lui demande. Le vocabulaire de « consolidée » ne bouge pas (ADR-0028
# §3 bis) — on mesure autre chose, et on le nomme autrement.
#
# ⚠️ Aucun champ de période, aucune série, aucune action : tout est un stock, lu « à aujourd'hui ».


class ProgressionNotionsOut(BaseModel):
    """Répartition des notions d'une matière — la MÊME que `SubjectOut.notions` du dashboard.

    Sert la projection pure `dashboard.projections.notions_breakdown`, pas un second comptage.
    """

    consolidated: int
    fragile: int
    in_progress: int
    # Notions AU PROGRAMME. ⚠️ `total == 0` n'est PAS « pas de référentiel » : une matière peut
    # avoir ses chapitres sans qu'aucune notion y soit rattachée. Voir `has_referentiel`.
    total: int


class ProgressionSubjectOut(BaseModel):
    subject_id: int
    slug: str
    name: str
    color: str | None = None
    icon: str | None = None
    notions: ProgressionNotionsOut
    # Notions portant une ligne de maîtrise = consolidées ∪ fragiles ∪ en cours. C'est le
    # NUMÉRATEUR de la barre, et il mesure l'avancement du programme, jamais l'acquisition.
    engaged: int
    # Cumul sur toute l'histoire, sans fenêtre : un XP est un stock. Cette page est la seule
    # maison du XP côté Papa depuis que l'ADR-0028 §5 l'a retiré des KPI de pilotage.
    xp: int
    # ⚠️ **La colonne « À renforcer » de l'écran, c'est `notions.fragile` — PAS ce champ.**
    # Les deux populations sont disjointes en droit, et le sont en fait : sur la base réelle,
    # Français porte 8 notions fragiles et 1 seule lacune ouverte. Le constat du dashboard qui
    # pointe vers cette page annonce « 8 notions à renforcer » : afficher 1 ici referait mentir la
    # preuve, ce que le chantier corrige. (La spec ADR-0038 disait `Gap` dans son tableau et
    # montrait les fragiles dans son wireframe — contradiction tranchée le 2026-08-05.)
    #
    # Ce champ reste servi parce qu'il compte ce que la page `/lacunes` sert vraiment, et qu'il
    # est déjà en mémoire. Il ne se substitue jamais à `notions.fragile`.
    gaps_open: int
    # « La matière a au moins un chapitre dans l'année active » — la définition du dashboard, donc
    # celle du constat qui pointe vers cette page. `false` → la ligne reste affichée, avec son état
    # écrit et un lien vers le Programme ; la masquer ferait croire que la matière n'existe pas.
    has_referentiel: bool


class ProgressionOverviewOut(BaseModel):
    generated_at: str
    school_year: dict | None = None
    subjects: list[ProgressionSubjectOut]
