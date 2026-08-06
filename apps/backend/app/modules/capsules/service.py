"""Service de génération d'un `CapsuleSpec` par IA (SYNCHRONE — API `LLMProvider` réelle).

Pipeline (ADR-0007) : `build_prompt` (few-shot) → `LLMProvider.generate` avec sortie
structurée ollama (`fmt` = JSON Schema) → `CapsuleSpec.model_validate_json` (garantie dure).
Une seule réparation en cas d'échec, puis erreur propre. Chaque appel laisse une trace
`ai_jobs` (`job_type="capsule_generate"`), exactement comme `diagnostic_generate`.

Slice A : aucune route, aucune persistance du spec — on renvoie l'objet validé et on trace.
"""

import copy
import logging
import math
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob, Capsule, CapsuleView, Chapter, Skill, Subject
from app.modules.provenance import PARENT, mark_validated
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.capsules import storage
from app.modules.capsules.schemas import FPS, MAX_DURATION, CapsuleSpec, generation_schema
from app.modules.tts.provider import TtsProvider, TtsRequest
from app.prompts import capsule

logger = logging.getLogger(__name__)

DEFAULT_LEVEL = "4e"
VALIDATION_STATUSES = ("pending", "validated", "rejected")
# Marge après la fin de la voix pour qu'une scène ne coupe pas net (~0,4 s).
AUDIO_PADDING_FRAMES = 12


class CapsuleGenerationError(Exception):
    """La génération a échoué (sortie LLM invalide même après une réparation)."""


def _strip_fences(text: str) -> str:
    """Nettoyage défensif : retire d'éventuelles balises ``` autour de l'objet JSON.

    Les petits modèles violent parfois la consigne « aucune balise » malgré `fmt`.
    """
    s = text.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.rstrip().endswith("```"):
            s = s.rstrip()[:-3]
    return s.strip()


def _try_validate(raw: str) -> tuple[CapsuleSpec | None, str | None]:
    """Valide `raw` en `CapsuleSpec`. Retourne (spec, None) ou (None, message d'erreur)."""
    try:
        return CapsuleSpec.model_validate_json(_strip_fences(raw)), None
    except ValidationError as exc:
        # Message compact, réinjectable dans le prompt de réparation.
        detail = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors()[:6]
        )
        return None, detail or "schéma invalide"
    except ValueError as exc:  # JSON malformé (JSONDecodeError hérite de ValueError)
        return None, f"JSON invalide : {exc}"


def generate_capsule_spec(
    session: Session,
    llm: LLMProvider,
    instruction: str,
    subject: str,
    level: str,
    skill: str | None = None,
    visual: str = "auto",
    duration: str = "moyenne",
    difficulty: str = "moyen",
) -> CapsuleSpec:
    """Génère un `CapsuleSpec` validé à partir d'une instruction Papa. Trace `ai_jobs`.

    `visual`/`duration`/`difficulty` = choix Papa (droite graduée, durée du clip, niveau).
    Lève `CapsuleGenerationError` si la sortie reste invalide après une réparation (rien
    n'est renvoyé ni persisté dans ce cas).
    """
    system, prompt = capsule.build_prompt(
        instruction, subject, level, skill, visual=visual, duration=duration, difficulty=difficulty
    )
    # narration forcée requise pour la génération (le stockage reste tolérant).
    schema = generation_schema()

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="capsule_generate",
        status="running",
        input_json={
            "instruction": instruction,
            "subject": subject,
            "level": level,
            "skill": skill,
            "visual": visual,
            "duration": duration,
            "difficulty": difficulty,
            "prompt_version": capsule.CAPSULE_PROMPT_VERSION,
        },
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    session.add(job)
    session.flush()

    try:
        raw = llm.generate(
            LLMRequest(system=system, prompt=prompt, fmt=schema, temperature=0.2)
        ).text
        spec, error = _try_validate(raw)

        if spec is None:
            # UNE seule réparation : on réinjecte le prompt, la réponse fautive, la consigne
            # de correction et l'erreur concrète.
            repair_prompt = (
                f"{prompt}\n\n--- Ta réponse précédente (invalide) ---\n{raw}\n\n"
                f"{capsule.REPAIR_INSTRUCTION}{error}"
            )
            raw = llm.generate(
                LLMRequest(system=system, prompt=repair_prompt, fmt=schema, temperature=0.2)
            ).text
            spec, error = _try_validate(raw)

        if spec is None:
            raise CapsuleGenerationError(f"CapsuleSpec invalide après réparation : {error}")
    except CapsuleGenerationError as exc:
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        session.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — erreur provider/réseau : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        session.commit()
        raise CapsuleGenerationError(f"Appel LLM échoué : {exc}") from exc

    job.status = "succeeded"
    job.output_json = {"title": spec.title, "scenes_count": len(spec.scenes)}
    job.finished_at = datetime.now(timezone.utc)
    session.commit()
    return spec


