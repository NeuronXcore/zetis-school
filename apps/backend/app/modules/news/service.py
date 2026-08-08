"""Agrégateur des témoins de nouveauté (ADR-0030 §5).

Module en **LECTURE PURE** : aucune requête SQL, aucune écriture, aucune table à lui. Il compose
**sept** compteurs qui vivent chacun dans le module propriétaire de sa donnée. Le précédent d'un
module agrégateur sans table est `modules/dashboard`.

⚠️ Le nombre a bougé deux fois sans que ces docstrings suivent (cinq à l'écriture, six avec
`mindmaps`, sept avec `diagnostic`) : ne pas écrire le compte en toutes lettres ailleurs qu'ici.

Pourquoi aucune écriture n'entre ici, alors que le geste « Massimo a regardé l'agenda » est le
pendant naturel de ce compteur : la lecture du badge est faite au montage du layout, avant tout
regard. Si elle marquait l'agenda vu, le badge retomberait à zéro sans que rien n'ait été lu.
Le geste vit chez `agenda` (`mark_agenda_seen`), déclenché par les surfaces qui affichent
réellement le contenu.
"""

from sqlalchemy.orm import Session

from app.modules.agenda import service as agenda_service
from app.modules.capsules import service as capsules_service
from app.modules.diagnostics import service as diagnostics_service
from app.modules.fiches import service as fiches_service
from app.modules.memory import service as memory_service
from app.modules.mindmaps import service as mindmaps_service
from app.modules.missions import service as missions_service

#: Les SEPT sources du témoin, nommées et inspectables.
#:
#: Ce registre existe **POUR ÊTRE LU PAR UN TEST** : le test-verrou de l'ADR-0030 §Suivi lit le
#: SOURCE de ces fonctions pour vérifier qu'aucune ne consomme d'échéance. La sortie, elle,
#: est un entier — elle ne peut pas trahir d'où elle vient. Aplatir ce dict en appels
#: directs rendrait le verrou aveugle : ne pas le faire.
#:
#: Ajouter une entrée = ajouter le champ correspondant dans `NewsSummary` (un test vérifie que
#: les deux ensembles coïncident) ET faire passer au compteur le test du §1.
#:
#: 🔴 **`diagnostic` est une EXCEPTION NOMMÉE, et la seule.** Il meurt du TRAVAIL, pas d'un
#: regard — colonne interdite de l'`adr-0030 §1`, ouverte par décision du commanditaire
#: (`adr-0030-addendum-temoin-diagnostic.md`). ⚠️ Il **passe** le test du §1 (aucune date ne le
#: fait bouger) : ce n'est donc pas ce test qui l'a autorisé, c'est la décision. Ne pas en
#: déduire qu'un compteur de non-faits est désormais recevable ici — `test_news_doctrine.py`
#: porte le verrou qui l'interdit à tous les autres.
NEWS_SOURCES = {
    "agenda": agenda_service.new_agenda_count,
    "fiches": fiches_service.new_fiches_count,
    "capsules": capsules_service.new_capsules_count,
    "revision": memory_service.new_cards_count,
    "missions": missions_service.new_missions_count,
    "mindmaps": mindmaps_service.new_mindmaps_count,
    "diagnostic": diagnostics_service.new_diagnostics_count,
}


def news_summary(db: Session, student_id: int) -> dict:
    """Tous les compteurs en un seul appel.

    UN appel réseau pour la page la plus visitée, monté une fois dans le shell côté client —
    l'alternative (un appel par page au montage du layout) était cinq allers-retours pour un
    objet décoratif.
    """
    return {key: source(db, student_id) for key, source in NEWS_SOURCES.items()}
