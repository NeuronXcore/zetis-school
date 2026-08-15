"""Orchestrateur d'un tour de chat (ADR-0026, slice A) — le substrat de mémoire.

Un tour, dans l'ordre : lire la session (Redis) → résoudre la notion (module partagé) → composer
un contexte BORNÉ (rappel des notions récentes + cours canonique) → appeler le moteur (sortie
structurée) → écrire la réponse dans Redis → émettre les événements typés → appliquer la règle de
corroboration (Gap). Le pipeline est AVEUGLE AU CONTENU : la seule trace durable est un `ai_jobs`
de MÉTADONNÉES (jamais un texte de message). Aucun XP n'est crédité (§2).
"""

import json
import logging
import time
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, UploadFile, status
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
from app.modules.ai.canonical_context import (
    CanonicalContext,
    build_canonical_sections,
    resolve_canonical_context,
)
from app.modules.ai.provider import EmbeddingProvider, LLMProvider, LLMRequest
from app.modules.ai.skill_resolution import resolve_skill
from app.modules.chat.actions import resolve_action
from app.modules.chat import recall
from app.modules.chat.announce import compose_announcement
from app.modules.content_requests import service as content_requests_service
from app.modules.chat.schemas import (
    ChatAction,
    ChatGrounding,
    ChatRecall,
    ChatMessageIn,
    ChatMessageOut,
    ChatSessionOut,
)
from app.modules.tts.provider import TtsProvider, TtsRequest
from app.modules.chat.store import ROLE_ASSISTANT, ROLE_USER, ChatStore
from app.modules.progress.service import OPEN_GAP_STATUSES
from app.modules.lesson_resolution import lesson_matching_text
from app.modules.rag.service import retrieve_with_provenance
from app.modules.stt import service as stt_service
from app.modules.stt.provider import SttProvider
from app.prompts.chat_recall import RECALL_PROMPT_VERSION
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

# 🔴 **Aveux d'ignorance du moteur, quand le serveur a TROUVÉ** (correctif live 2026-08-15).
#
# Observé au micro : ZETIS répondait « je n'ai pas ce sujet dans ma mémoire » **tout en affichant
# la carte qui ouvre le cours de français**. Une contradiction visible à l'écran, et c'est l'enfant
# qui arbitre entre les deux — il croira la phrase, pas le bouton.
#
# La cause est structurelle, pas un caprice du modèle : il rédige son `reply` AVANT que le serveur
# ne vérifie quoi que ce soit. Il ne PEUT pas savoir. Le prompt le lui interdit désormais
# (`chat_v3`), et il le fera quand même — une consigne ne garantit rien. C'est le même motif que
# le §7 : quand le serveur SAIT, il tranche.
#
# ⚠️ Testé UNIQUEMENT en présence d'une action ancrée. Sans action, ces phrases sont justes, et
# ce sont même celles qu'on veut.
_AVEUX_IGNORANCE = (
    "je n'ai pas",
    "je n'ai pas encore",
    "j'ai pas",
    "je ne trouve pas",
    "je ne connais pas",
    "je ne sais pas",
    "pas dans ma mémoire",
    "pas en mémoire",
    "pas accès",
    "je le note",
)
_SAFE_WITH_ACTION = "Voilà ce que j'ai pour toi 👇"


def _est_un_aveu(reply: str) -> bool:
    """La phrase du moteur est-elle un aveu d'ignorance ?"""
    minuscule = reply.lower()
    return any(aveu in minuscule for aveu in _AVEUX_IGNORANCE)


def _poser_note(reply: str, note: str) -> str:
    """Ajoute la note du SERVEUR — en REMPLAÇANT la phrase du moteur si elle disait déjà la même.

    Observé au micro le 2026-08-15 : *« Je n'ai pas encore de cours sur Charlemagne dans ma
    mémoire. Je note cette notion pour la prochaine fois ! Ça, je ne le trouve pas encore dans ton
    programme. »* — deux aveux à la suite, dont un que le moteur n'était pas en position de faire.

    Quand le serveur dit lui-même ce qui manque, il le dit **une seule fois et avec les bons
    mots** (composé, déterministe, §16). La phrase du moteur devient au mieux redondante, au pire
    une promesse qu'il n'était pas en mesure de tenir.
    """
    return note if _est_un_aveu(reply) else _append_note(reply, note)


