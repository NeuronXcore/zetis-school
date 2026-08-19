"""Redémarrer un worker de production — le geste sur le PROCESSUS, jamais sur la politique.

## La panne que ce geste répare

Un `SimpleWorker` RQ ne recharge **jamais** le code. Le 2026-08-16, un worker de 163 minutes a
répondu « Aucun exécutant pour "srs_cards_generate" » — un message qui se lit exactement comme un
bug du code, alors que seul le processus était périmé. La colonne « âge » de 🧠 La machine rend le
diagnostic lisible ; ce module fournit le geste qui va avec.

## Pourquoi « redémarrer » n'est offert QUE supervisé

`send_shutdown_command` ARRÊTE un worker ; c'est le superviseur qui le fait revenir. En prod,
`restart: unless-stopped` relance le conteneur **avec le code à jour** — l'arrêt EST le
redémarrage. En dev, le worker est un fils de shell sous `trap` : rien ne le relance, et le même
bouton le tuerait pour de bon. Le backend ne peut pas deviner le déploiement — d'où
`PRODUCTION_WORKER_SUPERVISED`, posé par `docker-compose.prod.yml` et absent partout ailleurs.
**Défaut : refusé, avec son motif** — un cadenas muet se lit comme une panne.

## Ce que l'arrêt fait vraiment (vérifié dans la lib le 2026-08-19)

`Worker.work()` → `bootstrap()` → `self.subscribe()` : tout worker — `SimpleWorker` compris, il ne
surcharge ni `work` ni `subscribe` — écoute son canal de commandes. `send_shutdown_command` y
publie `shutdown`, que le worker traite en **warm shutdown** : la pièce en cours se termine, puis
il sort. Un appel LLM n'est jamais interrompu en vol — c'est la même doctrine que la préemption
(ADR-0031 §3 : prétendre interrompre serait un mensonge d'architecture).

⚠️ Le scan périodique SURVIT au redémarrage sans se dupliquer : `scan_already_planned` garde
l'amorçage (correctif du 2026-08-03, vérifié en vrai — 3 redémarrages, 1 seul réveil planifié).
C'est ce qui rend ce bouton inoffensif ; sans ce correctif, chaque clic aurait ajouté une
récurrence permanente.
"""

from fastapi import HTTPException, status

from app.core.config import settings

# Le motif du refus, écrit UNE fois — c'est lui que l'écran affichera sous le bouton grisé.
MOTIF_NON_SUPERVISE = (
    "Rien ne supervise le worker : l'arrêter ne le ferait pas revenir. "
    "En production, Docker le relance (PRODUCTION_WORKER_SUPERVISED=true) ; "
    "en développement, relancez-le à la main (pnpm dev:worker)."
)


def noms_workers_production() -> list[str]:
    """Les noms des workers vivants sur les files de PRODUCTION — le couloir média n'y est pas.

    ⚠️ `Worker.all()` et jamais `count()` : le dépôt a mesuré que `count()` compte des noms dont
    le hash a expiré (`core/queue.py::production_worker_alive`).
    """
    from rq import Worker

    from app.core.queue import production_queues

    vus: set[str] = set()
    for file in production_queues():
        vus.update(w.name for w in Worker.all(queue=file))
    return sorted(vus)


def redemarrer(name: str) -> dict:
    """Demande l'arrêt gracieux du worker `name`. Le superviseur fait le reste.

    Trois refus, dans l'ordre où ils protègent :
    - **409** si rien ne supervise — un régulateur a dit non, rien n'est cassé (même sémantique
      que les refus de `create_run` : le client les reconnaît au code, jamais au texte) ;
    - **503** si Redis est injoignable — rien n'a été envoyé, et on le dit ;
    - **404** si aucun worker de ce nom n'écoute une file de production.
    """
    if not settings.production_worker_supervised:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=MOTIF_NON_SUPERVISE)

    try:
        noms = noms_workers_production()
    except Exception as exc:  # noqa: BLE001 — le chemin traverse redis ET rq (cf. core/queue.py)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Redis est injoignable : aucune commande n'a été envoyée.",
        ) from exc

    if name not in noms:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail=f"Aucun worker « {name} » sur les files de production.",
        )

    _envoyer_arret(name)
    # 202 côté route : l'ordre est ACCEPTÉ, pas exécuté. Le worker finit sa pièce en cours —
    # jusqu'à ~77 s mesurées pour une notion — puis sort, et le superviseur le relance.
    return {
        "detail": (
            f"Arrêt demandé au worker « {name} » : il termine sa pièce en cours puis sort, "
            "et le superviseur le relance avec le code à jour."
        )
    }


def _envoyer_arret(name: str) -> None:
    """L'envoi lui-même, isolé — c'est le joint que les tests remplacent.

    Le conftest interdit toute connexion Redis en test (et il a raison : un test qui arrêterait un
    vrai worker casserait l'environnement qui le fait tourner). Garder l'envoi dans son propre
    joint permet de vérifier tout le reste — refus, 404, 503, rôle — contre le vrai chemin."""
    from rq.command import send_shutdown_command

    from app.core.queue import _redis

    send_shutdown_command(_redis(), name)
