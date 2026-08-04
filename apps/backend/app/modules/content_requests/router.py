"""Routes de la liste d'attente de contenus (addendum ADR-0027).

Deux routeurs, deux rôles, **asymétriques par décision** :

- Papa (`require_parent`) **lit et trie** — c'est sa file de travail ;
- Massimo (`require_child`) **écrit seulement** — aucun `GET`, aucun `PATCH`.

L'asymétrie n'est pas une simplification de v1, c'est le fond : la file de Papa n'est pas une
surface de l'enfant. Un « refusé » visible serait le vocabulaire d'échec que ZETIS s'interdit, et
une liste de demandes en attente transformerait une file de travail en écran d'attente — ZETIS
transmet, il ne promet pas.

Jusqu'au 2026-08-01, l'enfant n'émettait que par **effet de bord** du chat (`chat/service.py`,
best-effort) : il subissait la demande sans savoir qu'il venait de la faire. La page matière rend
le geste explicite — d'où cette route, et d'où `source` qui distingue les deux origines.

Les mutations passent par ce module, **jamais** par `production` (invariant read-only préservé).
"""

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_child, require_parent
from app.modules.content_requests import service
from app.modules.content_requests.schemas import (
    ContentRequestOut,
    ContentRequestPatch,
    StudentContentRequestIn,
    StudentContentRequestOut,
)
from app.modules.eli5.service import get_default_student

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/content-requests",
    tags=["content-requests"],
    dependencies=[Depends(require_parent)],
)

# ⚠️ Ce routeur ne porte QU'UNE route, et c'est un `POST`. Ne pas y ajouter de `GET` « mes
# demandes » : ce serait exposer `dismissed` à l'enfant et faire d'une file de travail parent un
# écran d'attente. La décision est dans l'addendum ADR-0027, un test vérifie l'absence.
student_router = APIRouter(
    prefix="/api/student/content-requests",
    tags=["content-requests-student"],
    dependencies=[Depends(require_child)],
)


@student_router.post("", response_model=StudentContentRequestOut)
def create_student_content_request(
    body: StudentContentRequestIn, db: Session = Depends(get_db)
) -> dict:
    """Massimo demande à Papa un ou plusieurs contenus sur une notion qu'il voit.

    « Tout ce qui manque » tient en **un** appel. 422 si le vocabulaire ou le plafond est
    dépassé ; 404 (et aucune ligne) si la notion n'est pas visible de l'élève.
    """
    student = get_default_student(db)
    requested = service.create_student_requests(
        db,
        student_id=student.id,
        skill_id=body.skill_id,
        content_kinds=body.content_kinds,
    )
    return {"requested": requested}


def _fermer_ce_qui_est_servi(db: Session, status: str | None) -> None:
    """Ménage OPPORTUNISTE : referme les demandes dont le contenu est devenu disponible.

    ## Pourquoi à la lecture, et pas seulement après un lot

    L'ADR-0036 §4 a posé la règle — *« le gate est la DISPONIBILITÉ, jamais le statut »* — mais ne
    l'a câblée qu'**au chemin de succès d'un lot** (`runner._close_served_requests`). Or ZETIS n'est
    pas le seul à produire : Papa rédige un cours depuis Programme, génère une fiche depuis sa page
    de pilotage, le Conseil de classe équipe hors lot. Dans tous ces cas, le contenu demandé
    existait **et la demande restait ouverte pour toujours** — alors que la page promet en toutes
    lettres qu'elle « se refermera d'elle-même quand le contenu sera réellement consultable ».

    Le défaut s'est aggravé le 2026-08-04, quand une demande bloquée s'est mise à renvoyer Papa
    vers `/programme` pour écrire le cours : on l'envoyait faire le geste qui satisfait la demande,
    et la demande ne bougeait pas.

    ## Pourquoi c'est une écriture dans un GET, et pourquoi c'est acceptable ici

    Patron de `runs.close_stale_runs`, appelé « de façon OPPORTUNISTE avant de créer un lot —
    jamais périodiquement », avec ce motif : *« c'est le seul moment où l'on sait qu'un humain
    regarde »*. Même raisonnement, même forme : pas d'ordonnanceur, pas de tâche de fond, le ménage
    se fait quand quelqu'un ouvre la file.

    ⚠️ **Aucune règle nouvelle** : on appelle `close_available_requests`, le prédicat unique déjà
    écrit. Rien n'est recalculé ici, donc rien ne peut diverger de ce que fait un lot.

    ⚠️ **Seulement sur la file `pending`.** Consulter l'historique (`done`, `dismissed`) ne doit
    rien modifier — une lecture d'archive n'est pas un moment de ménage.

    ⚠️ **Et il ne fait jamais tomber la lecture** : la file de Papa doit s'afficher même si le
    ménage échoue. Même arbitrage que `_close_served_requests`, pour la même raison.
    """
    if status != "pending":
        return
    try:
        service.close_available_requests(db)
    except Exception:  # noqa: BLE001 — le ménage ne commande pas l'affichage de la file
        logger.exception("content_requests: fermeture opportuniste impossible")


@router.get("", response_model=list[ContentRequestOut])
def list_content_requests(
    status: str | None = "pending", db: Session = Depends(get_db)
) -> list[dict]:
    """Demandes de contenu de l'enfant (par défaut celles en attente), récentes d'abord."""
    _fermer_ce_qui_est_servi(db, status)
    return service.list_requests(db, status)


@router.get("/count")
def content_requests_count(db: Session = Depends(get_db)) -> dict:
    """Nombre de demandes en attente — alimente la pastille de notification de la sidebar Papa.

    Le ménage est fait ici AUSSI : sans lui, la pastille annoncerait « 1 » pendant que la page,
    elle, n'a plus rien à montrer. Deux surfaces, une seule vérité.
    """
    _fermer_ce_qui_est_servi(db, "pending")
    return {"pending": service.pending_count(db)}


@router.patch("/{request_id}", response_model=ContentRequestOut)
def patch_content_request(
    request_id: int, body: ContentRequestPatch, db: Session = Depends(get_db)
) -> dict:
    """Triage : marquer une demande done (contenu produit) ou dismissed (ignorée)."""
    return service.set_status(db, request_id, body.status)
