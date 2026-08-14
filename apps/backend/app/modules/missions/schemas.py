"""Schémas missions — frontière serveur stricte (ADR-0017 §3).

Deux schémas, deux routers : `MissionStudentOut` (Massimo, SANS scores/facteurs/motifs) et
`MissionPilotOut` (Papa, sur-ensemble analytique). Jamais un schéma unique filtré en aval :
un champ présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI.
"""

from datetime import date

from pydantic import BaseModel

# Réutilisation du résumé d'équipement (ADR-0021) pour le retour du confirm champion. `reports.schemas`
# n'importe rien de `missions` (pas de cycle) — les deux `__init__` de module sont vides.
from app.modules.reports.schemas import EquipNotionResult

# --- Frontière STUDENT (Massimo) : aucun score, aucun facteur, aucun motif de génération -----


class MissionStepStudentOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
    resource_id: int | None
    # ADR-0022 : notion + matière portées par l'étape (renseignées pour une champion croisée, sinon
    # dérivées de la mission) — badges matière/notion par étape côté Massimo. Étiquettes d'affichage,
    # pas des scores : frontière §3 préservée.
    skill_id: int | None = None
    skill_name: str | None = None
    subject: str = ""
    sort_order: int
    status: str


class MissionStudentOut(BaseModel):
    id: int
    subject: str
    # ⚠️ Le slug MANQUAIT : le front le devinait par `slugify(nom)`, et un nom accentué ne redonne
    # pas toujours le bon slug. Les quatre autres pages du motif (ADR-0057) le servent.
    subject_slug: str = ""
    # Chapitre DÉRIVÉ de la notion via ses leçons validées (ADR-0057 addendum Missions §2/§3).
    # 🔴 `None` quand la dérivation rend **zéro OU plusieurs** chapitres — on n'en choisit jamais
    # un parmi plusieurs. Rien n'est persisté : le calcul vit dans le service, à la lecture (§4).
    chapter_id: int | None = None
    chapter: str | None = None
    skill_id: int | None
    skill_name: str | None
    title: str
    description: str | None
    mission_type: str
    status: str
    # ⚠️ Aucun champ d'AUTEUR ici — retiré le 2026-08-02. Ce schéma portait `origin` (`papa`/
    # `zetis`), affiché tel quel par Massimo (« 👤 par Papa » / « 🤖 par ZETIS »). Une seule voix
    # côté Massimo : le contenu scolaire l'atteint dans la voix de ZETIS, sans auteur nommé. La
    # raison est de tenue dans le temps, pas d'esthétique — le jour où ZETIS produira seul, il
    # faudrait sinon changer l'auteur du monde de Massimo. `created_by` reste en base et sur
    # `MissionPilotOut` (pilotage Papa). Un test-verrou interdit le retour d'un tel champ.
    priority: int
    # Affichage enfant : durée estimée (dérivée des étapes, déterministe) et XP d'effort
    # (constante `mission_xp_reward`). Ni score ni facteur — l'XP est l'unique nombre montré,
    # et il récompense l'effort, pas la performance (frontière §3 préservée).
    estimated_minutes: int
    xp_reward: int
    steps: list[MissionStepStudentOut]


class TodayResponse(BaseModel):
    """Contrat `/missions/today` (ADR-0017 §3) : une mission élue + sa raison, ou état serein."""

    elected: MissionStudentOut | None
    reason: str
    reason_code: str
    scoring_version: str
    alternatives: list[MissionStudentOut]  # ≤ 2


class GenerateResponse(BaseModel):
    created: int
    missions: list[MissionStudentOut]


class StepCompleteResponse(BaseModel):
    mission_status: str
    verdict: str | None  # acquired | review_later | None (mission non terminée)
    xp_awarded: int


class CompletedMissionOut(BaseModel):
    """« Terminées aujourd'hui » (vue student). Le verdict n'est PAS un état de mission mais un
    `LearningEvent(mission_verdict)` horodaté (§5bis) : on relit ceux du jour. Deux issues, toutes
    deux positives ; XP d'effort affiché. AUCUN score (reverse/quiz/mindmap) — frontière §3."""

    mission_id: int
    title: str
    subject: str
    verdict: str  # "acquired" | "review_later"
    xp: int


class ValidateMissionsRequest(BaseModel):
    ids: list[int]


class ValidateMissionsResponse(BaseModel):
    validated: int


# --- Frontière PILOT (Papa) : sur-ensemble analytique -------------------------------------


class StepProofOut(BaseModel):
    """Preuve d'une étape, valeurs BRUTES (interdit côté student)."""

    label: str
    value: float | None  # score reverse / quiz ; None si non disponible
    satisfied: bool


class MissionStepPilotOut(BaseModel):
    id: int
    step_type: str
    instruction: str | None
    resource_id: int | None
    skill_id: int | None = None  # ADR-0022 : notion de l'étape (croisée)
    sort_order: int
    status: str
    proof: StepProofOut


