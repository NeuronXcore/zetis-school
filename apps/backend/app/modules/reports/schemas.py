"""Schémas du Conseil de classe IA (ADR-0020).

`CouncilReportSpec` = miroir Pydantic **strict** (`extra="forbid"`) de la sortie LLM : la
garantie dure (patron ADR-0007/0015). Le service revalide en plus chaque `skill_id`/`subject_id`
contre l'évidence (ancrage anti-hallucination). Les schémas `*Out` sont la surface Papa
(`MissionPilotOut`-like) — aucune donnée n'atteint Massimo (rapport Papa-only)."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# --- Sortie LLM (validée dur) --------------------------------------------------------------


class CouncilRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    mission_type: Literal["manual"] = "manual"
    template_hint: str | None = None
    justification: str


class CouncilSubjectEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    subject_id: int
    subject_name: str
    strengths: str
    to_reinforce: str
    # ⚠️ NULLABLE ET DÉFAUTÉ, volontairement (adr-0040 §8.1). Le retirer du modèle serait une
    # faute : `extra="forbid"` ferait échouer la validation du payload ENTIER dès qu'un modèle
    # continuerait de l'émettre — un champ de trop coûterait le rapport.
    #
    # 🔴 **Reste un `str`, et c'est la décision structurante du Lot 3.** Le §8 dessine la sortie
    # `{since, transitions[], comment}` — mais il annote lui-même `transitions # SERVEUR` et
    # `comment # LLM`. Faire de ce champ D'ENTRÉE une structure reviendrait à DEMANDER les dates
    # au modèle, ce que le §8.2 interdit. Ici, il ne rend que le commentaire ; le serveur bâtit la
    # structure autour (`_evolution`). Aucune date ne transite par le modèle, donc aucune date
    # inventée ne peut atteindre le rapport — l'ancrage est structurel, pas un filtre a posteriori.
    recent_evolution: str | None = None
    recommendations: list[CouncilRecommendation] = Field(default_factory=list)


class CouncilReportSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    global_summary: str
    subjects: list[CouncilSubjectEntry] = Field(default_factory=list)


def generation_schema() -> dict:
    """Schéma JSON pour la sortie structurée ollama (identique à `CouncilReportSpec`)."""
    return CouncilReportSpec.model_json_schema()


# --- Requêtes Papa -------------------------------------------------------------------------


class GenerateCouncilRequest(BaseModel):
    """`POST /api/reports/class-council` : génère + persiste un rapport."""

    model_config = ConfigDict(extra="forbid")

    period: str | None = None
    # Portée matière (`adr-0020-conseil-de-classe-ia` (Amendement 1)). `None` = conseil GLOBAL, comportement
    # historique inchangé.
    #
    # ⚠️ `extra="forbid"` rejette les champs NON DÉCLARÉS : ajouter un champ déclaré et optionnel
    # ne casse rien — `{}` et `{"period": …}` restent valides, et le client existant passe sans
    # une ligne de modification.
    subject_id: int | None = None


class EquipNotionRequest(BaseModel):
    """`POST /api/reports/class-council/equip-notion` : génère + auto-valide le kit d'UNE notion."""

    model_config = ConfigDict(extra="forbid")

    skill_id: int


class EquipPieceError(BaseModel):
    piece: str
    message: str


class EquipNotionResult(BaseModel):
    skill_id: int
    skill_name: str
    has_lesson: bool
    generated: list[str] = Field(default_factory=list)
    skipped: list[str] = Field(default_factory=list)
    errors: list[EquipPieceError] = Field(default_factory=list)
    reason: str | None = None


class CreateMissionsFromRecoRequest(BaseModel):
    """`POST /api/reports/class-council/create-missions` : une recommandation → missions
    mono-notion via le flux Commander (ADR-0018). La validation Papa = ce clic."""

    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    due_date: date | None = None
    force_priority: bool = False


class CreateChampionRequest(BaseModel):
    """`POST /api/reports/class-council/create-champion` (ADR-0022 §8) : une recommandation croisée
    → UNE mission `champion` multi-matières. Les notions sont déjà équipées (boucle `equip-notion`)."""

    model_config = ConfigDict(extra="forbid")

    skill_ids: list[int]
    flavor: str = "consolidation"


# --- Réponses (surface Papa) ---------------------------------------------------------------


class CouncilRecommendationOut(BaseModel):
    skill_ids: list[int]
    skill_names: list[str]
    mission_type: str
    template_hint: str | None = None
    justification: str


class CouncilTransitionOut(BaseModel):
    """Une bascule de palier, telle que le SERVEUR l'a mesurée (`evidence.mastery_transitions`)."""

    skill_id: int
    skill_name: str
    # `None` sur la plus ancienne bascule tracée d'une notion : `skill_mastery_history` ne stocke
    # que le statut d'ARRIVÉE, et prétendre connaître l'origine serait une invention.
    from_: str | None = Field(default=None, alias="from")
    to: str
    changed_at: str

    model_config = ConfigDict(populate_by_name=True)


class CouncilEvolutionOut(BaseModel):
    """`recent_evolution` d'un rapport **v4 ou plus** (adr-0040 §8)."""

    # ⚠️ `history_since`, JAMAIS `period` (§9). `period` est une étiquette qui ne sélectionne
    # aucune donnée ; ceci est une date réelle. Les fondre rendrait indétectable, demain, le défaut
    # qu'on corrige aujourd'hui.
    since: str | None = None
    transitions: list[CouncilTransitionOut] = Field(default_factory=list)
    # Seule part du modèle. `None` = il n'a rien commenté ; la liste, elle, se rend quand même.
    comment: str | None = None


class CouncilSubjectOut(BaseModel):
    subject_id: int
    subject_name: str
    strengths: str
    to_reinforce: str
    # 🔴 **Union, et les trois branches sont nécessaires** :
    #   · `CouncilEvolutionOut` — un rapport v4+, avec ses bascules datées ;
    #   · `str` — un rapport FIGÉ avant le Lot 3, dont `subjects_json` porte une chaîne. Un type
    #     qui n'accepterait que la structure ferait échouer la lecture de TOUT l'historique. Aucune
    #     réécriture (§8) : la marque de lecture `< v3` dit à l'écran ce que vaut cette prose ;
    #   · `None` — l'évidence ne portait aucune bascule. L'écran rend cette absence par une PHRASE
    #     (la borne de trace), jamais par un blanc : une section vide se lirait « aucun mouvement »,
    #     or c'est « aucune trace ». Les deux ne se corrigent pas l'un l'autre.
    recent_evolution: CouncilEvolutionOut | str | None = None
    recommendations: list[CouncilRecommendationOut] = Field(default_factory=list)


class CouncilReportOut(BaseModel):
    id: int
    period: str
    # `None` = rapport GLOBAL. Une valeur = rapport CIBLÉ sur une matière.
    subject_id: int | None = None
    subject_name: str | None = None
    global_summary: str
    subjects: list[CouncilSubjectOut] = Field(default_factory=list)
    prompt_version: str
    created_at: datetime | None = None


class CouncilReportListItem(BaseModel):
    id: int
    subject_id: int | None = None
    subject_name: str | None = None
    period: str
    subjects_count: int
    created_at: datetime | None = None
    # ⚠️ Défauté à `""` et non requis : la liste doit continuer de se sérialiser si un rapport
    # ancien n'avait pas de version. Le client traite l'absence comme « antérieur au daté ».
    prompt_version: str = ""
