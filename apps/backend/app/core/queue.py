"""File de rendu asynchrone des capsules (Lot 2).

Le backend n'exécute JAMAIS le rendu (ADR-0007 §7) : il se contente d'enfiler un job RQ sur
Redis, consommé par `worker-media` (process séparé, sandboxé). L'enqueue se fait **par nom de
tâche** (`worker_media.jobs.render_capsule`) pour éviter tout import croisé backend ↔ worker.
"""

from functools import lru_cache

from redis import Redis
from rq import Queue

from app.core.config import settings

# Garde-fou : un rendu Remotion dépasse rarement quelques minutes ; au-delà, le job est tué.
RENDER_JOB_TIMEOUT = 900  # secondes


@lru_cache(maxsize=1)
def _redis() -> Redis:
    return Redis.from_url(settings.redis_url)


@lru_cache(maxsize=1)
def render_queue() -> Queue:
    return Queue(settings.render_queue, connection=_redis())


@lru_cache(maxsize=1)
def production_queue() -> Queue:
    """File DÉDIÉE (ADR-0031 §3) : un rendu vidéo bloqué ne doit pas retarder une production,
    et l'inverse. Consommée par `python -m app.production_worker`, concurrence 1."""
    return Queue(settings.production_queue, connection=_redis())


def production_worker_alive() -> bool:
    """Y a-t-il un worker VIVANT pour consommer la file de production ?

    ## Pourquoi cette question existe (2026-08-05)

    Quatre lots identiques ont attendu dans Redis pendant six heures : `scripts/dev.sh` lance
    l'infra, le backend et les deux frontends, **jamais** `python -m app.production_worker`.
    L'écran disait « en file d'attente » — la vérité, et une vérité insuffisante : une file sans
    consommateur n'est pas une attente, c'est un arrêt. Papa a cliqué quatre fois.

    ⚠️ **`Worker.count()` MENT, `Worker.all()` dit vrai.** RQ garde deux choses : un ensemble
    `rq:workers:<file>` (les noms) et un hash par worker (l'état, avec TTL sur battement de cœur).
    Un worker tué sans nettoyage laisse son NOM dans l'ensemble alors que son hash a expiré :
    `count()` compte les noms et rend 1, `all()` charge les hashes et rend `[]`. Mesuré ici même —
    aucun processus en vie, `count()` = 1. Un indicateur bâti sur `count()` aurait affirmé qu'un
    worker écoutait pendant que rien n'écoutait, c'est-à-dire exactement le défaut qu'il vient
    réparer.

    Best-effort : Redis injoignable → `False`. On préfère annoncer un doute qu'affirmer une
    santé — c'est l'affirmation fausse qui a coûté six heures.
    """
    from rq import Worker

    try:
        return len(Worker.all(queue=production_queue())) > 0
    except Exception:
        return False


def enqueue_production(run_id: int) -> str:
    """Enfile l'exécution d'un lot et renvoie l'id du job RQ.

    On enfile la FONCTION, contrairement à `enqueue_render` : le worker de production partage le
    code du backend (même runtime, même paquet), il n'y a aucun import croisé à éviter. Une chaîne
    qui ne résout pas échouerait à l'exécution ; un import échoue au démarrage."""
    from app.modules.production.jobs import run_production

    job = production_queue().enqueue(
        run_production, run_id, job_timeout=settings.production_job_timeout
    )
    return job.id


def enqueue_render(capsule_id: int) -> str:
    """Enfile le rendu MP4 d'une capsule et renvoie l'id du job RQ."""
    job = render_queue().enqueue(
        "worker_media.jobs.render_capsule", capsule_id, job_timeout=RENDER_JOB_TIMEOUT
    )
    return job.id
