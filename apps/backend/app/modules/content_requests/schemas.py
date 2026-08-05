from datetime import datetime
from typing import Literal

from pydantic import BaseModel

from app.modules.production.schemas import ProductionRunOut

# Vocabulaire FERMÉ, en dur dans le schéma : une valeur hors liste est rejetée par FastAPI en
# `422` avant d'atteindre le service. C'est le garde-fou n°1 de l'addendum ADR-0027, et le poser
# ici plutôt que dans du code impératif le rend impossible à contourner par un futur appelant.
# ⚠️ Doit rester aligné sur `service.CONTENT_KINDS` — un test-verrou compare les deux.
ContentKind = Literal["cours", "fiche", "mindmap", "quiz", "capsule", "card"]


class ContentRequestOut(BaseModel):
    """Une demande de contenu de l'enfant, enrichie pour le badge Papa (Couverture)."""

    id: int
    skill_id: int
    skill_name: str | None = None
    subject_id: int | None = None
    subject_name: str | None = None
    content_kind: str  # cours|fiche|mindmap|quiz|capsule|card
    status: str  # pending|done|dismissed
    source: str
    created_at: datetime
    #: ZETIS sait-il produire ce type tout seul ? (ADR-0036 §3) `False` pour `capsule`, dont le
    #: générateur exige une INSTRUCTION en texte libre que la demande ne porte pas. **Verdict
    #: serveur** : l'écran l'affiche, il ne le déduit pas.
    producible: bool = True
    #: Pourquoi un lot lancé MAINTENANT ne produirait rien — ou `None` s'il produirait (addendum
    #: ADR-0036). `producible` répond du TYPE, celui-ci de la SITUATION : palier, leçon rattachée,
    #: cours rédigé. Calculé par le code même que le lot exécutera (`runner.blockers_for`), sans
    #: quoi l'aperçu divergerait de l'exécution qu'il annonce.
    blocked_reason: str | None = None
    #: Le lot qui produit CE contenu en ce moment, ou `None`. Redérivé serveur à chaque lecture
    #: par `(skill_id, piece)` — un lot `manual` ne porte aucune FK vers la demande. C'est lui qui
    #: permet à l'écran de retrouver sa barre d'avancement après une navigation, au lieu de
    #: l'oublier avec l'état du composant.
    active_run: ProductionRunOut | None = None


class ContentRequestPatch(BaseModel):
    """Triage Papa : done (contenu produit) | dismissed (ignorée) | pending."""

    status: str


class StudentContentRequestIn(BaseModel):
    """Ce que Massimo demande depuis la page matière : une notion, un ou plusieurs contenus.

    Plusieurs `content_kinds` en un appel, parce que « demander à Papa tout ce qui manque » est
    UN geste de l'enfant — le découper en sept requêtes en ferait sept gestes dans la file.
    """

    skill_id: int
    content_kinds: list[ContentKind]


class StudentContentRequestOut(BaseModel):
    """Ce qui a été enregistré. **Écriture seule** (addendum ADR-0027) : on renvoie les types
    pris en compte, jamais un statut, jamais un délai, jamais la file de Papa.

    Massimo ne lit pas la liste d'attente : un « refusé » visible serait le vocabulaire d'échec
    que ZETIS s'interdit, et un écran d'attente transformerait une file de travail en promesse.
    """

    requested: list[ContentKind]
