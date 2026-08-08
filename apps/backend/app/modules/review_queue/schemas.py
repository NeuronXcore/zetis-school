"""Contrats de la file de relecture (ADR-0039).

Le payload ne sert que des **noms** — aucun contenu, aucun `spec_json`, aucun markdown. C'est la
même règle que l'addendum ADR-0028 §2 : une file sert à décider par quoi commencer, pas à lire.
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# ⚠️ `diagnostic`, pas « quiz » (ADR-0043) : les quiz de mission et de fin de cours restent hors
# gate. Ce `Literal` est le garde-fou qui a fait rougir la 6ᵉ famille avant qu'elle n'atteigne
# l'écran — le garder fermé vaut mieux qu'un `str` libre.
ReviewKind = Literal["lesson", "fiche", "mindmap", "capsule", "chapter", "diagnostic"]


class ReviewItemOut(BaseModel):
    """Un objet produit qui n'atteint pas encore Massimo.

    Le fil de rattachement (`subject › chapter › lesson`) est **partiel par nature** : un chapitre
    n'a pas de leçon parente, une capsule peut n'être rattachée à aucun chapitre. Les `None` sont
    l'information, pas un trou à combler côté client.

    **Aucun `href`** : `apps/frontend-papa/src/lib/pilotageLinks.ts` porte déjà la convention
    d'adressage `?subject=&focus=`, testée. En servir un ici en ferait une seconde règle
    concurrente pour les mêmes destinations (ADR-0039 §5).
    """

    kind: ReviewKind
    id: int
    title: str
    subject_id: int | None = None
    subject: str | None = None
    subject_slug: str | None = None
    chapter_id: int | None = None
    chapter: str | None = None
    lesson_id: int | None = None
    lesson: str | None = None
    created_at: datetime | None = None


class ReviewCountsOut(BaseModel):
    """Compteurs par famille — **jamais filtrés** par `kind` ni `subject_id` (ADR-0039 §4)."""

    lesson: int = 0
    fiche: int = 0
    mindmap: int = 0
    capsule: int = 0
    chapter: int = 0
    diagnostic: int = 0
    total: int = 0


class ReviewSubjectRef(BaseModel):
    id: int
    name: str
    slug: str


class ReviewQueueOut(BaseModel):
    counts: ReviewCountsOut
    subjects: list[ReviewSubjectRef]
    items: list[ReviewItemOut]
