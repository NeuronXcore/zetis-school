"""Point d'entrée du worker de rendu : `python -m worker_media.worker`.

Utilise `SimpleWorker` (sans fork) — plus fiable sur macOS et avec les sous-processus Node
qu'on lance de toute façon nous-mêmes. Consomme la file `settings.render_queue` sur Redis.
"""

from redis import Redis
from rq import Queue, SimpleWorker

from app.core.config import settings


def main() -> None:
    connection = Redis.from_url(settings.redis_url)
    queue = Queue(settings.render_queue, connection=connection)
    worker = SimpleWorker([queue], connection=connection)
    worker.work(with_scheduler=False)


if __name__ == "__main__":
    main()
