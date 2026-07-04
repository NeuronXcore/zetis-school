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


# Génération de cartes SRS (ADR-0012) : la validation d'une leçon enfile un job consommé par
# `worker-ai` (process séparé), qui appelle `run_lesson_card_generation`. Enqueue PAR NOM de
# tâche pour éviter tout import croisé backend ↔ worker (même principe que le rendu capsule).
CARDS_JOB_TIMEOUT = 600  # secondes — 1 appel LLM local par notion de la leçon


@lru_cache(maxsize=1)
def cards_queue() -> Queue:
    return Queue(settings.cards_queue, connection=_redis())


def enqueue_generate_cards(lesson_id: int) -> str:
    """Enfile la (re)génération des cartes SRS d'une leçon validée et renvoie l'id du job RQ."""
    job = cards_queue().enqueue(
        "worker_ai.jobs.generate_lesson_cards", lesson_id, job_timeout=CARDS_JOB_TIMEOUT
    )
    return job.id
