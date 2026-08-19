"""Job RQ de production (ADR-0031 §3).

Le worker exécute CETTE fonction. Elle ouvre sa propre session et ses propres providers : un job
ne s'exécute dans aucune requête HTTP, donc dans aucune dépendance FastAPI.

⚠️ On enfile la **fonction**, pas une chaîne. `core/queue.py` enfile `worker-media` par nom de
tâche pour éviter un import croisé backend ↔ worker ; ici c'est le **même code des deux côtés**, et
une chaîne qui ne résout pas échoue à l'exécution — un import échoue au démarrage.
"""

import logging
from typing import Iterable

logger = logging.getLogger(__name__)

# Nom qualifié du job périodique, tel que RQ le stocke (`job.func_name`). Écrit une fois ici :
# le comparer à une chaîne recopiée ailleurs le ferait diverger au premier renommage de module.
SCAN_JOB_NAME = "app.modules.production.jobs.scan_triggers"


def _contains_scan(jobs: Iterable) -> bool:
    """Cette liste de jobs contient-elle un réveil du scan ? (fonction pure, testable)"""
    return any(getattr(job, "func_name", None) == SCAN_JOB_NAME for job in jobs if job is not None)


def scan_already_planned(queue) -> bool:
    """Un réveil du scan est-il DÉJÀ prévu — en file ou planifié ? (correctif du 2026-08-03)

    ## Le défaut que cette fonction ferme

    Deux mécanismes justes séparément, faux ensemble :

    - `production_worker.py` **amorce** `scan_triggers` au démarrage — sans quoi une file vide ne
      se remplirait jamais ;
    - `scan_triggers` **se replanifie lui-même** en `finally` — sans quoi un scan qui échoue
      arrêterait le dispositif définitivement et en silence.

    Résultat : **chaque redémarrage du worker ajoutait une récurrence permanente**. Constaté en
    vrai le 2026-08-03 — quatre réveils planifiés après quatre démarrages dans la journée. Bénin en
    dev ; pas en production, où un worker redémarre à chaque déploiement, crash ou OOM.

    ⚠️ **Ni l'un ni l'autre mécanisme n'est supprimé** : ils répondent chacun à un mode de panne
    réel. On ajoute seulement la question qui manquait — *« y a-t-il déjà un réveil de prévu ? »*.

    ⚠️ **Et surtout pas un `job_id` fixe.** C'était le correctif évident, et il est piégeux : le job
    se replanifierait sous **son propre identifiant** pendant qu'il tourne, et RQ efface le hash du
    job terminé après son `finally` — l'entrée planifiée pointerait vers un job mort.

    Les deux registres sont interrogés parce qu'un réveil peut être dans l'un **ou** l'autre : en
    file quand son heure est venue, planifié le reste du temps. N'en lire qu'un rouvrirait le
    défaut une fois sur deux.
    """
    from rq.registry import ScheduledJobRegistry

    registre = ScheduledJobRegistry(queue=queue)
    planifies = [queue.fetch_job(job_id) for job_id in registre.get_job_ids()]
    return _contains_scan(planifies) or _contains_scan(queue.jobs)


def run_production(run_id: int) -> dict:
    """Point d'entrée du job : équipe le scope du run et tient son journal."""
    from app.db.base import SessionLocal
    from app.modules.ai import get_embedder, get_provider
    from app.modules.production import runner

    db = SessionLocal()
    try:
        return runner.execute(db, run_id=run_id, llm=get_provider(), embedder=get_embedder())
    finally:
        db.close()


def _now():
    from datetime import datetime, timezone

    return datetime.now(timezone.utc)


def _equip_notion(db, payload: dict, llm, embedder) -> dict:
    from app.modules.production import equipment

    return equipment.equip_notion(
        db, skill_id=int(payload["skill_id"]), llm=llm, embedder=embedder
    )


# --- Les exécutants de la slice C (ADR-0041 §4) ------------------------------------------------
#
# ⚠️ **Ce sont des ADAPTATEURS, pas des implémentations.** Chacun appelle le service qui existait
# déjà et que la route appelait en direct ; aucune logique de génération n'a été déplacée ici. Ce
# qui change est *qui* l'appelle et *quand* — la route enfile, le worker exécute.
#
# ⚠️ **Chacun rend un dict qui identifie ce qui a été PRODUIT** (`fiche_id`, `quiz_id`…). C'est ce
# que la surface appelante ira chercher au bout de son sondage, à la place de l'objet que la route
# lui rendait autrefois. Un exécutant qui ne rend rien laisserait l'écran incapable d'ouvrir ce
# qu'il vient de fabriquer.


