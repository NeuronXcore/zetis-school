"""Les refus de régulateur, retenus (addendum 2 ADR-0041 §21).

Les cinq régulateurs de `runs.create_run` lèvent un `409`. Quand **Papa clique**, il en lit le
motif à l'écran, dans la seconde — rien à retenir. Quand **le scan nocturne** se le prend à 3 h du
matin, `triggers.py` l'attrape déjà proprement et le range dans un compte rendu… que personne ne
lit jamais. La journée passe sans que rien n'ait été produit, et sans que rien ne le dise.

C'est ce silence-là que ce module supprime, et lui seul.

## Ce que ce module NE fait PAS, et pourquoi

⚠️ **Il ne retient pas les refus manuels.** Ce serait notifier Papa d'une chose qu'il vient de lire,
et la lui laisser à l'écran après qu'il a compris. Le geste porte déjà sa réponse.

⚠️ **Il ne retient pas les `404`/`422` du même chemin** (chapitre introuvable, profil élève absent,
type de pièce inconnu). Ce ne sont pas des décisions de politique, ce sont des défauts de donnée —
les afficher sous le mot « refusé » ferait passer un bug pour un régulateur qui fonctionne. C'est
`ProductionRefused`, et lui seul, qui décide de ce qui entre ici.

⚠️ **Il ne rejoue rien.** Un refus retenu n'est pas une file d'attente : `triggers` laisse l'item
éligible, et le prochain réveil réessaiera de lui-même. Retenir le refus sert à le DIRE, pas à le
contourner.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models.production import ProductionRefusal

# Au-delà, l'écran ne se lit plus — et le popover borne déjà tout le reste de la même façon.
LIMITE = 20


def record(
    db: Session,
    *,
    trigger: str,
    regulator: str,
    detail: str,
    chapter_id: int | None = None,
    skill_id: int | None = None,
) -> ProductionRefusal | None:
    """Retient un refus AUTOMATIQUE. Rend `None` — sans rien écrire — si l'origine est manuelle.

    ⚠️ **Le filtre est ici, pas chez l'appelant.** Les deux scans sont automatiques par
    construction aujourd'hui ; le jour où un troisième appelant apparaît, c'est cette fonction qui
    doit continuer de dire non, pas la vigilance de celui qui l'écrira.

    ⚠️ **Commite.** Il est appelé depuis un `except` où l'exception a déjà été attrapée : la
    session est propre (les cinq régulateurs gardent AVANT toute écriture du lot) et la boucle de
    scan continue derrière. Rien à annuler, rien à sauver.
    """
    if trigger == "manual":
        return None
    refus = ProductionRefusal(
        trigger=trigger,
        regulator=regulator,
        detail=detail,
        chapter_id=chapter_id,
        skill_id=skill_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(refus)
    db.commit()
    return refus


def unacknowledged(db: Session, *, limit: int = LIMITE) -> list[ProductionRefusal]:
    """Les refus que Papa n'a pas encore vus, du plus récent au plus ancien."""
    return list(
        db.scalars(
            select(ProductionRefusal)
            .where(ProductionRefusal.acknowledged_at.is_(None))
            .order_by(ProductionRefusal.id.desc())
            .limit(limit)
        ).all()
    )


def acknowledge(db: Session, refusal_id: int) -> bool:
    """Papa a vu. Comme pour un échec : serveur, donc il ne revient sur aucun appareil."""
    refus = db.get(ProductionRefusal, refusal_id)
    if refus is None:
        return False
    refus.acknowledged_at = datetime.now(timezone.utc)
    db.commit()
    return True


__all__ = ["record", "unacknowledged", "acknowledge", "LIMITE"]
