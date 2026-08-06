"""L'activité de production (ADR-0041 §13) — `require_parent`.

Routeur **distinct** des deux autres, pour la même raison qui les avait déjà séparés :
`production/router.py` est documenté « LECTURE SEULE » et un test le garantit ; `runs_router` est
l'écriture des LOTS. Ici on lit l'activité de **tous** les producteurs, et on porte un seul geste
d'écriture — l'acquittement d'un échec.

⚠️ Aucune surface Massimo (§12). `require_parent` de bout en bout.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.queue import production_worker_alive, render_worker_alive
from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import activity

router = APIRouter(
    prefix="/api/production/activity",
    tags=["production"],
    dependencies=[Depends(require_parent)],
)


@router.get("")
def get_activity(db: Session = Depends(get_db)) -> dict:
    """Ce que ZETIS fabrique en ce moment — la source unique de toutes les barres.

    ⚠️ **La question du worker n'est posée que s'il y a quelque chose EN FILE.** Un travail
    `running` a forcément quelqu'un qui l'exécute : demander à Redis serait un aller-retour pour
    une réponse connue. Et sans rien en attente, l'absence de worker n'est un problème pour
    personne. Le patron vient de `/runs/active`, qui le porte depuis le 2026-08-05.
    """
    etat = activity.read(db)
    en_file = (etat["current"] or {}).get("status") == "queued"
    # `None` = « la question n'a pas été posée ». Le client teste `=== false`, jamais la falsité :
    # confondre les deux ferait dire « arrêté » à chaque fois qu'on ne sait pas.
    etat["worker_alive"] = production_worker_alive() if en_file else None
    # Le couloir média se demande à part, et seulement s'il y a un rendu qui attend (§22) : son
    # worker est un autre processus, sur une autre file. Le confondre avec celui de production a
    # laissé une capsule attendre sous un indicateur qui disait que tout allait bien.
    media_en_file = any(
        t["lane"] == "media" and t["status"] == "queued"
        for t in ([etat["current"]] if etat["current"] else []) + etat["queued"]
    )
    etat["media_alive"] = render_worker_alive() if media_en_file else None
    return etat


@router.post("/{kind}/{item_id}/ack", status_code=204)
def acknowledge(kind: str, item_id: int, db: Session = Depends(get_db)) -> None:
    """« J'ai vu. » Un échec reste affiché jusqu'ici, et ne revient plus (§8).

    Serveur et non `localStorage` : un acquittement par navigateur reviendrait au prochain
    appareil, et « rien ne doit se perdre » deviendrait « rien ne doit se perdre ici ».
    """
    activity.acknowledge(db, kind=kind, item_id=item_id)
