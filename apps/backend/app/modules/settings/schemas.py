"""Schémas des réglages d'autonomie (ADR-0032) — Papa uniquement."""

from pydantic import BaseModel


class AutonomyClassOut(BaseModel):
    """Une classe d'objets, son palier, et ce qu'elle autorise.

    `choices` est envoyé au front **pour qu'il n'ait aucune liste en dur** : le serveur refuse ce
    qui n'y est pas, l'interface ne fait que le rendre lisible. `reason` accompagne toujours un
    verrou — un cadenas muet se lit comme une panne.
    """

    key: str
    code: str
    label: str
    value: int
    choices: list[int]
    locked: bool
    reason: str | None = None


class AutonomyOut(BaseModel):
    classes: list[AutonomyClassOut]
    #: Régime DÉRIVÉ des valeurs — jamais stocké. `null` = « sur mesure ».
    preset: str | None = None


class AutonomyRequest(BaseModel):
    """Écriture partielle : on n'envoie que ce qui change.

    Pas de champ `preset` : un préréglage est un raccourci d'ÉCRITURE côté client, qui se traduit
    en valeurs. L'accepter ici en ferait un second chemin d'écriture — donc une seconde source de
    vérité pour la même question.
    """

    values: dict[str, int]
