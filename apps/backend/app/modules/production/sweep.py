"""Le balayage des travaux morts (ADR-0041 §10.3 et §10.4).

## Deux gestes, et il ne faut surtout pas les confondre

1. **LIRE** qu'un travail est mort — `job_status()`. Instantané, sans écriture, à chaque appel de
   `/activity`. C'est ce qui rend la barre honnête **tout de suite**.
2. **REFERMER** ce travail en base — `close_stale_jobs()` / `runs.close_stale_runs()`. Du ménage :
   libérer `GET /runs/active`, cesser de compter le mort parmi les vivants.

⚠️ **Le second n'est PAS ce qui protège l'écran, et c'est l'erreur qu'on a failli commettre.** Le
prompt de cadrage demandait de greffer le balayage sur « le réveil déjà en place » — lequel bat
toutes les **180 minutes** (`production_scan_interval_minutes`). Une barre qui n'aurait dit la
vérité qu'après ce balayage aurait menti pendant trois heures, c'est-à-dire aurait rouvert le
défaut que ce chantier ferme. C'est le §1 qui tranche : *la barre est une fenêtre, jamais un
producteur d'état* — donc la vérité se **dérive à la lecture**, et le balayage n'est que du ménage.

⚠️ **Aucun ordonnanceur nouveau.** L'ADR-0023 en a refusé un, l'ADR-0041 ne le rouvre pas. Le
balayage se greffe sur `scan_triggers`, qui se replanifie déjà seul — et il tourne donc aussi **au
démarrage du worker** (`production_worker.py` amorce le scan). C'est le meilleur moment possible :
le worker qui vient de mourir est de retour, et ce qu'il a laissé en plan se referme aussitôt.

## Ce que ce module ajoute au monde des `AIJob`

`ProductionRun` savait déjà se dire mort : `heartbeat_at` + `journal.run_status()`. `AIJob` n'a
**aucun battement de cœur** — et il n'en a pas besoin : un travail unitaire est une rafale d'appels
LLM sans grain interne (ADR-0041 §6), il n'y a rien à battre entre deux. Ce qui le borne, c'est le
délai au bout duquel **RQ tue le job lui-même** : `production_job_timeout`. Au-delà, une ligne
encore `running` ne décrit plus rien de vivant, par construction.
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AIJob

# Le motif écrit sur un travail refermé de force. Une phrase de Papa : elle s'affiche telle quelle
# dans la barre (décision du 2026-08-06 — un motif d'échec n'est jamais traduit à l'affichage).
MOTIF_ZOMBIE = "Travail interrompu : le worker n'a plus donné signe de vie."


def _aware(moment: datetime) -> datetime:
    """⚠️ SQLite relit un datetime NAÏF là où Postgres rend un datetime AWARE — les comparer lève
    un `TypeError`. Même parade que `runs.is_stale`, et pour la même raison : le piège ne se
    manifeste que sur un moteur, donc il passe la CI ou la prod, jamais les deux."""
    return moment.replace(tzinfo=timezone.utc) if moment.tzinfo is None else moment


def job_is_stale(job: AIJob, *, now: datetime | None = None) -> bool:
    """Ce travail unitaire est-il mort en cours de route ?

    ⚠️ **Seul `running` peut être zombie.** Un travail `queued` attend légitimement — même depuis
    des heures, si le worker est arrêté. C'est `worker_alive` qui dit cette panne-là (`/activity`),
    et la confondre avec un zombie ferait passer en échec une file parfaitement intacte, qui
    repartira toute seule au prochain démarrage du worker. **Rien ne se perd** veut dire ça.

    Un travail `running` sans `started_at` n'est pas jugé : c'est un état impossible depuis
    `run_ai_job` (qui écrit les deux dans le même commit), donc une ligne d'un autre temps. Aucune
    rétro-attribution — doctrine §F.4, la même qui protège les lots sans `heartbeat_at`.
    """
    if job.status != "running" or job.started_at is None:
        return False
    limite = timedelta(seconds=settings.production_job_timeout)
    return (now or datetime.now(timezone.utc)) - _aware(job.started_at) > limite


def job_status(job: AIJob, *, now: datetime | None = None) -> str:
    """Le statut RENDU d'un travail unitaire — miroir exact de `journal.run_status` pour les lots.

    🔴 **C'est le correctif que le §10.4 exigeait.** `activity._travail` rendait `job.status` brut,
    c'est-à-dire très précisément le défaut que le §1 venait de corriger côté lots (`run_out`
    rendait `run.status` et affichait `running` sur un lot mort). Le monde des travaux unitaires
    est né dans la Slice A avec le bug déjà réparé à côté de lui.

    `stale` est une LECTURE, jamais une valeur stockée (ADR-0034 §2) : `RUN_STATUSES` ne la
    contient pas, et la table des `AIJob` non plus.
    """
    return "stale" if job_is_stale(job, now=now) else job.status


def close_stale_jobs(db: Session) -> int:
    """Referme les travaux unitaires dont le worker est mort. Renvoie le nombre refermé.

    Le motif est écrit sur la ligne (`error_message`), donc **la barre le montre** et Papa doit
    l'acquitter (§8) — un travail mort ne disparaît pas en silence, il se raconte.
    """
    ferme = 0
    now = datetime.now(timezone.utc)
    for job in db.scalars(select(AIJob).where(AIJob.status == "running")).all():
        if not job_is_stale(job, now=now):
            continue
        job.status = "failed"
        job.error_message = MOTIF_ZOMBIE
        job.finished_at = now
        ferme += 1
    if ferme:
        db.commit()
    return ferme


def sweep(db: Session) -> dict:
    """Le ménage complet — les deux modèles, en un geste. Appelé par `scan_triggers`.

    ⚠️ **Il ne remplace pas l'appel opportuniste de `create_run`**, il s'y ajoute. Celui-là tourne
    au moment où un humain regarde ; celui-ci tourne même quand personne ne regarde — c'est-à-dire
    la nuit, qui est exactement le moment où un lot de trente-six minutes meurt sans témoin.
    """
    from app.modules.production import runs

    return {"runs": runs.close_stale_runs(db), "jobs": close_stale_jobs(db)}


__all__ = ["MOTIF_ZOMBIE", "close_stale_jobs", "job_is_stale", "job_status", "sweep"]