# ---------------------------------------------------------------------------
# Lot 1 (ADR-0007) : persistance + CRUD Papa. Une capsule persistée porte le
# CapsuleSpec (spec_json), l'instruction d'origine et un statut de validation.
# ---------------------------------------------------------------------------


def _subject_or_404(db: Session, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matière introuvable.")
    return subject


def _capsule_or_404(db: Session, capsule_id: int) -> Capsule:
    capsule = db.get(Capsule, capsule_id)
    if capsule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Capsule introuvable.")
    return capsule


def _resolve_context(db: Session, subject_id: int, skill_id: int | None) -> tuple[Subject, Skill | None]:
    subject = _subject_or_404(db, subject_id)
    skill = db.get(Skill, skill_id) if skill_id is not None else None
    return subject, skill


def _validate_chapter(db: Session, chapter_id: int | None) -> None:
    """Vérifie qu'un chapitre fourni existe (400 sinon). `None` = pas de classement."""
    if chapter_id is not None and db.get(Chapter, chapter_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chapitre introuvable.")


def _chapter_name(db: Session, chapter_id: int | None) -> str | None:
    if chapter_id is None:
        return None
    chapter = db.get(Chapter, chapter_id)
    return chapter.name if chapter else None


def create_capsule(
    db: Session,
    llm: LLMProvider,
    subject_id: int,
    instruction: str,
    level: str | None = None,
    skill_id: int | None = None,
    chapter_id: int | None = None,
    visual: str = "auto",
    duration: str = "moyenne",
    difficulty: str = "moyen",
) -> Capsule:
    """Génère un CapsuleSpec (trace ai_jobs) puis persiste la capsule en `pending`."""
    subject, skill = _resolve_context(db, subject_id, skill_id)
    _validate_chapter(db, chapter_id)
    lvl = level or (skill.level if skill else None) or DEFAULT_LEVEL
    spec = generate_capsule_spec(
        db,
        llm,
        instruction,
        subject.name,
        lvl,
        skill=(skill.name if skill else None),
        visual=visual,
        duration=duration,
        difficulty=difficulty,
    )
    capsule = Capsule(
        subject_id=subject.id,
        skill_id=skill_id,
        chapter_id=chapter_id,
        difficulty=difficulty,
        title=spec.title[:200],
        instruction=instruction,
        spec_json=spec.model_dump(),
        validation_status="pending",
        status="draft",
    )
    db.add(capsule)
    db.commit()
    db.refresh(capsule)
    return capsule


def list_capsules(db: Session) -> list[Capsule]:
    return list(db.scalars(select(Capsule).order_by(Capsule.id.desc())))


def get_capsule(db: Session, capsule_id: int) -> Capsule:
    return _capsule_or_404(db, capsule_id)


def update_spec(db: Session, capsule_id: int, spec: CapsuleSpec) -> Capsule:
    """Remplace le spec (déjà validé par le schéma). Une édition repasse en `pending`."""
    capsule = _capsule_or_404(db, capsule_id)
    capsule.spec_json = spec.model_dump()
    capsule.title = spec.title[:200]
    capsule.validation_status = "pending"
    db.commit()
    db.refresh(capsule)
    return capsule


def regenerate_capsule(
    db: Session,
    llm: LLMProvider,
    capsule_id: int,
    instruction: str | None = None,
    visual: str = "auto",
    duration: str = "moyenne",
    difficulty: str | None = None,
) -> Capsule:
    """Régénère le spec d'une capsule existante (instruction éventuellement modifiée)."""
    capsule = _capsule_or_404(db, capsule_id)
    subject, skill = _resolve_context(db, capsule.subject_id, capsule.skill_id)
    instr = instruction or capsule.instruction or ""
    lvl = (skill.level if skill else None) or DEFAULT_LEVEL
    # Difficulté : celle demandée, sinon on conserve celle de la capsule (défaut « moyen »).
    diff = difficulty or capsule.difficulty or "moyen"
    spec = generate_capsule_spec(
        db,
        llm,
        instr,
        subject.name,
        lvl,
        skill=(skill.name if skill else None),
        visual=visual,
        duration=duration,
        difficulty=diff,
    )
    capsule.instruction = instr
    capsule.difficulty = diff
    capsule.spec_json = spec.model_dump()
    capsule.title = spec.title[:200]
    capsule.validation_status = "pending"
    db.commit()
    db.refresh(capsule)
    return capsule


def delete_capsule(db: Session, capsule_id: int) -> None:
    capsule = _capsule_or_404(db, capsule_id)
    db.delete(capsule)
    # 🔴 **Le rendu en attente meurt avec sa capsule** (addendum 2 ADR-0041 §22, trouvé à l'écran
    # le 2026-08-07). Depuis que le travail est créé DÈS l'enfilement, supprimer la capsule
    # laissait une ligne `queued` que plus rien ne pouvait satisfaire : la bande annonçait
    # « 1 en attente » indéfiniment, sur un travail sans cible.
    #
    # ⚠️ Le balayage périodique ne peut PAS rattraper ça : un travail `queued` n'est jamais
    # déclaré zombie, et c'est une règle juste — « le passer en échec condamnerait une file
    # parfaitement intacte ». Une file intacte, ici, ne l'est plus : c'est à la suppression, qui
    # SAIT, de le dire.
    #
    # ⚠️ On ne touche PAS à un rendu déjà `running` : le worker est dedans, il découvrira l'absence
    # et écrira son propre motif. Le lui voler ferait deux traces pour un travail.
    for travail in db.scalars(
        select(AIJob).where(AIJob.job_type == "capsule_render", AIJob.status == "queued")
    ):
        charge = travail.input_json if isinstance(travail.input_json, dict) else {}
        if charge.get("capsule_id") == capsule_id:
            travail.status = "failed"
            travail.finished_at = datetime.now(timezone.utc)
            travail.error_message = "Capsule supprimée avant son rendu."
            # Acquitté d'office : Papa vient de supprimer la capsule, lui présenter l'échec du
            # rendu qu'il a lui-même annulé serait lui demander de confirmer sa propre décision.
            travail.acknowledged_at = travail.finished_at
    db.commit()
    # Nettoie les médias (audio disque + MP4) — best-effort, après le commit DB.
    storage.delete_capsule_audio(capsule_id)
    storage.delete_capsule_video(capsule_id)


def set_chapter(db: Session, capsule_id: int, chapter_id: int | None) -> Capsule:
    """(Re)rattache une capsule à un chapitre (ou aucun si `None`). Papa-only."""
    capsule = _capsule_or_404(db, capsule_id)
    _validate_chapter(db, chapter_id)
    capsule.chapter_id = chapter_id
    db.commit()
    db.refresh(capsule)
    return capsule


def set_validation(db: Session, capsule_id: int, new_status: str) -> Capsule:
    if new_status not in VALIDATION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Statut de validation invalide."
        )
    capsule = _capsule_or_404(db, capsule_id)
    if new_status == "validated":
        # Seul chemin de validation d'une capsule : Papa l'a ouverte dans le pilotage (§F.3).
        mark_validated(capsule, PARENT)
    else:
        capsule.validation_status = new_status
    db.commit()
    db.refresh(capsule)
    return capsule


def validate_capsule(db: Session, capsule_id: int) -> Capsule:
    """Papa valide une capsule. « Rendu auto à la validation » : si la voix est déjà
    synthétisée, le rendu MP4 est enfilé aussitôt pour que Massimo l'ait sans clic manuel.

    Un échec d'enfilement (file RQ / Redis indisponible) ne fait JAMAIS échouer la
    validation : la capsule reste validée et Papa peut relancer le rendu à la main. La
    robustesse locale prime sur l'automatisme (CLAUDE.md)."""
    capsule = set_validation(db, capsule_id, "validated")
    # Rien à rendre sans narration ; on n'enfile pas deux fois un rendu déjà en cours.
    if not _has_narrated_audio(capsule.spec_json) or capsule.status == "rendering":
        return capsule
    try:
        return request_render(db, capsule_id)
    except HTTPException:
        # Préconditions finalement non réunies : capsule simplement validée (sans rendu).
        return capsule
    except Exception:  # file RQ / Redis indisponible, etc.
        logger.warning(
            "Rendu auto à la validation impossible (capsule %s) ; rendu manuel possible.",
            capsule_id,
        )
        # `request_render` a pu committer status="rendering" avant d'échouer à l'enfilement :
        # on remet en `draft` pour ne pas laisser la capsule bloquée en « rendering » côté UI.
        db.rollback()
        fresh = db.get(Capsule, capsule_id)
        if fresh is not None and fresh.status == "rendering" and not fresh.video_url:
            fresh.status = "draft"
            fresh.video_url = None
            db.commit()
            db.refresh(fresh)
        return fresh if fresh is not None else capsule


# ---------------------------------------------------------------------------
# Lot 2 (ADR-0007) : rendu MP4 asynchrone. Le backend ne rend jamais lui-même — il
# vérifie les préconditions, passe la capsule en `rendering` et enfile un job RQ que
# `worker-media` (process sandboxé, séparé) consomme. `set_render_status` est le point
# d'écriture utilisé par le worker au terme du rendu.
# ---------------------------------------------------------------------------

RENDER_STATUSES = ("draft", "rendering", "published", "failed")


def _has_narrated_audio(spec: object) -> bool:
    scenes = spec.get("scenes", []) if isinstance(spec, dict) else []
    return any(isinstance(s, dict) and s.get("audioUrl") for s in scenes)


def request_render(db: Session, capsule_id: int) -> Capsule:
    """Papa : demande le rendu MP4. Préconditions = capsule **validée** + voix synthétisée.
    Passe en `rendering` et enfile le job RQ (le worker fait le reste). Re-jouable.

    ⚠️ **Si la file refuse, la capsule REVIENT à son état d'avant** (ADR-0041 §10.1). C'était le
    même trou que côté production, sur une autre table : `rendering` était commité avant
    l'enfilement, donc Redis absent laissait une capsule « en cours de rendu » **pour toujours** —
    et son `video_url` effacé au passage, ce qui rendait invisible la vidéo précédente qui, elle,
    existait toujours. Une panne de file faisait disparaître un contenu déjà produit.

    ⚠️ **On restaure APRÈS coup plutôt que d'enfiler avant de commiter**, et c'est délibéré :
    enfiler d'abord ouvrirait une course — le worker peut prendre le job dans la milliseconde,
    finir, écrire `published`, et notre commit repasserait la capsule en `rendering` par-dessus.
    Une compensation se voit dans le code ; une course ne se voit qu'en production.
    """
    capsule = _capsule_or_404(db, capsule_id)
    if capsule.validation_status != "validated":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La capsule doit être validée avant le rendu.",
        )
    if not _has_narrated_audio(capsule.spec_json):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Synthétise la voix (bouton Voix) avant de rendre la vidéo.",
        )
    # Import paresseux : évite de charger redis/rq (et d'ouvrir une connexion) à l'import du
    # module, notamment sous les tests qui ne touchent pas la file.
    from app.core.queue import MESSAGE_FILE_INJOIGNABLE, QueueUnavailable, enqueue_render

    statut_avant, video_avant = capsule.status, capsule.video_url
    capsule.status = "rendering"
    capsule.video_url = None
    # Le travail existe DÈS L'ENFILEMENT (addendum 2 ADR-0041 §22), et pas seulement quand le
    # worker le ramasse. Sans cette ligne, un rendu qui attend est invisible : la barre ne le voit
    # naître qu'au démarrage, exactement le défaut que la Slice A avait corrigé pour tous les
    # autres producteurs. `worker_media` la retrouve et la fait passer en `running`.
    travail = AIJob(
        job_type="capsule_render",
        status="queued",
        input_json={"capsule_id": capsule_id},
        created_by="parent",
        created_at=datetime.now(timezone.utc),
    )
    db.add(travail)
    db.commit()
    try:
        enqueue_render(capsule_id)
    except QueueUnavailable as exc:
        capsule.status = statut_avant
        capsule.video_url = video_avant
        # ⚠️ Le travail part avec le reste : le §10.1 promet « rien n'a été lancé, et rien n'a été
        # créé ». Laisser une ligne `queued` que personne ne consommera ferait mentir la barre
        # jusqu'au prochain balayage — un travail fantôme, la faute que ce §10.1 a supprimée.
        db.delete(travail)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=MESSAGE_FILE_INJOIGNABLE
        ) from exc
    db.refresh(capsule)
    return capsule


