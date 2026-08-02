"""Worker de production : `python -m app.production_worker`.

**Pas un paquet séparé, et c'est une décision** (read-before-code slice B) : `worker-media` est un
paquet à part parce que son RUNTIME est `node:20` + Chromium, pas parce que c'est un worker. Le
worker de production a le même runtime et le même code que le backend — il appelle
`equipment.equip_notion`, donc les cinq générateurs, donc les providers et les modèles. Un paquet
séparé le forcerait à réimporter tout le backend : un Dockerfile de plus pour zéro isolation.

⚠️ Il ne peut PAS vivre sur le réseau Compose `internal` (sans egress) où vit `worker-media` :
il génère avec Ollama, qui tourne sur l'HÔTE. Remotion, lui, n'appelle personne.

**Concurrence 1, et ce n'est pas provisoire** : un seul Ollama, un seul GPU. Deux jobs en
parallèle ne produiraient pas plus vite — ils se disputeraient la même ressource et ralentiraient
Massimo. `SimpleWorker` (sans fork), comme `worker-media`.
"""

from redis import Redis
from rq import Queue, SimpleWorker

from app.core.config import settings


def main() -> None:
    connection = Redis.from_url(settings.redis_url)
    queue = Queue(settings.production_queue, connection=connection)
    # `with_scheduler=False` : le déclenchement reste ÉVÉNEMENTIEL (ADR-0023, repris par
    # l'ADR-0031). Aucun cron, aucune tâche périodique — un scheduler ici ouvrirait la porte à
    # « tous les dimanches, produire quelque chose », qui n'a pas de sens pédagogique.
    SimpleWorker([queue], connection=connection).work(with_scheduler=False)


if __name__ == "__main__":
    main()
