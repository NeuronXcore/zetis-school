"""Orchestrateur d'un tour de chat (ADR-0026, slice A) — le substrat de mémoire.

Un tour, dans l'ordre : lire la session (Redis) → résoudre la notion (module partagé) → composer
un contexte BORNÉ (rappel des notions récentes + cours canonique) → appeler le moteur (sortie
structurée) → écrire la réponse dans Redis → émettre les événements typés → appliquer la règle de
corroboration (Gap). Le pipeline est AVEUGLE AU CONTENU : la seule trace durable est un `ai_jobs`
de MÉTADONNÉES (jamais un texte de message). Aucun XP n'est crédité (§2).
"""

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AIJob, Gap, LearningEvent, Skill, SkillMastery, StudentProfile
from app.modules.activity.events import (
    EVENT_CHAT_DIFFICULTY_DECLARED,
    EVENT_CHAT_TOOL_RESPONSE,
    EVENT_CHAT_TOPIC,
    last_event_of_type,
    log_learning_event,
    log_view_once_per_day,
)
from app.modules.ai.canonical_context import build_canonical_sections, resolve_canonical_context
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.ai.skill_resolution import resolve_skill
from app.modules.chat.actions import resolve_action
from app.modules.chat.announce import compose_announcement
from app.modules.content_requests import service as content_requests_service
from app.modules.chat.schemas import ChatAction, ChatMessageIn, ChatMessageOut, ChatSessionOut
from app.modules.tts.provider import TtsProvider, TtsRequest
from app.modules.chat.store import ROLE_ASSISTANT, ROLE_USER, ChatStore
from app.modules.progress.service import OPEN_GAP_STATUSES
from app.prompts.chat import (
    CHAT_PROMPT_VERSION,
    CHAT_SYSTEM,
    CHAT_TOOL_TYPES,
    CHAT_TURN_PROMPT,
    chat_turn_schema,
)

logger = logging.getLogger(__name__)

# La phrase FIXE de l'asymétrie (§5) : Massimo sait ce qui est retenu. Invariant d'interface,
# pas une ligne de CGU — l'UI (slice B) l'affiche telle quelle.
TRANSPARENCY = "ZETIS retient les notions que tu travailles, pas tes mots."

# Règle de corroboration (§3) : la Gap déclarative est TOUJOURS faible, jamais escaladée.
GAP_SOURCE_AI_OBSERVATION = "ai_observation"  # première utilisation de la valeur (constat §6.3)
GAP_SEVERITY_LOW = "low"
# Corroboration comportementale : une déclaration n'ouvre une lacune que si la maîtrise EXISTE et
# est fragile. Pas de ligne `skill_mastery` (jamais évaluée) → aucune corroboration → pas de Gap.
_GAP_ELIGIBLE_MASTERY = ("unknown", "weak", "learning")

# Garde-fou pédagogique (CLAUDE.md) : aucun feedback humiliant, même venu du moteur.
_BANNED_WORDS = ("nul", "échec", "echec", "grosse lacune")
_SAFE_REPLY = "On regarde ça ensemble — c'est une notion à renforcer, et tu progresses."


def synthesize_speech(tts: TtsProvider, text: str) -> bytes:
    """Voix de ZETIS (Lot 2) — synthèse LOCALE (Piper) de la réponse, à la volée, JAMAIS persistée.

    C'est la parole de ZETIS, pas un propos de Massimo : rien de privé n'est vocalisé. Une panne
    du moteur (Piper absent) → 503, et le client dégrade proprement vers le karaoké muet (comme le
    micro se masque sur un STT 503). Aucun `ai_jobs`, aucun fichier : l'audio vit le temps de la
    réponse HTTP."""
    clean = (text or "").strip()
    if not clean:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Texte vide.")
    try:
        return tts.synthesize(TtsRequest(text=clean)).audio_wav
    except Exception as exc:  # noqa: BLE001 — dégradation propre : 503, jamais 500.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Voix indisponible.",
        ) from exc


def _current_student(db: Session) -> StudentProfile:
    """Élève courant (MVP mono-élève : premier profil — lien auth↔DB ultérieur)."""
    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Aucun profil élève en base (lance `python -m app.db.seed`).",
        )
    return student


def _sanitize(text: str) -> str:
    lowered = text.lower()
    if any(word in lowered for word in _BANNED_WORDS):
        return _SAFE_REPLY
    return text or _SAFE_REPLY