def _fiche_generate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.fiches import service

    row = service.generate_fiche(db, llm, embedder, lesson_id=int(payload["lesson_id"]))
    return {"fiche_id": row.id, "lesson_id": row.lesson_id}


def _fiche_regenerate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.fiches import service

    row = service.regenerate_fiche(db, llm, embedder, fiche_id=int(payload["fiche_id"]))
    return {"fiche_id": row.id, "lesson_id": row.lesson_id}


def _mindmap_generate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.mindmaps import service

    row = service.generate_mindmap(db, llm, embedder, lesson_id=int(payload["lesson_id"]))
    return {"mindmap_id": row.id, "lesson_id": row.lesson_id}


def _mindmap_regenerate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.mindmaps import service

    row = service.regenerate_mindmap(db, llm, embedder, mindmap_id=int(payload["mindmap_id"]))
    return {"mindmap_id": row.id, "lesson_id": row.lesson_id}


def _quiz_generate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.quizzes import service

    quiz, compteurs = service.generate_quiz(
        db,
        llm,
        embedder,
        lesson_id=int(payload["lesson_id"]),
        count=int(payload["count"]),
        difficulty=int(payload["difficulty"]),
    )
    return {"quiz_id": quiz.id, "lesson_id": quiz.lesson_id, **compteurs}


def _quiz_regenerate(db, payload: dict, llm, embedder) -> dict:
    from app.modules.quizzes import service

    quiz, compteurs = service.regenerate_quiz(db, llm, embedder, quiz_id=int(payload["quiz_id"]))
    return {"quiz_id": quiz.id, "lesson_id": quiz.lesson_id, **compteurs}


def _lesson_content(db, payload: dict, llm, _embedder) -> dict:
    """⚠️ Moteur LOCAL (`llm`), jamais la dérogation cloud `curriculum_*` — la rédaction d'un cours
    porte du contexte de Massimo. C'était déjà la règle de la route ; elle survit au déplacement."""
    from app.modules.curriculum import service

    lesson = service.generate_lesson_content(db, llm, int(payload["lesson_id"]))
    return {"lesson_id": lesson.id}


def _diagnostic_generate(db, payload: dict, llm, _embedder) -> dict:
    from app.modules.diagnostics import service

    quiz, matiere, nombre = service.generate_diagnostic(
        db, llm, int(payload["subject_id"]), payload["level"]
    )
    return {"quiz_id": quiz.id, "subject": matiere, "questions_count": nombre}


def _srs_cards_generate(db, payload: dict, llm, embedder) -> dict:
    """Cartes de révision — par MATIÈRE ou par NOTION, selon la charge (ADR-0041 §4).

    Deux routes, un seul `job_type` : c'est le même travail à deux granularités, et leur donner
    deux types aurait coupé en deux l'historique qui sert à mesurer la durée.
    """
    from app.modules.memory import generation

    if "subject_id" in payload:
        sortie = generation.reconcile_cards_for_subject(
            db, llm, embedder, subject_id=int(payload["subject_id"])
        )
        return {"subject_id": int(payload["subject_id"]), **sortie}
    sortie = generation.generate_cards_for_skill(
        db, llm, embedder, skill_id=int(payload["skill_id"])
    )
    return {"skill_id": int(payload["skill_id"]), **sortie}


def _capsule_generate(db, payload: dict, llm, _embedder) -> dict:
    from app.modules.capsules import service

    # ⚠️ **Les options ABSENTES ne sont pas passées.** `visual`, `duration` et `difficulty` ont des
    # défauts NON nuls dans le service (`"auto"`, `"moyenne"`, `"moyen"`) : leur passer `None`
    # parce que le payload ne les portait pas écraserait ces défauts. Un `payload.get(...)` naïf
    # aurait produit une capsule différente de celle que la route produisait.
    options = {
        k: payload[k]
        for k in ("level", "skill_id", "chapter_id", "visual", "duration", "difficulty")
        if payload.get(k) is not None
    }
    capsule = service.create_capsule(
        db, llm, int(payload["subject_id"]), payload["instruction"], **options
    )
    return {"capsule_id": capsule.id}


