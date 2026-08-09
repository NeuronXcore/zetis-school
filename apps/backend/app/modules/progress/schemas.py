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
    # D'où vient la lacune (`diagnostic`, `mission`…) et de quoi on dispose pour la retravailler
    # (`ok` | `aucune_lecon` | `cours_brouillon`, cf. `app/modules/content_state.py`). Servis depuis
    # l'ADR-0045 : les jauges de la page Diagnostic renvoient ici avec `?source=` et `?contenu=`,
    # et sans ces deux champs le renvoi « dont N sans contenu → » affichait TOUTES les lacunes.
    #
    # 🔴 **Le `response_model` FILTRE tout champ non déclaré, en silence.** Les deux clés étaient
    # bien produites par le service et disparaissaient ici — aucune erreur, aucun avertissement.
    # C'est un test de contrat qui l'a montré, pas la lecture du service.
    source: str | None = None
    content_state: str | None = None
    # ADR-0047 : de quoi rendre la ligne actionnable. `lesson_id` est la leçon que le GESTE doit
    # ouvrir — en brouillon quand il dit « valider », validée quand il dit « relire » —, `mission_id`
    # la mission `planned|active` qui couvre déjà la notion. Les deux étaient DÉJÀ calculés puis
    # jetés par le service : coût nul, aucune migration.
    #
    # ⚠️ Le commentaire ci-dessus n'est pas décoratif : ce sont les DEUX MÊMES lignes qu'il a fallu
    # ajouter ici en 2026-08-08 pour `source` et `content_state`, après qu'elles ont disparu en
    # silence à la sérialisation. Troisième et quatrième champ du même service, même piège.
    lesson_id: int | None = None
    mission_id: int | None = None


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


# --- Index des notions (adr-0040 §11) -----------------------------------------------------------
#
# ⚠️ `since` n'est PAS un `int | None`, et c'est la décision du §7 : `null` dirait à la fois
# « jamais abordée », « bascule antérieure à la trace » et « date perdue à la migration » — trois
# causes dont une seule se comblera d'elle-même. Deux absences ne partagent pas un `null`.


class SinceDays(BaseModel):
    days: int


class SinceUnknown(BaseModel):
    # before_history   : abordée, mais sa dernière bascule précède la mise en service de l'historique
    # before_migration : consolidée avant `mastered_at` — la date est définitivement perdue
    unknown: str


class SkillIndexRowOut(BaseModel):
    skill_id: int
    skill_name: str
    subject_id: int
    subject_name: str
    subject_slug: str | None = None
    # acquise | a_renforcer | en_cours | non_abordee — dérivé du regroupement canonique importé,
    # jamais d'une ré-énumération locale.
    palier: str
    mastery_score: int | None = None
    # ⚠️ DEUX AXES INDÉPENDANTS du palier (§4), jamais une colonne à trois valeurs.
    has_open_gap: bool = False
    gap_severity: str | None = None
    has_active_mission: bool = False
    since: SinceDays | SinceUnknown | None = None


class SkillIndexSubjectOut(BaseModel):
    subject_id: int
    name: str
    slug: str | None = None


class DatedFactOut(BaseModel):
    """Un fait DATÉ de la vue période (§2). Cinq natures, un seul schéma.

    ⚠️ Ni XP ni production : l'XP est le seul compteur que le journal ne pourrait pas recomposer
    (`XPEvent` n'a pas de `skill_id`), et la production mesure le stock de contenu, pas la
    progression. Aucun palier, aucun stock non plus — une fenêtre posée sur un palier est un
    mensonge, posée sur un fait daté elle est exacte.
    """

    # mastery_transition | gap_opened | gap_resolved | mission_done | quiz_scored | review_scored
    kind: str
    at: str
    skill_id: int | None = None
    skill_name: str | None = None
    subject_id: int | None = None
    # Renseignés selon la nature, jamais tous ensemble.
    from_status: str | None = None
    to_status: str | None = None
    severity: str | None = None
    verdict: str | None = None
    score: int | None = None
    rating: str | None = None


class SkillIndexOut(BaseModel):
    notions: list[SkillIndexRowOut] = []
    subjects: list[SkillIndexSubjectOut] = []
    # Servi sur la fenêtre la PLUS LARGE (365 j) ; le client filtre à 7/30/90 sans requête. C'est
    # ce qui permet au §6 d'être tenu : les compteurs se dérivent du journal AFFICHÉ.
    facts: list[DatedFactOut] = []
    facts_since: str | None = None
    # Les débuts de trace, déclarés à l'écran (§6) : un compteur bas dit « pas de trace », jamais
    # « pas de mouvement ». `None` = aucune trace du tout.
    history_since: str | None = None
    reviews_since: str | None = None


class TimelineTransitionOut(BaseModel):
    # `None` sur la plus ancienne bascule tracée : la trace ne porte pas son palier de départ, et
    # l'inventer serait une affirmation de plus que l'évidence ne soutient pas.
    from_status: str | None = None
    to_status: str
    mastery_score: int
    changed_at: str


class SkillTimelineOut(BaseModel):
    skill_id: int
    skill_name: str
    transitions: list[TimelineTransitionOut] = []
    history_since: str | None = None
