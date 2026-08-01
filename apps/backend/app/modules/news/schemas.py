"""Schémas du témoin de nouveauté en navigation (ADR-0030)."""

from pydantic import BaseModel


class NewsSummary(BaseModel):
    """`GET /api/student/news/summary` — cinq entiers bruts, rien d'autre.

    Un badge de navigation compte ce qui est **NOUVEAU** (naît d'un geste de Papa ou du système,
    meurt d'un **regard** de Massimo), **jamais** ce qui est **DÛ** (naît d'une date franchie, ne
    meurt que du travail, grossit quand Massimo ne vient pas). La seconde colonne est la
    définition d'une relance : interdite sur les deux interfaces.

    Avant d'ajouter un champ ici, lui appliquer le test du §1 : *une date qui passe sans que
    Massimo agisse change-t-elle ce nombre ?* Si oui, ce n'est pas un témoin de nouveauté.

    Pas de `total` (aucune surface ne l'affiche, et il inviterait à un badge global qui ne
    renverrait nulle part), pas de date, pas de `due_*`, pas de `done_*`. Les compteurs sont
    EXACTS : le plafond « 9+ » est de la présentation, côté client.
    """

    agenda: int
    fiches: int
    capsules: int
    revision: int
    missions: int
    mindmaps: int
