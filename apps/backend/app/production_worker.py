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

    # ⚠️ **L'objection d'origine est maintenue, et elle est SATISFAITE — pas contournée.**
    #
    # Ce fichier a porté `with_scheduler=False` du 2026-08-02 au 2026-08-03, avec ce motif :
    #
    #   « le déclenchement reste ÉVÉNEMENTIEL. Aucun cron, aucune tâche périodique — un scheduler
    #     ici ouvrirait la porte à "tous les dimanches, produire quelque chose", qui n'a pas de
    #     sens pédagogique. »
    #
    # Le motif reste juste, et **rien de ce qu'il interdisait n'est arrivé** : le job périodique
    # (`jobs.scan_triggers`) ne produit RIEN. Il **regarde** si le monde réel a demandé quelque
    # chose — un contrôle avec un chapitre rattaché, dans les jours qui viennent (ADR-0035 §1).
    # « Tous les dimanches, produire » reste interdit ; « tous les trois heures, vérifier s'il y a
    # un contrôle jeudi » est l'inverse exact.
    #
    # Le premier réveil est amorcé ici, et le job se replanifie ensuite lui-même. Sans cet amorçage,
    # une file vide ne se remplirait jamais.
    #
    # ⚠️ **Mais SEULEMENT s'il n'y en a pas déjà un** (correctif du 2026-08-03). Amorçage et
    # auto-replanification sont justes séparément ; ensemble, **chaque redémarrage ajoutait une
    # récurrence permanente** — quatre réveils planifiés après quatre démarrages, constaté en vrai.
    # Bénin en dev ; pas en production, où un worker redémarre à chaque déploiement.
    if settings.production_scan_interval_minutes > 0:
        from app.modules.production.jobs import scan_already_planned, scan_triggers

        if scan_already_planned(queue):
            print("production: un réveil du scan est déjà prévu — pas de nouvel amorçage")
        else:
            queue.enqueue(scan_triggers)

    SimpleWorker([queue], connection=connection).work(with_scheduler=True)


if __name__ == "__main__":
    main()
