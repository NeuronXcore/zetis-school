"""Routeur de réglages NEUTRE (ADR-0032, ADR-0062) — `require_parent`.

Neutre, et c'est le point : les seules routes de réglage du dépôt vivaient sous
`/api/agenda/settings`. Servir l'autonomie de ZETIS depuis le routeur de l'agenda aurait été une
dette immédiate — le premier réglage transversal appelle son propre lieu.

⚠️ **Aucune route élève, et l'absence est la décision** (invariant V1 du §G.4) : montrer un palier
à Massimo, ce serait lui apprendre qu'un contenu peut disparaître.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import require_parent
from app.modules.settings import ecarts, machine, service
from app.modules.settings.schemas import (
    AutonomyOut,
    AutonomyRequest,
    EcartsOut,
    MachineOut,
    SuspensionOut,
    SuspensionRequest,
    TestMoteurOut,
)

router = APIRouter(
    prefix="/api/settings", tags=["settings"], dependencies=[Depends(require_parent)]
)


def _out(db: Session, values: dict[str, int]) -> dict:
    return {
        "auto_trigger_enabled": service.auto_trigger_enabled(db),
        # Lu ici pour la SIDEBAR (ADR-0063 §6) ; le geste, lui, vit sur sa propre route.
        "production_suspended": service.production_suspended(db),
        "classes": [
            {
                "key": cls.key,
                "code": cls.code,
                "label": cls.label,
                "value": values[cls.key],
                "choices": list(cls.choices),
                "locked": cls.locked,
                "reason": cls.reason,
            }
            for cls in service.AUTONOMY_CLASSES
        ],
        "niveau": service.niveau_de(values),
    }


@router.get("/autonomy", response_model=AutonomyOut)
def get_autonomy(db: Session = Depends(get_db)) -> dict:
    """Les six paliers, leurs choix et leurs verrous, plus le déclencheur automatique.

    Aucune écriture, aucun back-fill.
    """
    return _out(db, service.read_autonomy(db))


@router.put("/autonomy", response_model=AutonomyOut)
def set_autonomy(req: AutonomyRequest, db: Session = Depends(get_db)) -> dict:
    """Écrit une ou plusieurs clés. 422 sur toute valeur hors `choices`, avec son motif.

    Le refus est **explicite et motivé** : une classe verrouillée qu'on tenterait de forcer ne
    doit pas échouer en silence ni être tronquée — l'appelant doit pouvoir afficher pourquoi.

    ⚠️ **Le déclencheur se bascule PAR SON PROPRE CHAMP**, jamais par `values` : il n'est pas un
    palier, et un préréglage ne doit à aucun moment l'armer au passage (ADR-0035 §5). `None` =
    ne pas y toucher.
    """
    values = service.write_autonomy(db, dict(req.values))
    if req.auto_trigger_enabled is not None:
        service.set_auto_trigger_enabled(db, enabled=req.auto_trigger_enabled)
    return _out(db, values)


@router.get("/ecarts", response_model=EcartsOut)
def get_ecarts(db: Session = Depends(get_db)) -> dict:
    """Les clés `app_settings` qui portent une ligne — « ce que j'ai changé » (ADR-0062 §4).

    Aucun calcul : dans cette table, **l'absence de ligne EST la valeur par défaut**. C'est pour
    ça que cette route ne connaît aucun défaut et n'a donc rien à maintenir en phase.

    ⚠️ **Ne rend pas les valeurs.** La page compte et rapproche de sa carte ; elle n'affiche
    jamais une valeur venue d'ici.
    """
    return {"keys": ecarts.cles_ecartees(db)}


@router.get("/machine", response_model=MachineOut)
def get_machine(db: Session = Depends(get_db)) -> dict:
    """🧠 Qui fait quoi, et est-ce que ça tourne — en **un seul appel** (ADR-0062 §2).

    Un instantané cohérent : deux appels rendraient deux instants, et une page qu'on lit pour
    diagnostiquer une panne ne doit pas obliger à recouper ses propres chiffres.

    ⚠️ **Lecture pure.** Aucune écriture, aucun réglage — le routage vit en variables
    d'environnement lues au démarrage. C'est pour ça qu'il n'existe pas de `PUT /machine`.
    """
    return machine.lire(db)


@router.post("/machine/test", response_model=TestMoteurOut)
def post_test_moteur(provider: LLMProvider = Depends(get_provider)) -> dict:
    """Vérifier, plutôt que déclarer — un vrai prompt, une vraie latence, un vrai JSON.

    C'est le seul geste qui prouve que le modèle est réellement *pull* et joignable. Il **ne
    persiste rien** : aucune trace `ai_jobs`, parce que ce n'est pas un travail — c'est une sonde,
    et une sonde qui gonflerait les statistiques de production fausserait le tableau juste
    au-dessus d'elle.
    """
    return machine.tester_moteur(provider)


@router.get("/production-suspension", response_model=SuspensionOut)
def get_production_suspension(db: Session = Depends(get_db)) -> dict:
    """ZETIS est-il suspendu ? Un fait, pas un réglage composé — d'où sa propre route."""
    return {"suspended": service.production_suspended(db)}


@router.put("/production-suspension", response_model=SuspensionOut)
def set_production_suspension(req: SuspensionRequest, db: Session = Depends(get_db)) -> dict:
    """Suspendre ou remettre en route (ADR-0063).

    Ce que la bascule NE fait PAS — et l'écran le dit avant le clic (§7) : elle ne touche pas au
    régime, ne désarme pas le déclencheur, ne défait rien, ne vide pas la file. Un lot en vol
    s'écourte entre deux pièces et se raconte au journal ; les lots en file repartiront à la levée.
    """
    return {"suspended": service.set_production_suspended(db, suspended=req.suspended)}
