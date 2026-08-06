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


def render_worker_alive() -> bool:
    """Quelqu'un écoute-t-il la file des RENDUS ? (addendum 2 §22)

    🔴 `production_worker_alive` n'interroge **que** les files de production — par construction, et
    c'était juste tant que la barre ne montrait qu'elles. Depuis que le couloir média est visible,
    le worker vidéo pouvait être mort pendant que l'écran annonçait `worker_alive: true` : une
    capsule attendait indéfiniment sous un indicateur qui disait que tout allait bien. C'est
    exactement la panne de six heures que `production_worker_alive` avait été écrite pour rendre
    visible, déplacée d'un couloir.

    Même contrat : best-effort, `False` si Redis est injoignable — on préfère annoncer un doute
    qu'affirmer une santé.
    """
    from rq import Worker

    try:
        return len(Worker.all(queue=render_queue())) > 0
    except Exception:
        return False


# La phrase que Papa lit quand la file refuse un travail — **écrite UNE fois** (ADR-0041 §10.1).
# Trois routes la rendent en 503 ; trois copies auraient divergé au premier mot changé.
#
# ⚠️ Elle dit trois choses, et les trois comptent : ce qui n'a pas marché, **que rien n'a été
# créé** (sinon Papa attend un travail qui n'existe pas), et le geste qui répare. Un « 500 Internal
# Server Error » ne disait aucune des trois.
MESSAGE_FILE_INJOIGNABLE = (
    "La file de production est injoignable : rien n'a été lancé, et rien n'a été créé. "
    "Vérifiez que Redis et le worker de production tournent, puis relancez."
)


class QueueUnavailable(RuntimeError):
    """La file n'a pas pris le travail — Redis injoignable, ou refus de RQ (ADR-0041 §10.1).

    ## Pourquoi une exception TYPÉE, et pas le `redis.ConnectionError` d'origine

    Elle a un seul rôle : permettre à l'appelant de **défaire ce qu'il venait d'écrire**. Sans
    elle, chaque site devrait connaître les exceptions de `redis` et de `rq` pour distinguer « la
    file n'a pas voulu » de « mon code est cassé » — et les deux se compensent différemment.

    ⚠️ **Le motif d'origine est conservé en `__cause__`** (`raise ... from exc`) : la trace du
    worker doit dire *quoi* était injoignable. C'est l'écran qui reçoit une phrase de Papa, pas
    les logs.
    """


def _enfiler(queue: "Queue", *args, **kwargs) -> str:
    """Enfile, ou lève `QueueUnavailable`. **Le seul endroit qui parle à RQ en écriture.**

    ## Le trou que cette fonction ferme (ADR-0041 §10.1)

    Les trois `enqueue_*` appelaient RQ à nu. Redis absent ⇒ l'objet était **déjà commité** en base
    (un `ProductionRun`, un `AIJob`, une capsule passée en `rendering`), puis un 500 partait vers
    le navigateur. Résultat : un travail qui existe, que **personne n'exécutera jamais**, et un
    écran qui dit « en file d'attente » — la barre annonçait une attente là où il y avait un arrêt
    définitif. C'est exactement le mensonge que tout ce chantier existe pour supprimer.

    ⚠️ **`Exception` et non `redis.ConnectionError`.** Le chemin traverse `redis`, `rq` et la
    sérialisation du job : une erreur d'authentification, un timeout de socket ou un refus de RQ
    doivent tous se compenser de la même façon. Ce qui compte pour l'appelant, c'est « le travail
    n'est pas parti », jamais pourquoi.
    """
    try:
        return queue.enqueue(*args, **kwargs).id
    except Exception as exc:  # noqa: BLE001 — voir le ⚠️ ci-dessus
        raise QueueUnavailable(str(exc)) from exc


def enqueue_production(run_id: int, *, trigger: str | None = "manual") -> str:
    """Enfile l'exécution d'un lot et renvoie l'id du job RQ.

    On enfile la FONCTION, contrairement à `enqueue_render` : le worker de production partage le
    code du backend (même runtime, même paquet), il n'y a aucun import croisé à éviter. Une chaîne
    qui ne résout pas échouerait à l'exécution ; un import échoue au démarrage.

    `trigger` ne sert qu'à **choisir la file** (§5) : il n'est écrit nulle part ici, il est déjà
    sur le lot. Défaut `manual` — un appelant qui ne le précise pas est un geste de Papa.

    ⚠️ **Aucun `Retry` ici, contrairement à `enqueue_ai_job`** (ADR-0041 §10.2, borne posée au
    read-before-code du 2026-08-06). Un lot n'est pas rejouable en l'état : `runner.execute`
    réécrit `started_at`, recalcule `total_notions` et **réempile ses lignes de journal**. Un lot
    rejoué se raconterait deux fois, et l'ADR-0034 §1 fait du journal la seule mémoire de ce qui
    a été produit. Un lot interrompu se reprend par un lot NEUF — `equip_notion` saute ce qui
    existe déjà (`piece_deja_produite`), donc la reprise ne recalcule rien."""
    from app.modules.production.jobs import run_production

    return _enfiler(
        queue_for(trigger), run_production, run_id, job_timeout=settings.production_job_timeout
    )


def enqueue_ai_job(job_id: int) -> str:
    """Enfile un TRAVAIL unitaire — un `AIJob` déjà créé en `queued` et **commité** (ADR-0041 §3).

    ⚠️ **L'ordre compte.** La ligne doit exister en base AVANT l'enfilement, sinon le worker peut
    la prendre avant qu'elle soit visible. C'est aussi ce qui permet à la barre de l'afficher
    « en file » dès le retour de la route. Corollaire : quand l'enfilement échoue, l'appelant
    **supprime la ligne** — voir `QueueUnavailable`.

    Toujours prioritaire : un travail hors lot est manuel par construction (§3.2).

    ⚠️ **`Retry` ne rejoue PAS tout seul ce qu'il veut** (ADR-0041 §10.2). RQ rejoue sur *toute*
    exception qui remonte ; c'est `run_ai_job` qui décide de laisser remonter ou non, selon que
    l'échec est transitoire ou structurel. Le compte vit ici parce que RQ l'exige à l'enfilement ;
    **le verdict vit dans `production/failures.py`**.
    """
    from app.modules.production.failures import INTERVALLES_REJEU, MAX_REJEUX
    from app.modules.production.jobs import run_ai_job
    from rq import Retry

    return _enfiler(
        priority_queue(),
        run_ai_job,
        job_id,
        job_timeout=settings.production_job_timeout,
        retry=Retry(max=MAX_REJEUX, interval=INTERVALLES_REJEU),
    )


def enqueue_render(capsule_id: int) -> str:
    """Enfile le rendu MP4 d'une capsule et renvoie l'id du job RQ."""
    return _enfiler(
        render_queue(),
        "worker_media.jobs.render_capsule",
        capsule_id,
        job_timeout=RENDER_JOB_TIMEOUT,
    )
