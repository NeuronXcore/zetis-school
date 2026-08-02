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
