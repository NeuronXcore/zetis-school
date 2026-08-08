"""L'absence de worker sort de l'écran (ADR-0046 Décision 5).

## Pourquoi ce module vit dans le BACKEND

On ne demande pas au mort de constater son décès. Le surveillant doit être le processus qui reste
debout quand le worker tombe — et c'est le backend.

## Ce qu'il ne fait PAS

Il **ne re-détecte rien**. `production_worker_alive()` mesure déjà, bien, et son docstring consigne
deux pannes déjà payées. Il **ne relit pas Redis** pour savoir si du travail attend : c'est
`activity.porte_un_travail_en_file()` qui répond, la même fonction que la route d'activité. Le
manque que ce module comble n'est pas la détection, c'est son **atteignabilité**.

## Les deux clés Redis, et pourquoi il en faut deux

- `…:depuis` — l'instant de la PREMIÈRE observation de l'anomalie. Sans elle, « faux depuis plus de
  N minutes » serait invérifiable : chaque passage ne voit que l'instant présent.
- `…:envoyee` — le verrou d'unicité. Une alerte qui se répète toutes les 15 minutes est une alerte
  qu'on filtre, et un filtre, une fois posé, couvre aussi la vraie panne suivante.

🔴 **Les deux vivent dans Redis, pas en mémoire, et ce n'est pas un détail** : en développement,
jusqu'à cinq backends tournent en parallèle (les paires de `.claude/launch.json`). Avec un état en
mémoire, chacun enverrait son propre e-mail — cinq alertes pour une panne, soit le défaut des trois
workers transposé à la surveillance. Dans Redis, l'état est partagé : **une panne, un e-mail**,
quel que soit le nombre de backends.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.core import mailer
from app.core.config import settings
from app.core.queue import _redis, production_worker_alive
from app.modules.production import activity

logger = logging.getLogger(__name__)

# 🔴 MESURÉ le 2026-08-08, pas supposé. Un worker `idle` ne rebat qu'à chaque tour de boucle de
# dequeue : battement relevé à 3,8 min d'ancienneté, TTL de clé Redis à 8 min. Sous ce plancher,
# l'alarme sonne sur un worker en parfaite santé.
PLANCHER_ALERTE_MINUTES = 8

CLE_DEPUIS = "zetis:alerte:production-sans-worker:depuis"
CLE_ENVOYEE = "zetis:alerte:production-sans-worker:envoyee"
# Les clés expirent d'elles-mêmes : un backend tué en pleine anomalie ne doit pas laisser un verrou
# éternel qui empêcherait la prochaine alerte.
TTL_CLES_SECONDES = 24 * 3600


def delai_alerte_minutes() -> int:
    """Le délai effectif, plancher compris.

    **Relève au lieu de refuser.** Un `ValidationError` ferait tomber tout le backend pour un
    réglage d'alerting — la panne serait causée par son propre détecteur. On corrige, et on le dit.
    """
    demande = settings.production_alert_after_minutes
    if demande < PLANCHER_ALERTE_MINUTES:
        logger.warning(
            "PRODUCTION_ALERT_AFTER_MINUTES=%d est sous le plancher mesuré de %d min "
            "(un worker idle ne rebat que toutes les ~8 min) — relevé à %d.",
            demande,
            PLANCHER_ALERTE_MINUTES,
            PLANCHER_ALERTE_MINUTES,
        )
        return PLANCHER_ALERTE_MINUTES
    return demande


def _oublier() -> None:
    """L'anomalie a cessé : on efface tout, la prochaine repartira de zéro."""
    try:
        _redis().delete(CLE_DEPUIS, CLE_ENVOYEE)
    except Exception:  # noqa: BLE001 — Redis injoignable n'est pas l'affaire du watchdog.
        logger.debug("watchdog : effacement des clés impossible", exc_info=True)


def _depuis(maintenant: datetime) -> datetime:
    """L'instant de la première observation — posé maintenant s'il n'existe pas encore."""
    r = _redis()
    brut = r.get(CLE_DEPUIS)
    if brut:
        try:
            return datetime.fromisoformat(brut.decode() if isinstance(brut, bytes) else brut)
        except ValueError:
            pass  # clé illisible : on repart de maintenant plutôt que d'alerter sur un parse raté
    r.set(CLE_DEPUIS, maintenant.isoformat(), ex=TTL_CLES_SECONDES)
    return maintenant