def set_render_status(
    db: Session, capsule_id: int, *, render_status: str, video_url: str | None = None
) -> Capsule:
    """Écrit l'issue du rendu (appelé par worker-media). Sans dépendance FastAPI."""
    capsule = db.get(Capsule, capsule_id)
    if capsule is None:
        raise ValueError(f"Capsule {capsule_id} introuvable")
    capsule.status = render_status
    if video_url is not None:
        capsule.video_url = video_url
    db.commit()
    db.refresh(capsule)
    return capsule


def list_published(db: Session) -> list[Capsule]:
    """Capsules visibles par Massimo : validées ET rendues (MP4 disponible)."""
    return list(
        db.scalars(
            select(Capsule)
            .where(Capsule.validation_status == "validated", Capsule.video_url.is_not(None))
            .order_by(Capsule.id.desc())
        )
    )


# ---------------------------------------------------------------------------
# Suivi des visionnages (Massimo) : « vu / non-vu » + compteur de capsules distinctes.
# Un seul enregistrement par (élève, capsule) → revoir une capsule ne double pas le compte.
# ---------------------------------------------------------------------------


def record_view(db: Session, student_id: int, capsule_id: int) -> None:
    """Enregistre un visionnage complet : incrémente le compteur (ou crée la ligne à 1).
    « Vu » = la ligne existe ; « vues distinctes » = nb de lignes ; répétitions = `count`.
    Capsule publiée uniquement."""
    capsule = db.get(Capsule, capsule_id)
    if capsule is None or capsule.validation_status != "validated" or not capsule.video_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Capsule indisponible."
        )
    row = db.scalar(
        select(CapsuleView).where(
            CapsuleView.student_id == student_id, CapsuleView.capsule_id == capsule_id
        )
    )
    now = datetime.now(timezone.utc)
    if row is not None:
        row.count += 1
        row.viewed_at = now
    else:
        db.add(CapsuleView(student_id=student_id, capsule_id=capsule_id, viewed_at=now, count=1))
    db.commit()