def _capsule_regenerate(db, payload: dict, llm, _embedder) -> dict:
    from app.modules.capsules import service

    capsule = service.regenerate_capsule(
        db,
        llm,
        int(payload["capsule_id"]),
        instruction=payload.get("instruction"),
        visual=payload.get("visual"),
        duration=payload.get("duration"),
        difficulty=payload.get("difficulty"),
    )
    return {"capsule_id": capsule.id}


def _capsule_voice(db, payload: dict, _llm, _embedder) -> dict:
    """⚠️ **Le seul exécutant qui n'utilise PAS le LLM.** Il lui faut un moteur TTS (Piper), que
    `run_ai_job` ne passe pas — il le construit donc lui-même, exactement comme la route le
    faisait via `Depends(get_tts)`. Élargir la signature des exécutants pour ce cas unique aurait
    fait porter à tous une dépendance qu'un seul utilise."""
    from app.modules.capsules import service
    from app.modules.tts import get_tts

    capsule = service.synthesize_voice(db, get_tts(), int(payload["capsule_id"]))
    return {"capsule_id": capsule.id}


def _curriculum_provider():
    """🔴 **La dérogation cloud de l'ADR-0009, et elle ne se perd pas dans la migration.**

    Les tâches `curriculum_*` (référentiel de programme) sont routées vers Anthropic
    `claude-sonnet-5` — dérogation étroite, justifiée et bornée : zéro donnée de Massimo dans ces
    prompts, tâche one-shot de Papa. Or `run_ai_job` passe `get_provider()`, c'est-à-dire le moteur
    **LOCAL**. Un exécutant qui se contenterait de son argument `llm` aurait donc **silencieusement
    annulé la dérogation** — même code, même sortie apparente, référentiel de bien moindre qualité,
    et aucun test pour le dire.
    """
    from app.modules.curriculum import get_curriculum_provider

    return get_curriculum_provider()


def _curriculum_chapters(db, payload: dict, _llm, _embedder) -> dict:
    from app.modules.curriculum import service

    crees = service.generate_chapters(
        db, _curriculum_provider(), int(payload["school_year_subject_id"])
    )
    return {
        "school_year_subject_id": int(payload["school_year_subject_id"]),
        "chapter_ids": [c.id for c in crees],
    }


def _curriculum_lessons(db, payload: dict, _llm, _embedder) -> dict:
    from app.modules.curriculum import service

    lecons = service.generate_lessons(
        db,
        _curriculum_provider(),
        int(payload["chapter_id"]),
        mode=payload.get("mode", "replace"),
    )
    return {"chapter_id": int(payload["chapter_id"]), "lesson_ids": [l.id for l in lecons]}


def _curriculum_skills_backfill(db, payload: dict, _llm, _embedder) -> dict:
    """⚠️ Ne persiste RIEN (ADR-0010) : la prévisualisation vit dans `output_json` du travail, et
    c'est très exactement ce que la route rendait. Un flux sans persistance n'a pas d'id à relire —
    sa sortie EST son résultat."""
    from app.modules.curriculum import service

    return service.generate_skills_backfill(
        db, _curriculum_provider(), int(payload["subject_id"]), payload["level"]
    )


def _backup_create(_db, _payload: dict, _llm, _embedder) -> dict:
    """La sauvegarde (ADR-0065 §4) — le seul exécutant qui n'utilise NI le LLM NI la session.

    La session du worker lirait la base VIVANTE ; or le manifeste doit être compté sur
    l'instantané exporté du dump (§5) — le module ouvre sa propre connexion dédiée. Placé dans
    cette file exprès : concurrence 1, donc aucun générateur n'écrit pendant la sauvegarde.
    """
    from app.modules.settings import sauvegarde

    return sauvegarde.creer_sauvegarde()