def _corriger_aveu_contredit(reply: str, action: ChatAction | None) -> str:
    """Un aveu d'ignorance démenti par une action ancrée est REMPLACÉ, pas nuancé.

    Le serveur a construit une destination depuis un id validé : le contenu existe, point. Laisser
    la phrase du moteur à côté du bouton demanderait à Massimo de choisir qui croire.
    """
    if action is None:
        return reply
    minuscule = reply.lower()
    if any(aveu in minuscule for aveu in _AVEUX_IGNORANCE):
        return _SAFE_WITH_ACTION
    return reply


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


CHAT_TRANSCRIBE_JOB_TYPE = "chat_transcribe"


def transcribe_utterance(db: Session, stt: SttProvider, file: UploadFile) -> dict:
    """Dictée du chat — délègue au module `stt` partagé, avec un `job_type` qui dit la surface.

    **Aucune logique propre**, et c'est volontaire : le corps est le même pour ELI5, l'atelier et
    le chat, et le module `stt` a précisément été extrait le 2026-08-13 pour que le seul paramètre
    de domaine soit le `job_type`. Ce qui change ici n'est pas le traitement, c'est **la portée**
    (`require_child` côté route) et **la lisibilité de la trace**.

    ⚠️ Le transcript rendu ici **n'est écrit nulle part** — ni dans `ai_jobs` (le module ne le
    persiste plus pour aucun appelant), ni dans Redis à ce stade : c'est `handle_message` qui, si
    Massimo envoie effectivement le texte, l'ajoutera au fil de la session sous TTL. Une dictée
    abandonnée avant l'envoi ne laisse donc **aucune trace de son contenu**, ce qui est le
    comportement attendu de l'`adr-0026` §1.
    """
    return stt_service.transcribe_upload(db, stt, file, job_type=CHAT_TRANSCRIBE_JOB_TYPE)


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


def _contexte_sans_notion(
    db: Session, embedder: EmbeddingProvider, *, query: str
) -> CanonicalContext | None:
    """Le dernier recours quand `resolve_skill` n'a rien reconnu (correctif live du 2026-08-15).

    🔴 **Constaté au micro, deux fois de suite.** *« Explique-moi la différence entre le narrateur
    et le personnage principal »* nomme DEUX notions : la similarité se dilue, aucune ne passe le
    seuil de 0,72 — et toute la chaîne d'ancrage meurt avec la résolution. ZETIS a répondu qu'il
    n'avait pas ça dans les cours. **C'était faux : le cours sur le Narrateur existe, validé.**

    Deux replis, dans l'ordre de la cascade que l'ADR-0011 a figée — **le cours d'abord, le RAG en
    complément** :

    1. `lesson_matching_text` — de quel cours validé cette phrase parle-t-elle, d'après ce que les
       cours *s'appellent* ? Aucun embedding, donc rien à diluer. C'est le repli qui manquait ; le
       RAG ne pouvait pas en tenir lieu, il n'indexe que les sources ingérées, jamais les cours.
    2. le RAG **toutes matières confondues** — sans notion, il n'y a pas de matière à filtrer, et
       le plancher de distance devient le seul garde-fou. C'est exactement sa raison d'être.

    Rend `None` quand les deux se taisent : le chat dit alors qu'il n'est pas sûr de la notion, et
    **n'affirme rien sur ce qu'il possède** — il n'est pas en position de le savoir.
    """
    lesson = lesson_matching_text(db, text=query)
    try:
        passages = retrieve_with_provenance(
            db,
            embedder,
            skill_id=None,
            query=query,
            max_distance=settings.chat_rag_max_distance,
        )
    except Exception:  # noqa: BLE001 — un repli qui échoue ne casse pas un tour de chat
        passages = []
    if lesson is None and not passages:
        return None
    return CanonicalContext(lesson=lesson, chunks=[hit.content for hit in passages])


