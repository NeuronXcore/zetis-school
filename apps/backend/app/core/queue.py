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


def enqueue_render(capsule_id: int) -> str:
    """Enfile le rendu MP4 d'une capsule et renvoie l'id du job RQ."""
    job = render_queue().enqueue(
        "worker_media.jobs.render_capsule", capsule_id, job_timeout=RENDER_JOB_TIMEOUT
    )
    return job.id