def _append_note(reply: str, note: str) -> str:
    """Ajoute une phrase honnête au `reply` (§3 : « pas de cible → ZETIS le dit »)."""
    reply = reply.strip()
    if not reply:
        return note
    sep = " " if reply.endswith((".", "!", "?", "…")) else ". "
    return f"{reply}{sep}{note}"


def open_session(
    db: Session, store: ChatStore, embedder: EmbeddingProvider | None = None
) -> ChatSessionOut:
    """Ouvre une session (TTL posé à la création), rend la transparence et, s'il y en a une, la
    réponse aux demandes que Massimo avait formulées (addendum ADR-0026).

    L'annonce est **best-effort** : elle ne doit jamais empêcher d'ouvrir une conversation. Un
    embedder absent ou en panne prive du retour, il ne prive pas du chat — même doctrine que
    l'émission des `content_requests`, qui n'échoue jamais un tour."""
    student = _current_student(db)
    session_id = store.create_session(student.id)
    announcement = None
    if embedder is not None:
        try:
            announcement = compose_announcement(db, embedder, student_id=student.id)
        except Exception:  # noqa: BLE001 — un retour manqué ne vaut pas une session refusée
            logger.exception("chat: composition de l'annonce d'ouverture échouée")
    return ChatSessionOut(
        session_id=session_id, transparency=TRANSPARENCY, announcement=announcement
    )


def close_session(db: Session, store: ChatStore, session_id: str) -> None:
    """Purge EXPLICITE de la session — le verbatim disparaît (§1a)."""
    student = _current_student(db)
    store.close_session(student.id, session_id)


def _recall_block(db: Session, *, student_id: int) -> str:
    """« La semaine dernière tu bloquais sur X » (§2) : requête sur `learning_events` filtrée
    (chat_topic / chat_difficulty_declared) sur la fenêtre de rappel — ZÉRO embedding de
    conversation, ZÉRO recherche sémantique. Rappel, jamais relance (§4)."""
    since = datetime.now(timezone.utc) - timedelta(days=settings.chat_recall_window_days)
    rows = db.execute(
        select(LearningEvent, Skill)
        .outerjoin(Skill, Skill.id == LearningEvent.skill_id)
        .where(
            LearningEvent.student_id == student_id,
            LearningEvent.event_type.in_([EVENT_CHAT_TOPIC, EVENT_CHAT_DIFFICULTY_DECLARED]),
            LearningEvent.created_at >= since,
        )
        .order_by(LearningEvent.created_at.desc())
    ).all()
    worked: list[str] = []
    struggled: list[str] = []
    for event, skill in rows:
        name = skill.name if skill is not None else None
        if name is None:
            continue
        if event.event_type == EVENT_CHAT_DIFFICULTY_DECLARED and name not in struggled:
            struggled.append(name)
        elif event.event_type == EVENT_CHAT_TOPIC and name not in worked:
            worked.append(name)
    lines: list[str] = []
    if worked:
        lines.append("Récemment, Massimo a travaillé : " + ", ".join(worked[:5]) + ".")
    if struggled:
        lines.append("Il a dit avoir du mal avec : " + ", ".join(struggled[:5]) + ".")
    return "\n".join(lines)


def _compose_context(
    db: Session, embedder: EmbeddingProvider, *, student_id: int, skill_id: int | None, query: str
) -> str:
    """Contexte injecté, BORNÉ au budget de tokens (§6). Rappel + cours canonique quand la notion
    est résolue (le cours entre par le résolveur partagé — aucun gate réimplémenté)."""
    parts: list[str] = []
    recall = _recall_block(db, student_id=student_id)
    if recall:
        parts.append("## MÉMOIRE (notions récentes)\n" + recall)
    if skill_id is not None:
        ctx = resolve_canonical_context(db, embedder, skill_id=skill_id, query=query)
        canonical = build_canonical_sections(ctx)
        if canonical.strip():
            parts.append(canonical)
    block = "\n\n".join(parts)
    # Estimation grossière ~4 caractères/token ; on tronque au budget (jamais au milieu d'un mot
    # n'est pas requis pour un budget de contexte).
    budget_chars = max(0, settings.chat_context_token_budget) * 4
    if budget_chars and len(block) > budget_chars:
        block = block[:budget_chars]
    return block


def _history_text(store: ChatStore, student_id: int, session_id: str) -> str:
    turns = store.read_turns(student_id, session_id)
    if not turns:
        return "(début de la conversation)"
    who = {ROLE_USER: "Massimo", ROLE_ASSISTANT: "ZETIS"}
    return "\n".join(f"{who.get(t.role, t.role)} : {t.text}" for t in turns[-8:])


