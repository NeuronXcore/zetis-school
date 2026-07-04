"""Point d'entrée du worker IA : `python -m worker_ai.worker`.

`SimpleWorker` (sans fork) — fiable sur macOS et suffisant pour des tâches qui appellent
un LLM local en HTTP. Consomme la file `settings.cards_queue` sur Redis, alimentée par le
backend à la validation d'une leçon (ADR-0013).
"""

from redis import Redis
from rq import Queue, SimpleWorker

from app.core.config import settings


def main() -> None:
    connection = Redis.from_url(settings.redis_url)
    queue = Queue(settings.cards_queue, connection=connection)
    worker = SimpleWorker([queue], connection=connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