# `job_type` → l'exécutant, qui reçoit `input_json`.
_EXECUTANTS = {
    "backup_create": _backup_create,
    "srs_cards_generate": _srs_cards_generate,
    "capsule_generate": _capsule_generate,
    "capsule_regenerate": _capsule_regenerate,
    "capsule_voice": _capsule_voice,
    "curriculum_chapters": _curriculum_chapters,
    "curriculum_lessons": _curriculum_lessons,
    "curriculum_skills_backfill": _curriculum_skills_backfill,
    "equip_notion": _equip_notion,
    "fiche_generate": _fiche_generate,
    "fiche_regenerate": _fiche_regenerate,
    "mindmap_generate": _mindmap_generate,
    "mindmap_regenerate": _mindmap_regenerate,
    "quiz_generate": _quiz_generate,
    "quiz_regenerate": _quiz_regenerate,
    "lesson_content": _lesson_content,
    "diagnostic_generate": _diagnostic_generate,
}


def run_ai_job(job_id: int) -> dict:
    """Exécute un TRAVAIL unitaire déjà enfilé (ADR-0041 §3).

    ⚠️ **Le passage en `running` est COMMITÉ à part, avant le travail.** C'est lui qui fait
    basculer la barre de « en file d'attente » à « en cours » ; le garder dans la transaction du
    travail le rendrait invisible jusqu'à la fin, c'est-à-dire inutile.

    ⚠️ **L'échec relit le job après `rollback()`** : la session est cassée par l'exception, et
    l'objet chargé avant ne peut plus être écrit.

    🔴 **Relancer a CHANGÉ DE SENS le 2026-08-06, et il faut le savoir avant de toucher ce bloc**
    (ADR-0041 §10.2). Avant, relancer voulait dire « que RQ voie l'échec », par symétrie avec
    `worker_media.jobs.render_capsule`. Depuis que `enqueue_ai_job` pose un `Retry`, **relancer
    veut dire *rejoue-moi*** : RQ rejoue sur toute exception qui remonte, sans regarder laquelle.
    Le seul moyen d'obtenir « zéro tentative sur échec structurel », c'est donc de **retenir**
    l'exception — un `raise` posé par réflexe rendrait le rejeu typé silencieusement inopérant, et
    aucun test ne rougirait puisque les files sont factices (§15).
    """
    from app.db.base import SessionLocal
    from app.db.models import AIJob
    from app.modules.ai import get_embedder, get_provider
    from app.modules.production import failures

    db = SessionLocal()
    try:
        job = db.get(AIJob, job_id)
        if job is None:
            logger.warning("run_ai_job: travail %s introuvable", job_id)
            return {"error": "introuvable"}

        executant = _EXECUTANTS.get(job.job_type)
        if executant is None:
            job.status = "failed"
            job.error_message = f"Aucun exécutant pour « {job.job_type} »."
            job.finished_at = _now()
            db.commit()
            return {"error": job.error_message}

        debut = _now()
        job.status = "running"
        job.started_at = debut
        db.commit()

        payload = job.input_json if isinstance(job.input_json, dict) else {}
        try:
            sortie = executant(db, payload, get_provider(), get_embedder())
        except Exception as exc:  # noqa: BLE001 — on trace, on qualifie, PUIS on décide de relancer
            db.rollback()
            rejoue = failures.doit_rejouer(exc)
            echoue = db.get(AIJob, job_id)
            if echoue is not None:
                # ⚠️ **`queued` sur un rejeu, et pas `failed`.** Le travail RETOURNE dans la file :
                # écrire `failed` le ferait apparaître comme un échec à acquitter (§8) pendant que
                # RQ s'apprête à le reprendre — Papa verrait un échec qui se répare tout seul, ce
                # qui est pire qu'un échec. `finished_at` reste vide : rien n'est fini.
                echoue.status = "queued" if rejoue else "failed"
                echoue.error_message = str(exc)[:1000]
                echoue.finished_at = None if rejoue else _now()
                db.commit()
            if rejoue:
                raise
            logger.warning(
                "run_ai_job: travail %s en échec STRUCTUREL, aucun rejeu — %s", job_id, exc
            )
            return {"error": str(exc)[:1000]}

        fin = _now()
        job = db.get(AIJob, job_id)
        job.status = "succeeded"
        job.output_json = sortie if isinstance(sortie, dict) else {"result": sortie}
        job.duration_ms = int((fin - debut).total_seconds() * 1000)
        job.finished_at = fin
        # Le motif d'une tentative précédente ne survit pas au succès : un travail `succeeded` qui
        # porterait encore « Ollama injoignable » ferait mentir la trace sur ce qui s'est passé.
        job.error_message = None
        db.commit()
        return job.output_json
    finally:
        db.close()


