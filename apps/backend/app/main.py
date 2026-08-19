import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core import mailer
from app.core.config import settings
from app.modules.production import watchdog
from app.modules.activity.router import parent_router as activity_parent_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.review_queue.router import router as review_queue_router
from app.modules.agenda.router import router as agenda_router
from app.modules.agenda.router import student_router as agenda_student_router
from app.modules.news.router import student_router as news_student_router
from app.modules.activity.router import telemetry_router
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.capsules.router import audio_router as capsules_audio_router
from app.modules.capsules.router import massimo_router as capsules_massimo_router
from app.modules.capsules.router import router as capsules_router
from app.modules.chat.router import student_router as chat_student_router
from app.modules.curriculum.router import router as curriculum_router
from app.modules.curriculum.router import student_router as curriculum_student_router
from app.modules.diagnostics.router import router as diagnostics_router
from app.modules.eli5.router import router as eli5_router
from app.modules.fiches.router import router as fiches_router
from app.modules.fiches.router import student_router as fiches_student_router
from app.modules.galaxy.router import student_router as galaxy_student_router
from app.modules.galaxy.router import subjects_router as galaxy_subjects_router
from app.modules.gamification.router import router as gamification_router
from app.modules.memory.router import parent_router as cards_parent_router
from app.modules.memory.router import router as memory_router
from app.modules.memory.router import student_router as reviews_student_router
from app.modules.mindmaps.router import router as mindmaps_router
from app.modules.mindmaps.router import student_router as mindmaps_student_router
from app.modules.missions.router import pilot_router as missions_pilot_router
from app.modules.missions.router import router as missions_router
from app.modules.quizzes.router import pilotage_router as quizzes_pilotage_router
from app.modules.quizzes.router import router as quizzes_router
from app.modules.quizzes.router import student_router as quizzes_student_router
from app.modules.motivation.router import router as motivation_router
from app.modules.progress.router import router as progress_router
from app.modules.rag.router import router as rag_router
from app.modules.content_requests.router import router as content_requests_router
from app.modules.content_requests.router import (
    student_router as content_requests_student_router,
)
from app.modules.production.router import router as production_router
from app.modules.production.journal_router import router as production_journal_router
from app.modules.production.runs_router import router as production_runs_router
from app.modules.production.activity_router import router as production_activity_router
from app.modules.production.workers_router import router as production_workers_router
from app.modules.reports.router import router as reports_router
from app.modules.school.router import router as school_router
from app.modules.settings.router import router as settings_router
from app.modules.subjects.router import router as subjects_router

