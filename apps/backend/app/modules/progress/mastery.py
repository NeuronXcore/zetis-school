"""Transition de statut d'une notion — point de passage UNIQUE pour horodater `mastered_at`.

Quatre modules écrivent `SkillMastery.status` (diagnostic, quiz, ELI5 reverse, mission). Sans un
endroit unique, la règle d'horodatage serait recopiée quatre fois et divergerait à la première
modification.

**Le piège que ce module existe pour éviter.** `quizzes/scoring.py` réévalue la maîtrise à CHAQUE
quiz de fin de cours. Si `mastered_at` était re-tamponné à chaque passage, un élève régulier
verrait sa date repoussée indéfiniment, et « notions consolidées cette semaine » recompterait
éternellement les mêmes notions. Le levier « rendre visible le progrès réel » afficherait alors un
chiffre faux — exactement ce que ce chantier corrige.

**Invariant** : `mastered_at IS NOT NULL` ⟺ `status == "mastered"` ET la date de bascule est
connue. Les lignes antérieures à la migration restent à `NULL` : « consolidée avant qu'on sache
dater ». Elles comptent dans le STOCK de notions consolidées, jamais dans une SEMAINE — ce qui
évite de gonfler le premier compteur affiché à Massimo avec des acquis anciens.

Fonction pure : aucun accès DB, aucun commit. L'appelant possède déjà sa ligne et son `now`.
"""

from datetime import datetime

from app.db.models import SkillMastery

MASTERED = "mastered"


def set_mastery_status(mastery: SkillMastery, status: str, now: datetime) -> None:
    """Applique un statut de maîtrise en tenant `mastered_at` à jour.

    - entrée dans `mastered` depuis un autre statut → on tamponne ;
    - `mastered` → `mastered` → **on ne touche à rien** (la consolidation date de la PREMIÈRE
      fois, pas de la dernière confirmation) ;
    - sortie de `mastered` → on efface (la date ne doit pas survivre à la régression, sinon elle
      ment sur l'état courant) ;
    - ligne héritée (`mastered` sans date) re-confirmée → reste sans date, faute de mieux.
    """
    was_mastered = mastery.status == MASTERED

    if status == MASTERED and not was_mastered:
        mastery.mastered_at = now
    elif status != MASTERED and was_mastered:
        mastery.mastered_at = None

    mastery.status = status
