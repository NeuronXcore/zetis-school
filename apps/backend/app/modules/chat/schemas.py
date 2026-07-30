"""Schémas d'entrée/sortie du chat (ADR-0026, slice A).

Aucun schéma ne transporte de verbatim vers une couche durable : ce sont des DTO de requête HTTP.
La réponse d'un tour porte le texte que ZETIS vient de dire — il vit dans Redis, pas en base.
"""

from typing import Literal

from pydantic import BaseModel, Field


class ChatSessionOut(BaseModel):
    """Ouverture de session. `transparency` = la phrase FIXE de l'asymétrie (§5), affichée par
    l'UI (slice B) : Massimo sait ce qui est retenu."""

    session_id: str
    transparency: str


class ChatToolResponse(BaseModel):
    """Réponse de Massimo à une proposition d'outil — un ACTE, tracé tel quel (§2)."""

    tool_type: str
    accepted: bool


class ChatMessageIn(BaseModel):
    """Un tour. Soit un message texte, soit une réponse à une proposition d'outil (ou les deux :
    Massimo peut accepter une fiche ET continuer à parler)."""

    text: str | None = Field(default=None, max_length=4000)
    tool_response: ChatToolResponse | None = None


class ChatSpeechIn(BaseModel):
    """Texte à synthétiser en voix (Lot 2). C'est la réponse de ZETIS (jamais un propos de
    Massimo) — pas une donnée privée. L'audio est produit à la volée et JAMAIS persisté."""

    text: str = Field(min_length=1, max_length=2000)


class ChatAction(BaseModel):
    """Action d'orchestration (ADR-0027) — **ancrée serveur, jamais hallucinée**.

    `navigate` : une destination construite serveur depuis un id VALIDÉ (`route` = chemin d'app,
    ex. `/eli5?skill_id=3`). `show_data` : le **front** récupère l'endpoint existant et rend une
    carte inline (`data ∈ agenda|reviews|missions`) — le backend reste aveugle au contenu (§1c)."""

    kind: Literal["navigate", "show_data"]
    label: str
    route: str | None = None
    data: str | None = None
    # `confirm=True` : offre IMPLICITE (ZETIS propose parce que Massimo a nommé une notion) →
    # toujours une carte à taper, même à la voix. `confirm=False` : demande EXPLICITE
    # (« montre/ouvre ») → auto-navigation autorisée à la voix. (ADR-0027, correctif 2026-07-30.)
    confirm: bool = False


class ChatMessageOut(BaseModel):
    """Réponse d'un tour. `skill_id` = notion ancrée (None si non résolue — best-effort §6).
    `tool_suggestion` = outil proposé par ZETIS (vide si aucun). `action` = orchestration ancrée
    (navigate/show_data) ou None (ADR-0027)."""

    session_id: str
    turn_index: int
    reply: str
    skill_id: int | None = None
    tool_suggestion: str | None = None
    difficulty_declared: bool = False
    action: ChatAction | None = None