def scan_triggers() -> dict:
    """Job PÉRIODIQUE du déclencheur automatique (ADR-0035 §2) — il REGARDE, il ne produit pas.

    Il lit l'agenda **et la file des demandes** (ADR-0036 §1), applique les conditions propres à
    chacun, crée les runs — et **se replanifie lui-même**. Les
    lots créés partent dans la même file et sont exécutés par `run_production`, comme ceux que
    Papa lance : **un seul chemin d'exécution**, quelle que soit l'origine.

    ⚠️ **La replanification est en `finally`.** Un scan qui échouerait sans se replanifier
    arrêterait le dispositif **définitivement et en silence** — le pire mode de panne pour une
    tâche de fond que personne ne regarde.

    ⚠️ **Il BALAIE aussi les travaux morts** (ADR-0041 §10.3). Pas parce que ça a un rapport avec
    l'agenda, mais parce que c'est le seul réveil périodique du dépôt et que l'ADR-0023 en interdit
    un second. Le balayage est du **ménage** : ce qui rend la barre honnête, c'est la lecture
    dérivée (`sweep.job_status`, `journal.run_status`), pas ce passage-ci — il bat toutes les trois
    heures. Le confondre avec la garantie d'affichage laisserait l'écran mentir tout ce temps.

    ⚠️ **Le balayage ne doit pas pouvoir empêcher le scan.** Il est donc isolé : une session cassée
    par le ménage ferait sauter la lecture de l'agenda, c'est-à-dire perdre la préparation d'un
    contrôle pour une raison qui n'a rien à voir avec elle.
    """
    from app.core.queue import QueueUnavailable, production_queue
    from app.core.config import settings
    from app.db.base import SessionLocal
    from app.db.models import ProductionRun
    from app.modules.production import runs, sweep, triggers

    def _enfiler_les_lots(crees: list[dict], *, trigger: str) -> None:
        """Enfile les lots que le scan vient de créer, en **supprimant** ceux que la file refuse.

        ⚠️ **Un lot par un lot, et l'échec de l'un n'emporte pas les autres.** Sans ça, une file
        qui tombe entre deux enfilements laisserait derrière elle des lots fantômes — jamais
        exécutés, mais comptés par `run_exists_for`, donc **bloquant leur propre recréation** au
        prochain réveil. Le scan est idempotent : ce qu'il supprime ici, il le recrée dans trois
        heures. C'est ça, « rien ne se perd » quand personne ne regarde.
        """
        for cree in crees:
            lot = db.get(ProductionRun, cree["run_id"])
            if lot is None:
                continue
            try:
                runs.enqueue_or_cancel(db, lot, trigger=trigger)
            except QueueUnavailable:
                logger.warning(
                    "production: file injoignable, lot %s annulé (il sera recréé)", cree["run_id"]
                )

    db = SessionLocal()
    try:
        try:
            ferme = sweep.sweep(db)
            if ferme["runs"] or ferme["jobs"]:
                logger.info("production: balayage — %s lots, %s travaux refermés",
                            ferme["runs"], ferme["jobs"])
        except Exception:  # noqa: BLE001 — le ménage ne commande pas le sort du scan
            logger.exception("production: balayage des travaux morts impossible")
            db.rollback()
        # DEUX scans, un par source (ADR-0036 §1). Séparés parce que leurs conditions le sont :
        # l'agenda demande un déclencheur armé, les demandes exigent EN PLUS le régime *Autonome*.
        # Un scan unique aurait dû porter les deux jeux de conditions et le dire dans un seul
        # compte rendu — c'est-à-dire rendre illisible pourquoi il n'a rien fait.
        report = triggers.scan_agenda(db)
        report["requests"] = triggers.scan_requests(db)
        # ⚠️ Le `trigger` est passé EXPLICITEMENT et par source (ADR-0041 §5) : il choisit la file.
        # Un lot né du scan n'est attendu devant aucun écran — il ne double personne.
        _enfiler_les_lots(report["created"], trigger="agenda")
        _enfiler_les_lots(report["requests"]["created"], trigger="request")
        return report
    finally:
        db.close()
        from datetime import timedelta

        production_queue().enqueue_in(
            timedelta(minutes=settings.production_scan_interval_minutes), scan_triggers
        )
