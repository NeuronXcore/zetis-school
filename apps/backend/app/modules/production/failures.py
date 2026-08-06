"""Le verdict sur un échec : **transitoire ou structurel ?** (ADR-0041 §10.2)

## Pourquoi cette question mérite un module

Un rejeu coûte ~69 s de GPU local et retarde tout ce qui est derrière dans la file — un seul
Ollama, un seul GPU (`production_worker.py`). Rejouer un échec **structurel** ne peut donc rien
produire d'autre que du retard : une notion sans leçon n'en aura pas davantage à la deuxième
tentative, et le verdict que Papa attend arrive trois fois plus tard.

À l'inverse, ne rien rejouer ferait tomber un travail entier parce qu'Ollama redémarrait pendant
une seconde. C'est le seul cas où réessayer a un sens : **rien du monde n'a changé sauf le
transport.**

## La règle par défaut, et elle est délibérément prudente

⚠️ **Une exception non classée est tenue pour STRUCTURELLE.** C'est le choix qui protège la
propriété centrale du chantier : un échec inconnu **remonte immédiatement à la barre** avec son
motif, au lieu de tourner trois fois en silence avant de s'afficher. Se tromper dans ce sens coûte
un clic à Papa ; se tromper dans l'autre coûte quatre minutes de GPU et une barre qui ment sur ce
qu'elle est en train de faire.

## Ce que ce module ne fait PAS

Il ne lit pas la `FailedJobRegistry` de RQ et ne rejoue rien lui-même (hors périmètre, ADR-0041
§10). Il **répond à une question**, et `run_ai_job` agit — en laissant remonter l'exception (RQ
rejoue) ou en la retenant (RQ voit un succès, donc ne rejoue pas). C'est ce silence-là qui vaut
« zéro tentative », et c'est pour ça qu'il doit être décidé ici et pas au petit bonheur.
"""

import httpx

# Deux rejeux, donc **trois exécutions au pire**. `max` compte les REJEUX, pas les tentatives :
# c'est la sémantique de `rq.Retry`, et la confondre donnerait 2 exécutions là où l'ADR en veut 3.
MAX_REJEUX = 2

# Un intervalle croissant, en secondes. ⚠️ **Pas `0`** (le défaut de RQ) : un rejeu immédiat
# consommerait les deux tentatives en une poignée de millisecondes, pendant qu'Ollama redémarre
# encore. Un rejeu qui ne laisse pas au monde le temps de changer ne rejoue rien.
#
# Servi par le scheduler du worker (`with_scheduler=True`, déjà en place pour le scan périodique) :
# aucun ordonnanceur nouveau, ce que l'ADR-0023 refusait et que l'ADR-0041 ne rouvre pas.
INTERVALLES_REJEU = [10, 60]

# Le transport, et lui seul. `httpx.TransportError` couvre déjà les timeouts et les erreurs réseau
# (`TimeoutException` et `NetworkError` en héritent) — c'est par là que passent les appels Ollama.
# `ConnectionError` / `TimeoutError` sont leurs équivalents natifs, levés par la couche socket.
_TRANSITOIRES = (httpx.TransportError, ConnectionError, TimeoutError)


def is_transient(exc: BaseException) -> bool:
    """Cet échec a-t-il une chance de ne plus se produire dans une minute ?

    ⚠️ **`HTTPStatusError` est coupé en deux, et ce n'est pas du zèle.** `ollama_provider` appelle
    `raise_for_status()` : un **5xx** dit qu'Ollama va mal (il charge un modèle, il a été tué,
    il redémarre) — le rejeu a un sens. Un **4xx** dit que la demande est mauvaise (modèle
    inexistant, schéma refusé) : la rejouer à l'identique donnera exactement la même réponse.
    Les mettre dans le même seau ferait rejouer deux fois un nom de modèle mal orthographié.

    ⚠️ **`OSError` n'est PAS dans la liste**, alors que `ConnectionError` en hérite. `OSError`
    couvre aussi « fichier introuvable » et « disque plein », qui sont structurels au possible.
    Élargir ici ferait rejouer un chemin MinIO absent.
    """
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code >= 500
    return isinstance(exc, _TRANSITOIRES)


def rejeux_restants() -> int | None:
    """Combien de rejeux RQ accordera-t-il encore à CE travail ? `None` hors d'un worker.

    ⚠️ **Lu avant que RQ ne décrémente.** Le worker ne touche `retries_left` qu'*après* que le
    gestionnaire a levé ; à l'intérieur, la valeur est donc celle des tentatives encore
    disponibles, `MAX_REJEUX` à la première exécution.

    ⚠️ **`None` ne veut pas dire zéro.** Hors worker — en test, ou appelé à la main — il n'y a
    aucun job RQ courant. Traiter ce cas comme « plus de rejeu » ferait passer tous les tests de
    rejeu au vert sans rien prouver ; c'est à l'appelant de dire ce qu'il en fait, et
    `doit_rejouer` le dit explicitement.
    """
    try:
        from rq import get_current_job

        job = get_current_job()
    except Exception:  # noqa: BLE001 — pas de Redis, pas de worker : la question n'a pas de sens
        return None
    return getattr(job, "retries_left", None) if job is not None else None


def doit_rejouer(exc: BaseException) -> bool:
    """Faut-il laisser cette exception remonter jusqu'à RQ, pour qu'il rejoue ?

    Deux conditions, et la seconde est celle qu'on oublie : l'échec doit être transitoire **et**
    il doit rester un rejeu. Sans la seconde, la dernière tentative laisserait le travail en
    `queued` — c'est-à-dire « en file d'attente » à l'écran — alors que plus rien ne le reprendra
    jamais. Un travail qui attend pour toujours est précisément le mensonge du §10.
    """
    if not is_transient(exc):
        return False
    restants = rejeux_restants()
    # Hors worker, on ne peut pas savoir : on répond selon la seule chose qui soit vraie ici, la
    # NATURE de l'échec. La borne, elle, est tenue par RQ, qui la connaît.
    return True if restants is None else restants > 0


__all__ = [
    "INTERVALLES_REJEU",
    "MAX_REJEUX",
    "doit_rejouer",
    "is_transient",
    "rejeux_restants",
]
