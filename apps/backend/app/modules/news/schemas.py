"""Schémas du témoin de nouveauté en navigation (ADR-0030)."""

from pydantic import BaseModel


class NewsSummary(BaseModel):
    """`GET /api/student/news/summary` — des entiers bruts, rien d'autre.

    Un badge de navigation compte ce qui est **NOUVEAU** (naît d'un geste de Papa ou du système,
    meurt d'un **regard** de Massimo), **jamais** ce qui est **DÛ** (naît d'une date franchie, ne
    meurt que du travail, grossit quand Massimo ne vient pas). La seconde colonne est la
    définition d'une relance : interdite sur les deux interfaces.

    Avant d'ajouter un champ ici, lui appliquer le test du §1 : *une date qui passe sans que
    Massimo agisse change-t-elle ce nombre ?* Si oui, ce n'est pas un témoin de nouveauté.

    🔴 **Et ce test ne suffit PAS — il ne couvre qu'une des deux dimensions de la règle.** Il
    interroge le **temps** ; la règle interroge aussi la **mort du compteur** : meurt-il d'un
    REGARD, ou du TRAVAIL ? `diagnostic` répond « non » au premier et « du travail » au second :
    il a donc franchi cette porte-ci sans encombre, et c'est une **décision** qui l'a autorisé
    (`adr-0030-temoins-nouveaute-navigation.md` (Amendement 1)), pas ce test. Poser les deux questions.

    Pas de `total` (aucune surface ne l'affiche, et il inviterait à un badge global qui ne
    renverrait nulle part), pas de date, pas de `due_*`, pas de `done_*`. Les compteurs sont
    EXACTS : le plafond « 9+ » est de la présentation, côté client.
    """

    agenda: int
    #: Cours validés jamais ouverts. `adr-0030-temoins-nouveaute-navigation` (Amendement 2) — meurt d'un REGARD.
    matieres: int
    #: Notions jamais expliquées en ELI5. `adr-0030-temoins-nouveaute-navigation` (Amendement 3) — meurt d'un REGARD.
    #: ⚠️ Sans rapport avec le `new_count` de récence de `student_notions_summary`.
    eli5: int
    #: Quiz jouables jamais OUVERTS. `adr-0030-temoins-nouveaute-navigation` (Amendement 4) — meurt d'un REGARD.
    #: ⚠️ Jamais « jamais joués » : `QuizAttempt` n'entre pas dans ce compteur.
    quiz: int
    fiches: int
    capsules: int
    revision: int
    missions: int
    mindmaps: int
    #: ⚠️ EXCEPTION NOMMÉE — meurt du travail, pas d'un regard. Voir `new_diagnostics_count`.
    diagnostic: int
