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

`set_mastery_status` est une **fonction pure** : aucun accès DB, aucun commit. L'appelant possède
déjà sa ligne et son `now`. `record_mastery_transition` en est le pendant qui touche la session —
la séparation est volontaire, elle garde la règle d'horodatage testable sans base.
"""

from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import SkillMastery, SkillMasteryHistory

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


def record_mastery_transition(
    db: Session, mastery: SkillMastery, status: str, now: datetime
) -> bool:
    """Applique le statut ET journalise la bascule si le statut change réellement.

    C'est ce que les quatre modules évaluatifs doivent appeler : `set_mastery_status` reste
    disponible pour les tests de la règle d'horodatage, mais un appel direct depuis un service
    laisserait un trou dans l'historique.

    **Une ligne par changement, jamais par passage.** `quizzes/scoring.py` réévalue la maîtrise à
    chaque quiz de fin de cours ; sans ce garde-fou, l'historique enflerait d'une ligne identique
    par quiz et la courbe des fragiles compterait des « bascules » qui n'en sont pas.

    Ajout à la session sans commit — l'appelant commite (convention `log_learning_event`). Renvoie
    `True` si une bascule a été journalisée, pour que les tests aient une prise directe.
    """
    previous = mastery.status
    set_mastery_status(mastery, status, now)
    if previous == status:
        return False
    db.add(
        SkillMasteryHistory(
            student_id=mastery.student_id,
            skill_id=mastery.skill_id,
            status=status,
            # `or 0.0` : la ligne peut être neuve et non encore flushée, auquel cas le défaut de
            # colonne n'est pas appliqué et l'attribut vaut None.
            mastery_score=mastery.mastery_score or 0.0,
            changed_at=now,
        )
    )
    return True
