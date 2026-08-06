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


@lru_cache(maxsize=1)
def priority_queue() -> Queue:
    """La file du GESTE (ADR-0041 §5) — ce que Papa a demandé à la main.

    ⚠️ **Deux files, pas deux workers.** Le worker en écoute deux dans l'ordre ; RQ sert la
    première d'abord. La concurrence reste 1 — un seul Ollama, un seul GPU — donc « passer
    devant » veut dire *prendre le prochain créneau libre*, jamais *interrompre celui-ci*
    (`runner.py` : prétendre interrompre un appel LLM serait un mensonge d'architecture).

    Prolonge une doctrine déjà écrite : `runs.py` — « le geste EST le régulateur » — aucun plafond
    de volume ne s'applique déjà à un clic de Papa. Sans cette file, un clic pouvait attendre
    derrière un lot automatique de trente-six minutes parti à 3 h du matin.
    """
    return Queue(f"{settings.production_queue}-priority", connection=_redis())


def production_queues() -> list[Queue]:
    """Les files du worker de production, **dans l'ordre où elles doivent être servies**.

    L'ordre EST la priorité : RQ vide la première avant de regarder la seconde. Écrit ici une
    seule fois — `production_worker.py` construisait auparavant sa propre `Queue`, et deux listes
    de files auraient divergé au premier ajout.
    """
    return [priority_queue(), production_queue()]


def queue_for(trigger: str | None) -> Queue:
    """La file se **DÉRIVE** de l'origine (ADR-0041 §5). Aucune colonne ne la stocke.

    `manual` — et tout travail hors lot, qui est manuel par construction (§3.2) — passe devant.
    Le reste (`agenda`, `request`, et tout déclencheur automatique futur) attend son tour : c'est
    du travail que personne ne regarde arriver.
    """
    return priority_queue() if (trigger or "manual") == "manual" else production_queue()


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

    🔴 **Depuis l'ADR-0041 §5, la question porte sur TOUTES les files, et c'est un correctif payé
    à l'écran le 2026-08-06.** Cette fonction n'interrogeait que `production_queue()`. Avec deux
    files, un worker démarré AVANT le changement n'écoute que celle-là : un travail enfilé sur
    `production-priority` y dormait pendant que l'écran annonçait `worker_alive: true`, donc
    « en file d'attente ». Mesuré en vrai — 1 job en attente, 0 worker sur sa file, 2 sur l'autre.
    C'est très exactement la panne de six heures que cette fonction avait été écrite pour rendre
    visible, réintroduite par la file qu'on venait d'ajouter.

    `all()` et non `any()` : une seule file non servie suffit à bloquer le travail qui s'y trouve,
    et on préfère annoncer un doute qu'affirmer une santé.
    """
    from rq import Worker

    try:
        files = production_queues()
        return all(len(Worker.all(queue=f)) > 0 for f in files) and bool(files)
    except Exception:
        return False


def enqueue_production(run_id: int, *, trigger: str | None = "manual") -> str:
    """Enfile l'exécution d'un lot et renvoie l'id du job RQ.

    On enfile la FONCTION, contrairement à `enqueue_render` : le worker de production partage le
    code du backend (même runtime, même paquet), il n'y a aucun import croisé à éviter. Une chaîne
    qui ne résout pas échouerait à l'exécution ; un import échoue au démarrage.

    `trigger` ne sert qu'à **choisir la file** (§5) : il n'est écrit nulle part ici, il est déjà
    sur le lot. Défaut `manual` — un appelant qui ne le précise pas est un geste de Papa."""
    from app.modules.production.jobs import run_production

    job = queue_for(trigger).enqueue(
        run_production, run_id, job_timeout=settings.production_job_timeout
    )
    return job.id


def enqueue_ai_job(job_id: int) -> str:
    """Enfile un TRAVAIL unitaire — un `AIJob` déjà créé en `queued` et **commité** (ADR-0041 §3).

    ⚠️ **L'ordre compte.** La ligne doit exister en base AVANT l'enfilement, sinon le worker peut
    la prendre avant qu'elle soit visible. C'est aussi ce qui permet à la barre de l'afficher
    « en file » dès le retour de la route.

    Toujours prioritaire : un travail hors lot est manuel par construction (§3.2).
    """
    from app.modules.production.jobs import run_ai_job

    job = priority_queue().enqueue(
        run_ai_job, job_id, job_timeout=settings.production_job_timeout
    )
    return job.id


def enqueue_render(capsule_id: int) -> str:
    """Enfile le rendu MP4 d'une capsule et renvoie l'id du job RQ."""
    job = render_queue().enqueue(
        "worker_media.jobs.render_capsule", capsule_id, job_timeout=RENDER_JOB_TIMEOUT
    )
    return job.id