def _maybe_open_gap(db: Session, *, student: StudentProfile, skill: Skill) -> None:
    """Règle de corroboration (§3) — la SEULE écriture de `Gap` du chat, toujours faible.

    - sans ligne `skill_mastery` (jamais évaluée) → aucune Gap (pas de corroboration) ;
    - maîtrise `solid`/`mastered` → aucune Gap ;
    - lacune déjà ouverte → NE RIEN écrire (l'événement est la trace ; jamais d'escalade) ;
    - sinon → une Gap `source=ai_observation`, `severity=low`, `status=open`."""
    mastery = db.scalar(
        select(SkillMastery).where(
            SkillMastery.student_id == student.id, SkillMastery.skill_id == skill.id
        )
    )
    if mastery is None or mastery.status not in _GAP_ELIGIBLE_MASTERY:
        return
    existing = db.scalar(
        select(Gap).where(
            Gap.student_id == student.id,
            Gap.skill_id == skill.id,
            Gap.status.in_(OPEN_GAP_STATUSES),
        )
    )
    if existing is not None:
        return  # jamais d'escalade d'une lacune existante par du déclaratif
    db.add(
        Gap(
            student_id=student.id,
            skill_id=skill.id,
            subject_id=skill.subject_id,
            source=GAP_SOURCE_AI_OBSERVATION,
            severity=GAP_SEVERITY_LOW,
            status="open",
            first_detected_at=datetime.now(timezone.utc),
        )
    )


def _maybe_request_content(db: Session, *, student_id: int, signal: dict | None) -> None:
    """Enregistre une demande de contenu à Papa si `resolve_action` a posé le signal (§3, addendum).

    BEST-EFFORT : toute exception est avalée — la file de demandes ne doit JAMAIS faire échouer un
    tour de chat. `create_request` fait un `flush` (pas de commit) : la demande participe à la
    transaction du tour, committée avec le reste.

    Le flush passe par un **SAVEPOINT** (`begin_nested`) : une erreur SQL (violation de l'unicité
    `(student, skill, kind)` sur deux tours concurrents, FK si la notion vient d'être supprimée…)
    invaliderait sinon la Session, et TOUTES les écritures suivantes du tour (événements, Gap,
    `ai_jobs`, commit final) lèveraient `PendingRollbackError` → 500 alors que la réponse est déjà
    générée. Le SAVEPOINT annule la seule demande et laisse la transaction du tour intacte."""
    if not isinstance(signal, dict):
        return
    try:
        with db.begin_nested():
            content_requests_service.create_request(
                db,
                student_id=student_id,
                skill_id=signal["skill_id"],
                content_kind=signal["content_kind"],
            )
    except Exception:  # noqa: BLE001 — best-effort : jamais bloquant pour la conversation.
        pass


def _recent_topic_skill_id(db: Session, *, student_id: int) -> int | None:
    """Notion du dernier `chat_topic` de l'élève — ancre un `chat_tool_response` sans texte à la
    notion en cours (la mémoire est le journal, pas un état de session persistant)."""
    last = last_event_of_type(db, student_id=student_id, event_type=EVENT_CHAT_TOPIC)
    if last is None:
        return None
    return (last.payload_json or {}).get("skill_id")


def _anchored_client_skill_id(db: Session, skill_id: int | None) -> int | None:
    """Notion renvoyée par le client avec un tap, REVALIDÉE — jamais crue sur parole.

    Le client ne fait que réémettre ce que le serveur lui avait donné (`ChatAction.skill_id`), mais
    un payload reste un payload : on repasse par `is_notion_visible`, le contrôle qui empêche déjà
    la route de demande de devenir un oracle d'existence sur les brouillons de Papa. Un id inconnu,
    invisible ou fantaisiste est simplement ignoré — le repli existant reprend la main.
    """
    if skill_id is None:
        return None
    from app.modules.galaxy.service import is_notion_visible

    return skill_id if is_notion_visible(db, skill_id) else None


