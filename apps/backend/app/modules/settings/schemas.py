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
    #: Le NIVEAU, DÉRIVÉ des valeurs — jamais stocké. `null` = « sur mesure ».
    #:
    #: ⚠️ S'appelait `preset` jusqu'au 2026-08-04. Renommé avec le reste du vocabulaire (addendum
    #: ADR-0032 §8.0) : un NIVEAU est l'un des trois régimes, un PALIER est le degré 0-3 d'une
    #: classe. Le seul consommateur de cet endpoint est `frontend-papa` — aucun contrat externe.
    niveau: str | None = None
    #: ⚠️ **Champ SÉPARÉ de `classes`, délibérément** (ADR-0035 §5) : ce n'est pas un palier mais
    #: une autre question — « ZETIS a-t-il le droit de DÉMARRER seul ? » là où les paliers disent
    #: « a-t-il le droit de SERVIR sans relecture ? ». Le mettre dans `classes` ferait qu'un
    #: préréglage l'armerait, et le front le rendrait comme un palier à 4 valeurs.
    auto_trigger_enabled: bool = False


class AutonomyRequest(BaseModel):
    """Écriture partielle : on n'envoie que ce qui change.

    Pas de champ `niveau` : un niveau est un raccourci d'ÉCRITURE côté client, qui se traduit
    en valeurs. L'accepter ici en ferait un second chemin d'écriture — donc une seconde source de
    vérité pour la même question.
    """

    values: dict[str, int] = {}
    #: Bascule du déclencheur automatique. **Optionnel et séparé de `values`** : `write_autonomy`
    #: rejette toute clé hors des six paliers, et cette clé n'en est pas un. `None` = ne pas y
    #: toucher — envoyer un préréglage ne doit jamais armer ZETIS au passage.
    auto_trigger_enabled: bool | None = None
