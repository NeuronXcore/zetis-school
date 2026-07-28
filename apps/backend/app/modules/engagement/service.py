"""Engagement d'une ressource dans une mission en cours — substrat neutre, read-only.

**Le gate porte sur la découverte, jamais sur l'achèvement d'un parcours engagé.**
(addendum ADR-0009 §A, addendum ADR-0016 §6 règle 1.)

Le gate `validated` garantit qu'un contenu non relu n'atteint pas Massimo. Mais appliqué
sans nuance, il casse une mission DÉJÀ COMMENCÉE : Papa édite une carte mentale, elle
repasse `pending`, l'étape de reconstruction devient incomplétable (l'ADR-0019 §2 exige une
`MindmapAttempt` postérieure au `start`) — la mission n'a plus de verdict et Massimo reste
bloqué sur un parcours mort, du fait d'une action de Papa.

Ce module répond à UNE question, factuelle : cette ressource est-elle référencée par une
étape d'une mission **active** ? Les modules dérivés s'en servent pour ouvrir une exception
**nommée** à leur gate de lecture, sur les chemins d'**achèvement** uniquement — jamais sur
les routes de découverte (decks, résumés, listes), d'où la ressource doit bien disparaître.

Module NEUTRE : il n'importe **aucun** consommateur (`mindmaps/`, `fiches/`…) ni le module
`missions/` — seulement les modèles. Ce sont les consommateurs qui l'importent. Read-only :
il ne décide rien, n'écrit rien, ne trace rien (patron `evidence/`, ADR-0011 §1).
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Mission, MissionStep

# Statut d'une mission ENGAGÉE : `planned` → `active` au POST /start, → `completed` à la fin
# (`missions/service.py`). Seule `active` ouvre l'exception : une mission jamais démarrée n'a
# pas de parcours à protéger, une mission terminée n'en a plus.
ACTIVE_MISSION_STATUS = "active"

# Types d'étape dont le `resource_id` désigne un contenu GATÉ, donc susceptible de devenir
# illisible en cours de mission. Miroir de `missions.service.STEP_*` — deux constantes courtes
# dupliquées plutôt qu'un import du service `missions` (module lourd, et la neutralité de ce
# substrat interdit d'en dépendre). Un test-verrou vérifie qu'elles ne divergent pas.
STEP_MINDMAP = "mindmap"
STEP_LESSON = "lesson"


def is_engaged_in_active_mission(
    db: Session,
    *,
    step_type: str,
    resource_id: int | None,
    student_id: int | None = None,
) -> bool:
    """La ressource est-elle la cible d'une étape d'une mission active ?

    `student_id` restreint au parcours d'un élève donné ; omis, la question porte sur toute
    mission active (suffisant tant que ZETIS est mono-élève, mais le paramètre existe pour
    que le passage multi-enfant n'ait rien à rouvrir ici).
    """
    if resource_id is None:
        return False
    stmt = (
        select(MissionStep.id)
        .join(Mission, Mission.id == MissionStep.mission_id)
        .where(
            MissionStep.step_type == step_type,
            MissionStep.resource_id == resource_id,
            Mission.status == ACTIVE_MISSION_STATUS,
        )
        .limit(1)
    )
    if student_id is not None:
        stmt = stmt.where(Mission.student_id == student_id)
    return db.scalar(stmt) is not None
