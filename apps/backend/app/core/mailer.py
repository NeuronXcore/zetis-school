"""Le seul canal SORTANT de ZETIS (ADR-0046 Décision 5).

## Pourquoi l'e-mail et pas Web Push

Web Push était le choix architecturalement propre — pas de compte tiers, clés VAPID
auto-générées, charge chiffrée de bout en bout, et ça réveille un onglet fermé. Il a été **écarté
sur un fait de déploiement** : `DEPLOYMENT.md` établit qu'il n'existe **aucun environnement
distant**, et le Push API exige un contexte sécurisé. Il aurait donc fonctionné sur
`http://localhost`, c'est-à-dire **sur la machine qui fait tourner ZETIS et nulle part ailleurs** :
Papa aurait reçu une notification système sur la machine devant laquelle il est déjà assis, celle
où il lui suffit de regarder le bandeau.

L'e-mail atteint son téléphone **aujourd'hui**, parce que le message SORT du réseau au lieu
d'exiger qu'on y entre. `smtplib` est dans la bibliothèque standard : **zéro dépendance ajoutée**.

→ À rouvrir le jour où l'accès distant existe.

## Dégradation propre

Sans `SMTP_HOST` ni `ALERT_EMAIL_TO`, `envoyer()` rend `False` et n'échoue jamais. Une alerte
d'infrastructure ne doit pas pouvoir faire tomber ce qu'elle surveille.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

logger = logging.getLogger(__name__)


def canal_configure() -> bool:
    """Le canal peut-il envoyer ? Lu au démarrage pour l'annoncer, et avant chaque envoi."""
    return bool(settings.smtp_host and settings.alert_email_to)


def envoyer(sujet: str, corps: str) -> bool:
    """Envoie un e-mail. Rend `True` si parti, `False` si le canal est inerte ou a échoué.

    ⚠️ **N'exception jamais.** L'appelant est une tâche de fond qui surveille la production : si
    l'alerte pouvait lever, la surveillance mourrait de la panne qu'elle est censée signaler.
    """
    if not canal_configure():
        logger.info("alerte non envoyée : canal e-mail inerte (SMTP_HOST/ALERT_EMAIL_TO absents)")
        return False

    message = EmailMessage()
    message["Subject"] = sujet
    message["From"] = settings.alert_email_from or settings.smtp_user or "zetis@localhost"
    message["To"] = settings.alert_email_to
    message.set_content(corps)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as serveur:
            serveur.ehlo()
            # STARTTLS quand le serveur l'annonce. Sur un relais local (port 25) il ne l'annonce
            # pas, et l'exiger interdirait le cas le plus simple.
            if serveur.has_extn("starttls"):
                serveur.starttls()
                serveur.ehlo()
            if settings.smtp_user and settings.smtp_password:
                serveur.login(settings.smtp_user, settings.smtp_password)
            serveur.send_message(message)
    except Exception:  # noqa: BLE001 — voir le docstring : ce chemin ne lève jamais.
        logger.exception("échec d'envoi de l'alerte e-mail")
        return False

    logger.info("alerte envoyée à %s : %s", settings.alert_email_to, sujet)
    return True


def main() -> int:
    """`python -m app.core.mailer` — la **preuve de vie du canal**, déclenchable à tout moment.

    ## Pourquoi ça existe

    L'ADR-0046 l'avait nommé comme le manque à combler, dans son « signal qui dirait qu'on s'est
    trompé » : *« l'e-mail n'arrive jamais alors que la panne se reproduit → le canal est inerte
    sans qu'on l'ait su : il manquerait une preuve de vie du canal lui-même »*.

    🔴 **Un canal d'alerte qu'on croit armé et qui ne l'est pas est pire qu'un canal absent** : on
    cesse de surveiller en comptant sur lui. Sans cette commande, la seule façon de savoir si
    l'e-mail part serait d'attendre une vraie panne — c'est-à-dire de découvrir la défaillance du
    détecteur au moment précis où on en a besoin.

    ## Comment le prouver sans compte SMTP réel

    Un attrapeur local suffit à prouver TOUT sauf la dernière patte (qu'un fournisseur réel
    délivre) :

        docker run -d --rm --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
        SMTP_HOST=localhost SMTP_PORT=1025 ALERT_EMAIL_TO=papa@test \\
          .venv/bin/python -m app.core.mailer
        # puis : http://localhost:8025
    """
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if not canal_configure():
        print("🔴 Canal INERTE — ni SMTP_HOST ni ALERT_EMAIL_TO. Rien n'a été envoyé.")
        print("   C'est un état valide (dégradation propre), mais aucune alerte ne partira.")
        return 1
    parti = envoyer(
        "ZETIS : test du canal d'alerte",
        "Ceci est un envoi de test.\n\n"
        "Si tu lis ce message, le canal par lequel ZETIS signale « la production est à l'arrêt » "
        "fonctionne.\nAucune panne n'est en cours.\n",
    )
    print("✅ envoyé" if parti else "🔴 échec d'envoi — voir le log ci-dessus")
    return 0 if parti else 2


if __name__ == "__main__":
    raise SystemExit(main())