def _compose_context(
    db: Session, embedder: EmbeddingProvider, *, student_id: int, skill_id: int | None, query: str
) -> tuple[str, CanonicalContext | None]:
    """Contexte injecté, PRIORISÉ et borné section par section (`adr-0059` §9).

    Rend aussi le contexte canonique résolu : le serveur en a besoin pour calculer lui-même
    l'ancrage de la réponse (§7) — il ne croit jamais le moteur sur sa propre source.

    ## L'ordre EST la décision

    1. **le cours** (`chat_course_token_budget`), tronqué par paragraphe ;
    2. **les extraits RAG** (`chat_rag_token_budget`), par passages entiers ;
    3. **la règle d'autorité**, posée par `build_canonical_sections` après la troncature, donc
       jamais coupée ;
    4. **le rappel** des notions récentes — sacrifié EN PREMIER, car c'est la section la moins
       nécessaire pour répondre au fond.

    Jusqu'au 2026-08-15, l'ordre était inverse et la troncature portait sur la CONCATÉNATION :
    `block[:1200]`. Le rappel passait avant le cours et mangeait son budget, et la règle
    d'autorité — dernière du bloc — disparaissait à tous les coups. ZETIS recevait un kilo-octet
    de cours arbitrairement coupé, sans la phrase qui lui disait quoi en faire.
    """
    parts: list[str] = []
    ctx: CanonicalContext | None = None
    if skill_id is not None:
        ctx = resolve_canonical_context(db, embedder, skill_id=skill_id, query=query)
    else:
        ctx = _contexte_sans_notion(db, embedder, query=query)
    if ctx is not None:
        canonical = build_canonical_sections(
            ctx,
            max_lesson_chars=max(0, settings.chat_course_token_budget) * 4,
            max_chunk_chars=max(0, settings.chat_rag_token_budget) * 4,
        )
        if canonical.strip():
            parts.append(canonical)
    recall = _recall_block(db, student_id=student_id)
    if recall:
        # Estimation grossière ~4 caractères/token. Le rappel est tronqué CHEZ LUI : il ne peut
        # plus rogner sur le cours.
        budget = max(0, settings.chat_context_token_budget) * 4
        parts.append("## MÉMOIRE (notions récentes)\n" + (recall[:budget] if budget else recall))
    return "\n\n".join(parts), ctx


#: Ce que ZETIS dit quand rien n'ancre la question. Composé SERVEUR, déterministe — jamais laissé
#: au moteur, qui broderait une explication pour meubler. §16 : ZETIS parle à la première
#: personne, il ne nomme aucun adulte.
NOTE_SANS_ANCRAGE = "Ça, je ne l'ai pas encore dans tes cours — je le note."

#: 🔴 **Quand la NOTION n'a pas été identifiée, ZETIS ne se prononce pas sur le contenu.**
#:
#: Constaté au micro le 2026-08-15 : « explique-moi la différence entre le narrateur et le
#: personnage principal » nomme deux notions, aucune ne passe le seuil de résolution — et ZETIS a
#: répondu *« je ne l'ai pas encore dans tes cours »*. C'était **faux** : le cours sur le
#: Narrateur existe, validé.
#:
#: « Je n'ai pas identifié de quoi tu parles » et « je n'ai pas ce contenu » sont deux choses
#: différentes, et la seconde est une affirmation que le serveur n'est pas en position de faire
#: quand la première est vraie. Il demande donc de préciser au lieu de conclure.
NOTE_NOTION_INCERTAINE = "Je ne suis pas sûr de la notion — tu peux me dire laquelle précisément ?"


def _ground_answer(parsed: dict, ctx: CanonicalContext | None) -> tuple[ChatGrounding | None, bool]:
    """Sur quoi la réponse s'appuie VRAIMENT, et le moteur a-t-il menti ? (`adr-0059` §7)

    Rend `(grounding, mensonge)`. `grounding is None` quand le tour n'était pas une question de
    fond — il n'y a alors rien à afficher.

    🔴 **Le verdict vient du CONTEXTE, jamais de `used_source`.** Le serveur sait ce qu'il a
    injecté : une leçon (`ctx.lesson`), des extraits (`ctx.chunks`), ou rien. La déclaration du
    moteur ne sert qu'à repérer l'incohérence — annoncer « d'après le cours » quand aucune leçon
    n'a été injectée signifie qu'il a répondu de mémoire. C'est le patron `reports._anchor()` que
    l'ADR-0027 §1 cite : *ce que le LLM invente qui n'est pas ancrable est jeté.*
    """
    answer = parsed.get("answer")
    if not isinstance(answer, dict) or not bool(answer.get("is_question")):
        return None, False

    if ctx is not None and ctx.lesson is not None:
        kind = "cours"
    elif ctx is not None and ctx.chunks:
        kind = "extraits"
    else:
        kind = "aucune"

    declare = str(answer.get("used_source") or "").strip().lower()
    # Le mensonge n'est pas « il s'est trompé de mot » : c'est prétendre une source PLUS forte que
    # celle réellement fournie. Déclarer « aucune » alors qu'un cours était là n'est pas un
    # mensonge — c'est une modestie sans conséquence.
    rang = {"aucune": 0, "extraits": 1, "cours": 2}
    mensonge = rang.get(declare, 0) > rang[kind]

    return (
        ChatGrounding(
            kind=kind,
            lesson_title=(ctx.lesson.title if kind == "cours" and ctx is not None else None),
            sources_used=len(ctx.chunks) if kind == "extraits" and ctx is not None else 0,
        ),
        mensonge,
    )