class MissionPilotOut(BaseModel):
    id: int
    subject: str
    subject_id: int | None
    skill_id: int | None
    skill_name: str | None
    title: str
    description: str | None
    mission_type: str
    status: str
    validation_status: str
    priority: int
    created_by: str
    generation_reason: str
    # ADR-0018 : analytiques Papa. `due_date` (échéance informationnelle) et `force_priority`
    # (plancher de score) n'existent QUE sur ce schéma — jamais dans MissionStudentOut.
    force_priority: bool
    due_date: date | None
    steps: list[MissionStepPilotOut]


class ElectionFactorOut(BaseModel):
    name: str
    value: float
    weight: float
    contribution: float
    dominant: bool


class ElectionAlternativeOut(BaseModel):
    mission: MissionPilotOut
    score: float


class ElectionResponse(BaseModel):
    elected: MissionPilotOut | None
    score: float | None
    factors: list[ElectionFactorOut]
    scoring_version: str
    reason: str
    reason_code: str
    alternatives: list[ElectionAlternativeOut]


class VerdictOut(BaseModel):
    mission_id: int | None
    mission_type: str | None
    verdict: str | None
    quiz_score: float | None
    reverse_score: float | None
    mindmap_score: float | None  # ADR-0019 : signal de rappel alternatif (analytique Papa)
    xp: int | None
    effect: str | None
    skill_id: int | None
    subject_id: int | None


class PilotSummaryOut(BaseModel):
    pending: int
    pool: int  # validées planned|active
    completed_this_week: int
    acquired_rate_30d: float  # 0..1 (part de verdicts « acquise » sur 30 j)


# --- Commander une mission (ADR-0018) : preview/confirm sans état, Papa uniquement -----------


class CommandNotionOut(BaseModel):
    """Une notion résolue d'un scope, avec sa fragilité mesurée. `checked` = proposé coché."""

    skill_id: int
    name: str
    level: str | None
    mastery: float  # 0..1
    fragility: float  # 1 - mastery
    checked: bool  # décoché si maîtrisé (mastery ≥ seuil), recochable côté Papa


class CommandPreviewRequest(BaseModel):
    gate: str  # "deadline" | "theme_ref" (informationnel : la résolution est chapitre → notions)
    chapter_id: int
    due_date: date | None = None


class CommandPreviewResponse(BaseModel):
    scope_label: str
    notions: list[CommandNotionOut]
    compose_note: str


class CommandConfirmRequest(BaseModel):
    gate: str
    chapter_id: int | None = None
    due_date: date | None = None
    skill_ids: list[int]  # les notions COCHÉES (1..MISSION_COMMAND_MAX_SKILLS)
    force_priority: bool = False


# --- Pilotage cycle de vie (Papa) : édition métadonnées + éditeur de parcours ---------------


class MissionPatchRequest(BaseModel):
    """Champs sûrs d'édition (tous optionnels). Les immuables (skill/type/status/validation…)
    ne sont pas exposés — le service les ignore de toute façon."""

    title: str | None = None
    description: str | None = None
    priority: int | None = None
    force_priority: bool | None = None
    due_date: date | None = None


class MissionStepOptionOut(BaseModel):
    step_type: str
    available: bool  # eli5/vocal toujours ; mindmap/quiz ssi une ressource validée existe
    resource_id: int | None
    selected: bool  # présent dans le parcours courant


class MissionStepOptionsOut(BaseModel):
    options: list[MissionStepOptionOut]
    current_types: list[str]  # parcours courant, dans l'ordre
    editable: bool  # faux dès que la mission est démarrée


class SetMissionStepsRequest(BaseModel):
    step_types: list[str]  # liste ordonnée (1 type = 1 étape)


# --- Missions croisées « champion » (ADR-0022) : preview/confirm sans état, Papa uniquement -----


class ChampionNotionOut(BaseModel):
    """Une notion travaillée résolue pour un défi champion, avec sa matière et sa maîtrise."""

    skill_id: int
    name: str
    subject_id: int
    subject_name: str
    level: str | None
    mastery: float  # 0..1
    fragility: float  # 1 - mastery
    status: str | None
    checked: bool  # proposé coché (round-robin sur les matières selon la saveur), recochable


class ChampionPreviewRequest(BaseModel):
    subject_ids: list[int]  # ≥ 2 matières (sinon ce n'est pas croisé)
    flavor: str  # "boss" | "consolidation" | "mix"


class ChampionPreviewResponse(BaseModel):
    flavor: str
    scope_label: str
    notions: list[ChampionNotionOut]
    compose_note: str


class ChampionConfirmRequest(BaseModel):
    skill_ids: list[int]  # notions COCHÉES (≥ 2 matières, ≤ MISSION_CHAMPION_MAX_SKILLS)
    flavor: str


class ChampionCreateResponse(BaseModel):
    """Résultat du confirm : la mission croisée composée + le résumé d'équipement par notion
    (ADR-0021 réutilisé). `mission` est None si la composition n'a pas abouti (rare)."""

    mission: MissionPilotOut | None
    equipment: list[EquipNotionResult]