def _run_turn_llm(
    db: Session,
    provider: LLMProvider,
    *,
    session_id: str,
    turn_index: int,
    system: str,
    prompt: str,
) -> tuple[dict, int]:
    """Appelle le moteur ET trace un `ai_jobs` de MÉTADONNÉES SEULES (§1c) — jamais un message.

    `input_json` = référence (session, index de tour) ; `output_json` (peuplé par l'appelant) =
    métadonnées classées. Le verbatim reste dans Redis. Test-verrou : aucun texte de message ici."""
    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="chat_turn",
        status="running",
        input_json={"session_id": session_id, "turn_index": turn_index},
        created_by="child",
        created_at=now,
        started_at=now,
    )
    db.add(job)
    db.flush()
    try:
        response = provider.generate(
            LLMRequest(prompt=prompt, system=system, fmt=chat_turn_schema())
        )
        parsed = json.loads(response.text)
        if not isinstance(parsed, dict):
            raise ValueError("La réponse IA n'est pas un objet JSON.")
    except Exception as exc:  # noqa: BLE001
        job.status = "failed"
        # `error_message` ne cite jamais le message de Massimo : seulement la nature de l'échec.
        job.error_message = f"chat_turn: {type(exc).__name__}"[:1000]
        job.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="Le moteur de chat a échoué."
        ) from exc

    duration = response.duration_ms
    # `job.output_json` (métadonnées) est complété par l'appelant une fois le tour classé.
    job.status = "succeeded"
    job.duration_ms = duration
    job.finished_at = datetime.now(timezone.utc)
    return parsed, job.id


