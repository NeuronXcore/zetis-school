"""Service de génération d'un `CapsuleSpec` par IA (SYNCHRONE — API `LLMProvider` réelle).

Pipeline (ADR-0007) : `build_prompt` (few-shot) → `LLMProvider.generate` avec sortie
structurée ollama (`fmt` = JSON Schema) → `CapsuleSpec.model_validate_json` (garantie dure).
Une seule réparation en cas d'échec, puis erreur propre. Chaque appel laisse une trace
`ai_jobs` (`job_type="capsule_generate"`), exactement comme `diagnostic_generate`.

Slice A : aucune route, aucune persistance du spec — on renvoie l'objet validé et on trace.
"""

import copy
import math
from datetime import datetime, timezone

from fastapi import HTTPException, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AIJob, Capsule, Skill, Subject
from app.modules.ai.provider import LLMProvider, LLMRequest
from app.modules.capsules import storage
from app.modules.capsules.schemas import FPS, MAX_DURATION, CapsuleSpec, generation_schema
from app.modules.tts.provider import TtsProvider, TtsRequest
from app.prompts import capsule

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
) -> CapsuleSpec:
    """Génère un `CapsuleSpec` validé à partir d'une instruction Papa. Trace `ai_jobs`.

    `visual`/`duration` = choix Papa (droite graduée, fractions, durée du clip…).
    Lève `CapsuleGenerationError` si la sortie reste invalide après une réparation (rien
    n'est renvoyé ni persisté dans ce cas).
    """
    system, prompt = capsule.build_prompt(
        instruction, subject, level, skill, visual=visual, duration=duration
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


def create_capsule(
    db: Session,
    llm: LLMProvider,
    subject_id: int,
    instruction: str,
    level: str | None = None,
    skill_id: int | None = None,
    visual: str = "auto",
    duration: str = "moyenne",
) -> Capsule:
    """Génère un CapsuleSpec (trace ai_jobs) puis persiste la capsule en `pending`."""
    subject, skill = _resolve_context(db, subject_id, skill_id)
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
    )
    capsule = Capsule(
        subject_id=subject.id,
        skill_id=skill_id,
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
) -> Capsule:
    """Régénère le spec d'une capsule existante (instruction éventuellement modifiée)."""
    capsule = _capsule_or_404(db, capsule_id)
    subject, skill = _resolve_context(db, capsule.subject_id, capsule.skill_id)
    instr = instruction or capsule.instruction or ""
    lvl = (skill.level if skill else None) or DEFAULT_LEVEL
    spec = generate_capsule_spec(
        db,
        llm,
        instr,
        subject.name,
        lvl,
        skill=(skill.name if skill else None),
        visual=visual,
        duration=duration,
    )
    capsule.instruction = instr
    capsule.spec_json = spec.model_dump()
    capsule.title = spec.title[:200]
    capsule.validation_status = "pending"
    db.commit()
    db.refresh(capsule)
    return capsule


def delete_capsule(db: Session, capsule_id: int) -> None:
    capsule = _capsule_or_404(db, capsule_id)
    db.delete(capsule)
    db.commit()
    # Nettoie les pistes audio sur disque (best-effort, après le commit DB).
    storage.delete_capsule_audio(capsule_id)


def set_validation(db: Session, capsule_id: int, new_status: str) -> Capsule:
    if new_status not in VALIDATION_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Statut de validation invalide."
        )
    capsule = _capsule_or_404(db, capsule_id)
    capsule.validation_status = new_status
    db.commit()
    db.refresh(capsule)
    return capsule


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
        "skill_id": capsule.skill_id,
        "title": capsule.title,
        "instruction": capsule.instruction,
        "validation_status": capsule.validation_status,
        "spec": capsule.spec_json,
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
        "validation_status": capsule.validation_status,
        "scenes_count": len(spec.get("scenes", [])),
        "updated_at": capsule.updated_at,
    }