def verifier_une_fois(db: Session, *, maintenant: datetime | None = None) -> str:
    """Un passage du watchdog. Rend ce qui a été fait — pour les logs ET pour les tests.

    Rendre une chaîne plutôt que `None` est délibéré : sans elle, la seule façon de tester ce
    chemin serait d'observer un envoi d'e-mail, donc de tout mocker jusqu'au SMTP.
    """
    maintenant = maintenant or datetime.now(UTC)

    etat = activity.read(db)
    if not activity.porte_un_travail_en_file(etat):
        # Sans rien en attente, l'absence de worker n'est un problème pour personne — c'est l'état
        # normal de la nuit. Même discipline que la route d'activité : on ne pose même pas la
        # question à Redis.
        _oublier()
        return "rien-en-file"

    if production_worker_alive():
        _oublier()
        return "worker-vivant"

    seuil = timedelta(minutes=delai_alerte_minutes())
    if maintenant - _depuis(maintenant) < seuil:
        return "trop-tot"

    r = _redis()
    if r.get(CLE_ENVOYEE):
        return "deja-alertee"

    attente = int((maintenant - _depuis(maintenant)).total_seconds() // 60)
    n = 1 + len(etat.get("queued") or [])
    if mailer.envoyer(*_message(n, attente)):
        r.set(CLE_ENVOYEE, maintenant.isoformat(), ex=TTL_CLES_SECONDES)
        return "alerte-envoyee"
    return "canal-inerte"


INTERVALLE_SECONDES = 60


async def boucle() -> None:
    """La tâche de fond du backend. **La première du dépôt** — il n'y en avait aucune.

    ⚠️ Elle **dort d'abord**. Un passage au démarrage serait joué à chaque `--reload` en
    développement, et surtout pendant les tests, dont le `TestClient` déclenche le cycle de vie
    1000 fois. Dormir d'abord suffit à ce qu'aucune suite ne l'exerce par accident.

    ⚠️ `to_thread` : `verifier_une_fois` est **synchrone** (SQLAlchemy et redis-py le sont).
    L'appeler directement bloquerait la boucle d'événements du backend le temps d'une requête DB.
    """
    import asyncio

    from app.db.base import SessionLocal

    def _un_passage() -> str:
        db = SessionLocal()
        try:
            return verifier_une_fois(db)
        finally:
            db.close()

    while True:
        await asyncio.sleep(INTERVALLE_SECONDES)
        try:
            issue = await asyncio.to_thread(_un_passage)
        except Exception:  # noqa: BLE001
            # Un watchdog qui meurt de sa propre erreur laisse la panne qu'il surveille invisible,
            # et personne ne le remarque — c'est le pire des deux mondes. Il log et il continue.
            logger.exception("watchdog production : passage en échec, la boucle continue")
            continue
        if issue not in ("rien-en-file", "worker-vivant"):
            logger.info("watchdog production : %s", issue)


def _message(travaux: int, minutes: int) -> tuple[str, str]:
    """Le texte est fixé par l'ADR-0046 Décision 6. Trois règles le gouvernent.

    - **le compte de travaux est un fait, pas un reproche** — il décrit une file, pas le retard de
      quelqu'un ;
    - **« rien n'est perdu » est dit à chaque fois.** C'est vrai (RQ conserve), et c'est ce qui
      transforme une alarme en information ;
    - **le geste de réparation est dans le message.** Une alerte qui oblige à retrouver la commande
      ailleurs est une alerte à moitié utile.

    ⚠️ Aucune donnée de Massimo n'entre ici : un compte et une durée, rien d'autre.
    """
    pluriel = "x" if travaux > 1 else ""
    sujet = "ZETIS : la production est à l'arrêt"
    corps = (
        f"{travaux} travau{pluriel or ''} attend{'ent' if travaux > 1 else ''} dans la file depuis "
        f"{minutes} minutes, et aucun moteur de production ne répond.\n"
        "Rien n'est perdu : ils repartiront dès qu'un worker démarrera.\n\n"
        "Sur la machine ZETIS :\n"
        "  pnpm dev:worker\n"
        "  (ou : docker compose -f docker-compose.prod.yml up -d worker)\n"
    )
    return sujet, corps