def _default_student_id(db: Session) -> int | None:
    """Élève courant (MVP mono-élève) : premier `StudentProfile`. Requête directe (pas
    d'import du module eli5, pour éviter tout cycle d'import)."""
    from app.db.models import StudentProfile

    return db.scalar(select(StudentProfile.id).order_by(StudentProfile.id))


def _capsule_view_count(db: Session, capsule_id: int) -> int:
    """Nombre de visionnages de la capsule par l'élève courant (0 si jamais vue)."""
    sid = _default_student_id(db)
    if sid is None:
        return 0
    return (
        db.scalar(
            select(CapsuleView.count).where(
                CapsuleView.student_id == sid, CapsuleView.capsule_id == capsule_id
            )
        )
        or 0
    )


def seen_capsule_ids(db: Session, student_id: int) -> set[int]:
    """Ids des capsules déjà vues par l'élève (une requête, pas de N+1)."""
    return set(
        db.scalars(select(CapsuleView.capsule_id).where(CapsuleView.student_id == student_id))
    )


def capsule_stats(db: Session, student_id: int) -> dict:
    """Statistiques enfant : total publié, vues distinctes, nouvelles (non vues),
    et total de visionnages (somme des `count`, répétitions incluses)."""
    published_ids = {c.id for c in list_published(db)}
    seen_count = len(seen_capsule_ids(db, student_id) & published_ids)
    total = len(published_ids)
    view_count = 0
    if published_ids:
        view_count = sum(
            db.scalars(
                select(CapsuleView.count).where(
                    CapsuleView.student_id == student_id,
                    CapsuleView.capsule_id.in_(published_ids),
                )
            )
        )
    return {
        "total": total,
        "seen_count": seen_count,
        "new_count": total - seen_count,
        "view_count": view_count,
    }