def handle_message(
    db: Session,
    store: ChatStore,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    session_id: str,
    body: ChatMessageIn,
) -> ChatMessageOut:
    """Un tour complet. Émet les événements SERVEUR, applique la règle Gap, écrit Redis."""
    student = _current_student(db)
    if not store.exists(student.id, session_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session introuvable ou expirée.")

    text = (body.text or "").strip()
    if not text and body.tool_response is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message vide.")

    # Anti-spam (§Points ouverts 3) : plafond de tours par session.
    if store.user_turn_count(student.id, session_id) >= settings.chat_max_turns_per_session:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Assez discuté pour cette session — reviens quand tu veux.",
        )

    resolved_skill_id: int | None = None
    reply = ""
    tool_suggestion = ""
    difficulty_declared = False
    action: ChatAction | None = None

    if text:
        resolution = resolve_skill(db, embedder, student_id=student.id, text=text)
        resolved_skill_id = resolution.skill_id
        skill = resolution.skill

        context_block = _compose_context(
            db, embedder, student_id=student.id, skill_id=resolved_skill_id, query=text
        )
        prompt = CHAT_TURN_PROMPT.format(
            context_block=context_block or "(pas de contexte particulier)",
            history=_history_text(store, student.id, session_id),
            message=text,
        )
        turn_index = store.user_turn_count(student.id, session_id)
        parsed, job_id = _run_turn_llm(
            db,
            provider,
            session_id=session_id,
            turn_index=turn_index,
            system=CHAT_SYSTEM,
            prompt=prompt,
        )

        reply = _sanitize(str(parsed.get("reply") or ""))
        raw_tool = str(parsed.get("tool_suggestion") or "").strip().lower()
        tool_suggestion = raw_tool if raw_tool in CHAT_TOOL_TYPES else ""
        diff = parsed.get("declared_difficulty") or {}
        difficulty_declared = bool(diff.get("declared"))
        kind = str(diff.get("kind") or "autre")[:40]

        # --- Orchestration (ADR-0027) : intent proposé par le LLM → action ANCRÉE serveur ---
        raw_intent = parsed.get("intent")
        action_result = resolve_action(
            db,
            embedder,
            student_id=student.id,
            intent=raw_intent if isinstance(raw_intent, dict) else None,
            fallback_skill_id=resolved_skill_id,
            fallback_skill=skill,
            fallback_text=text,  # libellé de l'offre `request_notion` (notion hors-programme)
        )
        action = action_result.action
        # Signal de demande de contenu (addendum ADR-0027) : posé par `resolve_action` quand un
        # contenu est absent. Le repli ci-dessous peut en produire un autre (notion résolue mais
        # VIDE alors que le LLM n'avait rempli aucun intent) — on garde le premier, sinon celui-là.
        content_signal = action_result.meta.get("content_request")
        if action_result.note:  # « pas de cible → ZETIS le dit » (§1/§3)
            reply = _append_note(reply, action_result.note)

        # Repli d'orchestration (correctif 2026-07-30) : Massimo a NOMMÉ une notion résolue mais le
        # LLM n'a produit aucune action (qwen3 traite souvent un sujet nu comme de la conversation).
        # ZETIS propose alors une porte d'entrée — ELI5, toujours disponible pour une notion visible.
        # Offre IMPLICITE → `confirm=True` (carte à taper, jamais d'auto-nav vocale) ; AUCUNE note
        # d'échec (ZETIS propose, il ne s'excuse pas).
        if action is None and resolved_skill_id is not None:
            # Intent sans outil → MENU de ce qui existe pour la notion (Q1) : ZETIS propose la LISTE
            # (cours/fiche/carte/révision…), pas une seule porte devinée.
            fallback = resolve_action(
                db,
                embedder,
                student_id=student.id,
                intent={"kind": "open_notion"},
                fallback_skill_id=resolved_skill_id,
                fallback_skill=skill,
            )
            if fallback.action is not None:
                fallback.action.confirm = True
                action = fallback.action
            if content_signal is None:
                content_signal = fallback.meta.get("content_request")
            # Notion résolue mais SANS contenu validé à offrir (le repli n'a pas d'action) : ZETIS
            # est honnête plutôt que muet — on remonte sa note. Uniquement si aucune note n'a déjà
            # été posée (évite un doublon quand l'intent primaire portait la même honnêteté).
            if action is None and fallback.note and not action_result.note:
                reply = _append_note(reply, fallback.note)

        # --- Demande de contenu à Papa (addendum ADR-0027) : contenu absent → file dédupliquée ---
        # Best-effort et JAMAIS bloquant : une file en erreur ne doit pas casser une conversation.
        # Le signal est une métadonnée pure (skill_id + content_kind), posée par `resolve_action`.
        _maybe_request_content(db, student_id=student.id, signal=content_signal)

        # --- Événement de sujet (dédupe 1/élève/skill/jour) ---
        if resolved_skill_id is not None and skill is not None:
            log_view_once_per_day(
                db,
                student_id=student.id,
                event_type=EVENT_CHAT_TOPIC,
                payload_key="skill_id",
                payload_value=resolved_skill_id,
                subject_id=skill.subject_id,
                skill_id=resolved_skill_id,
                payload={"skill_id": resolved_skill_id},
            )

        # --- Difficulté déclarée (dédupe 1/élève/skill/jour) + règle de corroboration ---
        if difficulty_declared and resolved_skill_id is not None and skill is not None:
            log_view_once_per_day(
                db,
                student_id=student.id,
                event_type=EVENT_CHAT_DIFFICULTY_DECLARED,
                payload_key="skill_id",
                payload_value=resolved_skill_id,
                skill_id=resolved_skill_id,
                subject_id=skill.subject_id,
                payload={"skill_id": resolved_skill_id, "kind": kind},
            )
            _maybe_open_gap(db, student=student, skill=skill)

        # Métadonnées de trace (aveugle au contenu) : QUE des références/classifications.
        job = db.get(AIJob, job_id)
        if job is not None:
            job.output_json = {
                "skill_id": resolved_skill_id,
                "kind": kind if difficulty_declared else None,
                "tool_type": tool_suggestion or None,
                "duration_ms": job.duration_ms,
                # Orchestration : références/classifications seules (route = chemin d'app, pas un message).
                "action": action_result.meta or None,
            }

        store.append_turn(student.id, session_id, role=ROLE_USER, text=text)
        store.append_turn(student.id, session_id, role=ROLE_ASSISTANT, text=reply)

    # --- Réponse de Massimo à une proposition d'outil : un ACTE, tracé (aucune dédupe) ---
    if body.tool_response is not None:
        tr = body.tool_response
        # Ordre d'ancrage, du plus précis au plus vague. La notion de la carte s'insère AVANT le
        # repli sur le dernier `chat_topic` et APRÈS une résolution du tour : si Massimo parle
        # d'autre chose dans le même message, c'est ce qu'il dit qui fait foi, pas la carte.
        tr_skill_id = (
            resolved_skill_id
            or _anchored_client_skill_id(db, tr.skill_id)
            or _recent_topic_skill_id(db, student_id=student.id)
        )
        log_learning_event(
            db,
            student_id=student.id,
            event_type=EVENT_CHAT_TOOL_RESPONSE,
            skill_id=tr_skill_id,
            payload={
                "tool_type": tr.tool_type,
                "skill_id": tr_skill_id,
                "accepted": tr.accepted,
            },
        )

    db.commit()
    return ChatMessageOut(
        session_id=session_id,
        turn_index=store.user_turn_count(student.id, session_id),
        reply=reply,
        skill_id=resolved_skill_id,
        tool_suggestion=tool_suggestion or None,
        difficulty_declared=difficulty_declared,
        action=action,
    )