#: Mots par lesquels Massimo sort d'une interrogation. Testé AVANT tout appel au moteur : une
#: sortie qui dépendrait du moteur pourrait être ignorée par lui, et l'enfant serait retenu dans
#: une boucle. `adr-0026` §4 — ZETIS n'insiste jamais.
_MOTS_DE_SORTIE = ("stop", "arrête", "arrete", "j'arrête", "j'arrete", "on arrête", "on arrete")


def _tour_de_recall(
    db: Session,
    store: ChatStore,
    provider: LLMProvider,
    embedder: EmbeddingProvider,
    *,
    student: StudentProfile,
    session_id: str,
    text: str,
    etat: "recall.RecallState",
) -> ChatMessageOut:
    """Un tour PENDANT une interrogation : la réponse de Massimo est évaluée, puis on relance.

    ⚠️ **Aucune `action` n'est rendue** (`adr-0059` §10) : rien à auto-naviguer, donc aucun risque
    d'arracher Massimo à mi-question. La politique voix/clavier du front devient sans objet, et
    elle n'a pas besoin de le savoir — la règle vit ici.
    """
    sortie = text.strip().lower()
    if any(mot in sortie for mot in _MOTS_DE_SORTIE):
        store.clear_state(student.id, session_id)
        store.append_turn(student.id, session_id, role=ROLE_USER, text=text)
        store.append_turn(student.id, session_id, role=ROLE_ASSISTANT, text=recall.CLOTURE)
        db.commit()
        return ChatMessageOut(
            session_id=session_id,
            turn_index=store.user_turn_count(student.id, session_id),
            reply=recall.CLOTURE,
            skill_id=etat.skill_id,
            recall=ChatRecall(
                asked=etat.asked_count,
                total=settings.chat_recall_questions,
                skill_name=etat.skill_name,
                finished=True,
            ),
        )

    contexte, _ctx = _compose_context(
        db, embedder, student_id=student.id, skill_id=etat.skill_id, query=etat.current_question
    )
    # 🔴 **Un tour d'interrogation se TRACE**, comme tout appel IA du dépôt (`CLAUDE.md` §Règles
    # IA, `adr-0059` §10). Il ne l'était pas : `recall.repondre` appelait le provider en direct,
    # et les trois réponses de la première interrogation jouée en vrai (2026-08-15) n'ont laissé
    # **aucune trace**. Les verdicts portés sur Massimo étaient inauditables — précisément ce que
    # la trace existe pour empêcher.
    debut = time.monotonic()
    job = AIJob(
        job_type="chat_recall",
        status="running",
        input_json={
            "session_id": session_id,
            "recall_index": etat.asked_count,
            "prompt_version": RECALL_PROMPT_VERSION,
        },
        created_by="child",
        created_at=datetime.now(timezone.utc),
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.flush()

    tour = recall.repondre(provider, etat, text, context_block=contexte)
    reply = _sanitize(tour.reply)

    # ⚠️ **Des ÉTIQUETTES, jamais un texte** (§1c) : ni la question de ZETIS, ni la réponse de
    # Massimo. Un verdict appartient au vocabulaire fermé à quatre valeurs, exactement au même
    # titre que le `kind` de `declared_difficulty` que le §1c autorise nommément.
    job.status = "succeeded"
    job.output_json = {
        "skill_id": etat.skill_id,
        "recall_index": etat.asked_count,
        "verdict": tour.verdict,
        "finished": tour.finished,
    }
    job.duration_ms = int((time.monotonic() - debut) * 1000)
    job.finished_at = datetime.now(timezone.utc)

    if tour.state is None:
        store.clear_state(student.id, session_id)
    else:
        store.write_state(student.id, session_id, tour.state.to_dict())

    store.append_turn(student.id, session_id, role=ROLE_USER, text=text)
    store.append_turn(student.id, session_id, role=ROLE_ASSISTANT, text=reply)
    db.commit()
    courant = tour.state or etat
    return ChatMessageOut(
        session_id=session_id,
        turn_index=store.user_turn_count(student.id, session_id),
        reply=reply,
        skill_id=etat.skill_id,
        recall=ChatRecall(
            asked=courant.asked_count,
            total=settings.chat_recall_questions,
            skill_name=etat.skill_name,
            finished=tour.finished,
        ),
    )


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


def _maybe_request_content(db: Session, *, student_id: int, signaux: list | None) -> None:
    """Enregistre les demandes de contenu à Papa posées par `resolve_action` (§3, addendum).

    BEST-EFFORT : toute exception est avalée — la file de demandes ne doit JAMAIS faire échouer un
    tour de chat. `create_request` fait un `flush` (pas de commit) : la demande participe à la
    transaction du tour, committée avec le reste.

    Le flush passe par un **SAVEPOINT** (`begin_nested`) : une erreur SQL (violation de l'unicité
    `(student, skill, kind)` sur deux tours concurrents, FK si la notion vient d'être supprimée…)
    invaliderait sinon la Session, et TOUTES les écritures suivantes du tour (événements, Gap,
    `ai_jobs`, commit final) lèveraient `PendingRollbackError` → 500 alors que la réponse est déjà
    générée. Le SAVEPOINT annule la seule demande et laisse la transaction du tour intacte.

    ⚠️ **Une LISTE depuis l'`adr-0059` §16, et UN SAVEPOINT PAR DEMANDE.** Un tour peut désormais
    en poser deux (le dérivé réclamé + le cours qui lui manque). Un savepoint commun les ferait
    tomber ensemble : un doublon sur la seconde annulerait la première, alors qu'elles sont
    indépendantes — Papa perdrait la demande que son fils a réellement formulée à cause d'une
    ligne technique.
    """
    for signal in signaux or []:
        if not isinstance(signal, dict):
            continue
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

    `input_json` = référence (session, index de tour, version du prompt) ; `output_json` (peuplé
    par l'appelant) = métadonnées classées. Le verbatim reste dans Redis. Test-verrou : aucun texte
    de message ici.

    ⚠️ `prompt_version` s'ajoute avec l'`adr-0059` §17 : `CHAT_PROMPT_VERSION` existait, était
    importé par ce module, et **n'était écrit nulle part**. Une version de prompt est une
    métadonnée — le §1c est tenu — et sans elle l'exigence de `CLAUDE.md` (« prompt versionné +
    trace d'exécution ») n'était honorée qu'à moitié : on savait qu'un tour avait eu lieu, jamais
    avec quelle version des consignes. C'est précisément ce qu'on voudra savoir le jour où une
    réponse de ZETIS surprendra."""
    now = datetime.now(timezone.utc)
    job = AIJob(
        job_type="chat_turn",
        status="running",
        input_json={
            "session_id": session_id,
            "turn_index": turn_index,
            "prompt_version": CHAT_PROMPT_VERSION,
        },
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
    # Un tour qui ne porte QU'un `tool_response` (le tap sur une carte) n'a ni réponse ni source :
    # il n'y a rien à ancrer, et la puce ne doit pas s'afficher.
    grounding: ChatGrounding | None = None
    source_mismatch = False

    # --- Interrogation orale EN COURS : elle capte le tour avant tout le reste (`adr-0059` §10) ---
    # ⚠️ Placé AVANT l'appel de chat ordinaire : pendant une interrogation, le message de Massimo
    # est une RÉPONSE, pas une nouvelle demande. Le faire passer par le tour normal le ferait
    # analyser comme un intent (« la mitose » → ouvrir la fiche sur la mitose), et Massimo serait
    # arraché à la question qu'on venait de lui poser.
    etat_brut = store.read_state(student.id, session_id) if text else None
    if etat_brut:
        return _tour_de_recall(
            db,
            store,
            provider,
            embedder,
            student=student,
            session_id=session_id,
            text=text,
            etat=recall.RecallState.from_dict(etat_brut),
        )

    if text:
        resolution = resolve_skill(db, embedder, student_id=student.id, text=text)
        resolved_skill_id = resolution.skill_id
        skill = resolution.skill

        context_block, canonical_ctx = _compose_context(
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
        # --- Ancrage de la réponse de fond (`adr-0059` §7) : le serveur tranche, pas le moteur ---
        grounding, source_mismatch = _ground_answer(parsed, canonical_ctx)
        if grounding is not None and grounding.kind == "aucune":
            # 🔴 **On REMPLACE la réponse, on ne l'annote pas.** Le détecteur de mensonge attrape
            # la déclaration fausse ; il n'attrape PAS le modèle qui déclare honnêtement « aucune
            # source » et répond quand même de mémoire — et `qwen3` connaît les fractions. Ajouter
            # une note laisserait l'explication inventée à l'écran, précédée d'un aveu que Massimo
            # ne lirait pas. Substituer est déterministe, testable, et c'est la seule façon de
            # tenir la règle d'ancrage sans dépendre de la docilité du moteur.
            # ⚠️ Deux refus DIFFÉRENTS, et ils ne disent pas la même chose. Sans notion
            # identifiée, le serveur ne peut rien affirmer sur ce qu'il possède : il demande de
            # préciser. Avec une notion identifiée mais sans contenu, il constate — et le note.
            reply = NOTE_SANS_ANCRAGE if resolved_skill_id is not None else NOTE_NOTION_INCERTAINE
        # ⚠️ **Une seule honnêteté par tour.** La substitution ci-dessus dit déjà « je ne l'ai pas,
        # je le note » ; l'orchestration en dessous a sa propre note pour la même situation
        # (« ça, je ne le trouve pas dans ton programme »). Les deux à la suite donnent un
        # paragraphe qui se répète — le doublon exact que le repli d'orchestration évite déjà
        # entre ses deux branches.
        reply_substitue = grounding is not None and grounding.kind == "aucune"
        # Le SERVEUR a-t-il ajouté une phrase de son cru ? Si oui, elle fait foi et la correction
        # d'aveu ci-dessous ne s'en mêle pas.
        note_posee = reply_substitue
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
        # Signaux de demande de contenu (addendum ADR-0027) : posés par `resolve_action` quand un
        # contenu est absent. Le repli ci-dessous peut en produire d'autres (notion résolue mais
        # VIDE alors que le LLM n'avait rempli aucun intent) — on garde la LISTE primaire si elle
        # n'est pas vide, sinon celle du repli.
        # ⚠️ On ne CONCATÈNE pas : le repli n'est consulté que lorsque l'intent primaire n'a rien
        # produit. Les fusionner ferait remonter deux fois la même demande sur le chemin nominal.
        content_signals = action_result.meta.get("content_requests") or []
        if action_result.note and not reply_substitue:  # « pas de cible → ZETIS le dit » (§1/§3)
            reply = _poser_note(reply, action_result.note)
            note_posee = True

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
            if not content_signals:
                content_signals = fallback.meta.get("content_requests") or []
            # Notion résolue mais SANS contenu validé à offrir (le repli n'a pas d'action) : ZETIS
            # est honnête plutôt que muet — on remonte sa note. Uniquement si aucune note n'a déjà
            # été posée (évite un doublon quand l'intent primaire portait la même honnêteté).
            if action is None and fallback.note and not action_result.note and not reply_substitue:
                reply = _poser_note(reply, fallback.note)
                note_posee = True

        # Une action ancrée DÉMENT un aveu d'ignorance du MOTEUR : on ne laisse pas les deux à
        # l'écran. Placé après le repli d'orchestration, qui peut encore produire une action.
        #
        # ⚠️ **Seulement si le SERVEUR n'a rien dit lui-même.** Ses notes sont honnêtes ET
        # compatibles avec une action : « je n'ai pas encore de quiz sur X — je le note » +
        # un menu de ce qui existe n'est pas une contradiction, c'est la réponse juste. Sans ce
        # garde, la correction effacerait une promesse tenue — attrapé par la suite le
        # 2026-08-15, et c'est le genre d'effet de bord qu'un correctif live produit.
        if not note_posee:
            reply = _corriger_aveu_contredit(reply, action)

        # --- Ouverture d'une interrogation orale (`adr-0059` §10) ---
        ouverture = action_result.meta.get("recall")
        if ouverture:
            contexte_recall, _c = _compose_context(
                db,
                embedder,
                student_id=student.id,
                skill_id=ouverture["skill_id"],
                query=ouverture["skill_name"],
            )
            tour = recall.ouvrir(
                provider,
                context_block=contexte_recall,
                skill_id=ouverture["skill_id"],
                skill_name=ouverture["skill_name"],
            )
            reply = _sanitize(tour.reply)
            if tour.state is not None:
                store.write_state(student.id, session_id, tour.state.to_dict())
                recall_out = ChatRecall(
                    asked=tour.state.asked_count,
                    total=settings.chat_recall_questions,
                    skill_name=ouverture["skill_name"],
                )
                # ⚠️ **Un ACTE, pas une mesure** (`adr-0059` §12) : Massimo a accepté d'être
                # interrogé. On réutilise `chat_tool_response` — aucun `event_type` neuf, zéro XP,
                # non probant. Papa lit « il a accepté d'être interrogé sur les fractions ».
                log_learning_event(
                    db,
                    student_id=student.id,
                    event_type=EVENT_CHAT_TOOL_RESPONSE,
                    skill_id=ouverture["skill_id"],
                    subject_id=skill.subject_id if skill is not None else None,
                    payload={
                        "tool_type": "interro_orale",
                        "skill_id": ouverture["skill_id"],
                        "accepted": True,
                    },
                )
            else:
                recall_out = None
            # ⚠️ **La trace du tour d'ouverture était VIDE.** Ce chemin rend la réponse par un
            # `return` anticipé, donc le bloc de métadonnées de fin de fonction n'était jamais
            # atteint : un `ai_jobs` `chat_turn` avec `output_json` NULL, constaté en base le
            # 2026-08-15. Un `return` en milieu de fonction emporte silencieusement tout ce qui
            # suit — ici, la seule trace de ce qui s'est passé.
            job_ouverture = db.get(AIJob, job_id)
            if job_ouverture is not None:
                job_ouverture.output_json = {
                    "skill_id": ouverture["skill_id"],
                    "kind": None,
                    "tool_type": None,
                    "duration_ms": job_ouverture.duration_ms,
                    "action": action_result.meta or None,
                    "grounding": None,
                    "source_mismatch": None,
                }
            store.append_turn(student.id, session_id, role=ROLE_USER, text=text)
            store.append_turn(student.id, session_id, role=ROLE_ASSISTANT, text=reply)
            db.commit()
            return ChatMessageOut(
                session_id=session_id,
                turn_index=store.user_turn_count(student.id, session_id),
                reply=reply,
                skill_id=ouverture["skill_id"],
                recall=recall_out,
            )

        # 🔴 **Troisième déclencheur de demande** (`adr-0059` §8) : une question de fond que RIEN
        # n'ancrait. ZETIS a dit qu'il ne l'avait pas ; la file de Papa apprend ce qui manque.
        # ⚠️ **Zéro plomberie neuve** — on réutilise le chemin existant, avec le `cours` comme
        # objet : c'est la porte des dérivés, et c'est de lui que ZETIS a besoin pour répondre.
        if (
            grounding is not None
            and grounding.kind == "aucune"
            and resolved_skill_id is not None
        ):
            content_signals = content_signals or [
                {"skill_id": resolved_skill_id, "content_kind": "cours"}
            ]

        # --- Demande de contenu à Papa (addendum ADR-0027) : contenu absent → file dédupliquée ---
        # Best-effort et JAMAIS bloquant : une file en erreur ne doit pas casser une conversation.
        # Le signal est une métadonnée pure (skill_id + content_kind), posée par `resolve_action`.
        _maybe_request_content(db, student_id=student.id, signaux=content_signals)

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
                # Ancrage de la réponse : une ÉTIQUETTE (`cours`/`extraits`/`aucune`), jamais le
                # texte. `source_mismatch` garde la trace d'un moteur qui a prétendu une source
                # qu'on ne lui avait pas donnée — c'est le signal qui dirait que la règle
                # d'ancrage ne tient pas, et il doit être auditable après coup.
                "grounding": grounding.kind if grounding is not None else None,
                "source_mismatch": source_mismatch or None,
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
        grounding=grounding,
    )