def new_capsules_count(db: Session, student_id: int) -> int:
    """Capsules publiées JAMAIS VUES — témoin de nouveauté de navigation (adr-0030 §3).

    Délègue à `capsule_stats` : `capsule_views` est la trace de vue, et une seule définition de
    « capsule nouvelle » doit exister dans le module. Aucune date n'entre dans ce compteur — il
    naît d'une publication par Papa et meurt du visionnage.
    """
    return capsule_stats(db, student_id)["new_count"]


def synthesize_voice(db: Session, tts: TtsProvider, capsule_id: int) -> Capsule:
    """Synthétise la narration de chaque scène (Piper), cale la durée sur la voix et
    renseigne `audioUrl`. « La voix pilote la durée » : chaque scène narrée dure au moins le
    temps de son audio (+ marge). Trace `ai_jobs` (`capsule_voice`). Re-jouable."""
    capsule = _capsule_or_404(db, capsule_id)
    if not isinstance(capsule.spec_json, dict) or not capsule.spec_json.get("scenes"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Capsule sans spec exploitable."
        )
    # Deepcopy : muter capsule.spec_json en place empêcherait SQLAlchemy de détecter le
    # changement (nouvelle valeur == snapshot muté → pas d'UPDATE).
    spec = copy.deepcopy(capsule.spec_json)

    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="capsule_voice",
        status="running",
        input_json={"capsule_id": capsule_id, "scenes": len(spec["scenes"])},
        created_by="parent",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()

    try:
        narrated = 0
        first_url: str | None = None
        for i, scene in enumerate(spec["scenes"]):
            text = (scene.get("narration") or "").strip()
            if not text:
                continue
            res = tts.synthesize(TtsRequest(text=text))
            storage.write_scene_audio(capsule_id, i, res.audio_wav)
            audio_frames = math.ceil(res.duration_seconds * FPS) + AUDIO_PADDING_FRAMES
            # La scène dure AU MOINS le temps de sa narration (jamais coupée), plafonnée.
            scene["durationInFrames"] = min(
                MAX_DURATION, max(int(scene.get("durationInFrames", 0)), audio_frames)
            )
            scene["audioUrl"] = f"/api/capsules/{capsule_id}/audio/{i}"
            first_url = first_url or scene["audioUrl"]
            narrated += 1

        if narrated == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Aucune scène ne comporte de narration à synthétiser.",
            )

        # Re-valide le spec enrichi (durées ≤ MAX, audioUrl typé) avant de persister.
        validated = CapsuleSpec.model_validate(spec)
        capsule.spec_json = validated.model_dump()  # réassignation → dirty flag JSON
        capsule.audio_url = first_url
    except HTTPException:
        job.status = "failed"
        job.error_message = "Requête invalide (spec/narration manquante)."
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001 — échec Piper/synthèse : on trace puis on remonte.
        job.status = "failed"
        job.error_message = str(exc)[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise CapsuleGenerationError(f"Synthèse vocale échouée : {exc}") from exc

    job.status = "succeeded"
    job.output_json = {"narrated_scenes": narrated}
    job.finished_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(capsule)
    return capsule


def capsule_out(db: Session, capsule: Capsule) -> dict:
    """Sérialise une capsule pour l'API (avec le nom de matière et le spec complet)."""
    subject = db.get(Subject, capsule.subject_id)
    return {
        "id": capsule.id,
        "subject_id": capsule.subject_id,
        "subject": subject.name if subject else "",
        "subject_slug": subject.slug if subject else "",
        "skill_id": capsule.skill_id,
        "chapter_id": capsule.chapter_id,
        "chapter": _chapter_name(db, capsule.chapter_id),
        "difficulty": capsule.difficulty,
        "title": capsule.title,
        "instruction": capsule.instruction,
        "validation_status": capsule.validation_status,
        "spec": capsule.spec_json,
        "status": capsule.status,
        "video_url": capsule.video_url,
        "view_count": _capsule_view_count(db, capsule.id),
        "created_at": capsule.created_at,
        "updated_at": capsule.updated_at,
    }


def capsule_list_item(db: Session, capsule: Capsule) -> dict:
    subject = db.get(Subject, capsule.subject_id)
    spec = capsule.spec_json if isinstance(capsule.spec_json, dict) else {}
    return {
        "id": capsule.id,
        "title": capsule.title,
        "subject": subject.name if subject else "",
        "subject_slug": subject.slug if subject else "",
        "chapter_id": capsule.chapter_id,
        "chapter": _chapter_name(db, capsule.chapter_id),
        "difficulty": capsule.difficulty,
        "validation_status": capsule.validation_status,
        "scenes_count": len(spec.get("scenes", [])),
        "status": capsule.status,
        "video_url": capsule.video_url,
        "view_count": _capsule_view_count(db, capsule.id),
        "updated_at": capsule.updated_at,
    }


def capsule_public_item(db: Session, capsule: Capsule, seen: bool = False) -> dict:
    """Vue enfant : id/titre/matière (+ slug/chapitre) + URL vidéo + `seen` (déjà vue)."""
    subject = db.get(Subject, capsule.subject_id)
    return {
        "id": capsule.id,
        "title": capsule.title,
        "subject": subject.name if subject else "",
        "subject_slug": subject.slug if subject else "",
        "chapter_id": capsule.chapter_id,
        "chapter": _chapter_name(db, capsule.chapter_id),
        "difficulty": capsule.difficulty,
        "video_url": capsule.video_url,
        "seen": seen,
    }