@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Le cycle de vie du backend — **introduit par l'ADR-0046**, il n'en avait aucun.

    Une seule chose y vit : le watchdog qui rend atteignable l'absence de worker de production. Il
    est ici et non dans le worker parce qu'**on ne demande pas au mort de constater son décès** ;
    le backend est le processus qui reste debout quand le worker tombe.

    Le canal est annoncé au démarrage : sans SMTP configuré, ZETIS ne se tait pas — il dit qu'il
    est muet. Un canal inerte qu'on croit armé est pire qu'un canal absent.

    S'y ajoute depuis l'`adr-0059` §5.4 le **préchargement du moteur de dictée**, en tâche de
    fond : sans lui, c'est Massimo qui paie le chargement du modèle Whisper la première fois
    qu'il appuie sur le micro.
    """
    logger = logging.getLogger("app.watchdog")
    if mailer.canal_configure():
        logger.info(
            "watchdog production armé — alerte après %d min sans worker",
            watchdog.delai_alerte_minutes(),
        )
    else:
        logger.warning(
            "watchdog production actif mais CANAL INERTE : ni SMTP_HOST ni ALERT_EMAIL_TO. "
            "L'absence de worker restera visible dans le bandeau Papa, et nulle part ailleurs."
        )
    tache = asyncio.create_task(watchdog.boucle())
    prechauffe = asyncio.create_task(_prechauffer_stt())
    try:
        yield
    finally:
        tache.cancel()
        prechauffe.cancel()


async def _prechauffer_stt() -> None:
    """Charge le moteur de dictée hors du chemin de Massimo (`adr-0059` §5.4).

    ⚠️ **En tâche de fond, jamais dans le démarrage lui-même.** Charger un modèle Whisper prend
    plusieurs secondes de CPU : le faire en ligne retarderait l'ouverture du port, donc le
    healthcheck, donc le déploiement — on aurait déplacé l'attente de Massimo vers l'infra.
    `asyncio.to_thread` la sort aussi de la boucle d'événements, qui doit rester libre de servir
    les requêtes pendant ce temps.

    ⚠️ **Aucune erreur ne remonte** (`warmup` ne lève pas, et on filet ici par sécurité) : sans
    `faster-whisper` installé, le backend doit démarrer exactement comme avant. Un ZETIS
    entièrement indisponible parce que la dictée l'est serait une panne bien pire que celle qu'on
    évite.
    """
    logger = logging.getLogger("app.stt")
    try:
        from app.modules.stt import get_stt

        moteur = get_stt()
        chauffe = getattr(moteur, "warmup", None)
        if chauffe is None:
            return
        await asyncio.to_thread(chauffe)
        logger.info("moteur de dictée préchargé")
    except asyncio.CancelledError:
        raise
    except Exception as exc:  # noqa: BLE001 — un warm-up raté n'est jamais fatal
        logger.warning("préchargement de la dictée impossible (%s) — micro en 503 le cas échéant", exc)


app = FastAPI(title="ZETIS Backend", version=settings.version, lifespan=lifespan)

# CORS temporaire pour les frontends locaux Massimo + Papa (Étape 4/5).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(eli5_router)
app.include_router(diagnostics_router)
app.include_router(missions_router)
app.include_router(missions_pilot_router)
app.include_router(gamification_router)
app.include_router(memory_router)
app.include_router(reviews_student_router)
app.include_router(cards_parent_router)
app.include_router(rag_router)
app.include_router(reports_router)
app.include_router(subjects_router)
app.include_router(school_router)
app.include_router(settings_router)
app.include_router(curriculum_router)
app.include_router(curriculum_student_router)
app.include_router(quizzes_router)
app.include_router(quizzes_student_router)
app.include_router(quizzes_pilotage_router)
app.include_router(fiches_router)
app.include_router(fiches_student_router)
app.include_router(mindmaps_router)
app.include_router(mindmaps_student_router)
# massimo_router avant capsules_router : sa route littérale `/library` doit primer sur la
# route paramétrée `/{capsule_id}` du router Papa (sinon "library" est capté et rejeté en 422).
app.include_router(capsules_massimo_router)
app.include_router(capsules_router)
app.include_router(capsules_audio_router)
app.include_router(ai_router)
# Activité : télémétrie de navigation (Massimo) + lectures de pilotage (Papa).
app.include_router(telemetry_router)
app.include_router(activity_parent_router)
# Dashboard Papa : agrégat unique, une seule requête au premier rendu (ADR-0028 §1).
app.include_router(dashboard_router)
app.include_router(review_queue_router)
app.include_router(progress_router)
# Motivation (Massimo) : régularité douce + engagement hebdomadaire choisi par l'enfant.
app.include_router(motivation_router)
app.include_router(production_router)
app.include_router(production_runs_router)
app.include_router(production_journal_router)
app.include_router(production_activity_router)
app.include_router(production_workers_router)
app.include_router(content_requests_router)
# Écriture SEULE côté enfant (addendum ADR-0027) : Massimo demande, il ne lit pas la file.
app.include_router(content_requests_student_router)
# ZETIS Galaxy (Massimo) : graphe des connaissances, contenu de la page Progression (ADR-0024).
app.include_router(galaxy_student_router)
# Second rendu du MÊME modèle, en liste : l'index de notions de la page matière (addendum
# ADR-0024). Il partage le prédicat de disponibilité de la Galaxy, d'où son module.
app.include_router(galaxy_subjects_router)
# Agenda scolaire (ADR-0025) : source exogène co-éditée. Deux routeurs, deux schémas — la
# frontière Massimo/Papa est tenue par le serveur, jamais par l'UI.
app.include_router(agenda_student_router)
app.include_router(agenda_router)
app.include_router(news_student_router)
# Chat ZETIS (ADR-0026) : substrat de mémoire éphémère. Route élève SEULE (`require_child`) —
# aucune route parent ne sert un verbatim (§5). Le verbatim vit dans Redis, jamais en base.
app.include_router(chat_student_router)
