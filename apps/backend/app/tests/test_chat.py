"""Tests d'invariants du chat ZETIS (ADR-0026, slice A).

Un test par invariant du §Suivi de l'ADR : mémoire éphémère (aucune table, `ai_jobs` sans
verbatim), trois événements typés non probants et sans XP, règle de corroboration du signal
déclaratif, dédupes, TTL, purge, frontière parent. La résolution de notion s'appuie sur le
`FakeEmbeddingProvider` déterministe : un message ÉGAL au nom de la notion seedée
(« Nombres relatifs ») donne un cosinus de 1.0 → ancrage garanti.
"""

import json

from sqlalchemy import func, select

from app.core.config import settings
from app.db.base import Base
from app.db.models import (
    AIJob,
    Gap,
    LearningEvent,
    Skill,
    SkillMastery,
    StudentProfile,
    XPEvent,
)
from app.main import app
from app.modules.activity.events import (
    EVENT_CHAT_DIFFICULTY_DECLARED,
    EVENT_CHAT_TOOL_RESPONSE,
    EVENT_CHAT_TOPIC,
)
from app.modules.ai import get_provider
from app.modules.chat.store import get_chat_store
from app.tests.fakes import FakeLLMProvider

RESOLVING = "Nombres relatifs"  # = nom exact de la Skill seedée → cosinus 1.0 (ancrage garanti)


# --- Helpers ---------------------------------------------------------------------------------


def _open(client) -> str:
    resp = client.post("/api/student/chat/sessions")
    assert resp.status_code == 200, resp.text
    return resp.json()["session_id"]


def _say(client, session_id: str, **body):
    return client.post(f"/api/student/chat/sessions/{session_id}/messages", json=body)


def _use_chat_llm(chat: dict) -> None:
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(chat=chat)


def _ids(TestSession) -> tuple[int, int]:
    db = TestSession()
    student = db.scalar(select(StudentProfile).order_by(StudentProfile.id))
    skill = db.scalar(select(Skill).where(Skill.name == RESOLVING))
    ids = (student.id, skill.id)
    db.close()
    return ids


def _count(TestSession, model, **where) -> int:
    db = TestSession()
    q = select(func.count()).select_from(model)
    for col, val in where.items():
        q = q.where(getattr(model, col) == val)
    n = int(db.scalar(q) or 0)
    db.close()
    return n


# --- Mémoire éphémère : aucune table, aucun verbatim durable ---------------------------------


def test_no_chat_table_in_metadata() -> None:
    """Test-verrou §1 : aucun modèle SQLAlchemy ne matérialise une table de chat (scan metadata)."""
    chat_tables = [name for name in Base.metadata.tables if "chat" in name.lower()]
    assert chat_tables == [], f"Le verbatim doit être éphémère — tables interdites : {chat_tables}"


def test_ai_jobs_of_a_turn_carry_no_message_text(client_db) -> None:
    """Test-verrou §1c : le pipeline est AVEUGLE — `ai_jobs` ne porte que des métadonnées."""
    client, TestSession = client_db
    marker = "MARQUEUR_SECRET_ZorglubXYZ"
    sid = _open(client)
    assert _say(client, sid, text=f"{marker} {RESOLVING}").status_code == 200

    db = TestSession()
    jobs = db.scalars(select(AIJob).where(AIJob.job_type == "chat_turn")).all()
    assert jobs, "un tour doit tracer un ai_jobs de métadonnées"
    for job in jobs:
        blob = json.dumps(job.input_json or {}) + json.dumps(job.output_json or {})
        assert marker not in blob, "aucun texte de message ne doit entrer dans ai_jobs"
        assert set((job.input_json or {}).keys()) <= {"session_id", "turn_index"}
        assert set((job.output_json or {}).keys()) <= {
            "skill_id",
            "kind",
            "tool_type",
            "duration_ms",
            "action",  # métadonnées d'orchestration (route/skill_id/tool), jamais un message
        }
    db.close()


# --- Trois événements typés, non probants, zéro XP -------------------------------------------


def test_topic_event_emitted_and_no_xp(client_db) -> None:
    """§2 : une notion résolue émet `chat_topic` ; aucune conversation ne crédite d'XP."""
    client, TestSession = client_db
    student_id, skill_id = _ids(TestSession)
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    assert resp.status_code == 200
    assert resp.json()["skill_id"] == skill_id

    assert _count(TestSession, LearningEvent, event_type=EVENT_CHAT_TOPIC) == 1
    assert _count(TestSession, XPEvent, student_id=student_id) == 0


def test_topic_event_deduped_once_per_day(client_db) -> None:
    """§2 : `chat_topic` est dédupé 1/(élève, skill, jour)."""
    client, TestSession = client_db
    sid = _open(client)
    _say(client, sid, text=RESOLVING)
    _say(client, sid, text=RESOLVING)
    assert _count(TestSession, LearningEvent, event_type=EVENT_CHAT_TOPIC) == 1


def test_unresolved_topic_leaves_no_trace(client_db, monkeypatch) -> None:
    """§6 best-effort : une résolution qui échoue ne bloque pas la réponse mais n'ancre rien."""
    client, TestSession = client_db
    # Seuil inatteignable → aucune notion résolue (le cosinus plafonne à 1.0).
    monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 2.0)
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    assert resp.status_code == 200  # la réponse arrive quand même
    assert resp.json()["skill_id"] is None
    assert _count(TestSession, LearningEvent, event_type=EVENT_CHAT_TOPIC) == 0


def test_tool_response_logged_without_dedupe(client_db) -> None:
    """§2 : chaque réponse à une proposition d'outil est un acte — aucune dédupe."""
    client, TestSession = client_db
    sid = _open(client)
    _say(client, sid, tool_response={"tool_type": "fiche", "accepted": True})
    _say(client, sid, tool_response={"tool_type": "fiche", "accepted": True})
    assert _count(TestSession, LearningEvent, event_type=EVENT_CHAT_TOOL_RESPONSE) == 2


# --- Orchestration : intent typé → action ANCRÉE serveur (ADR-0027) ------------------------


def _chat_intent(intent: dict, reply: str = "D'accord !") -> dict:
    return {
        "reply": reply,
        "declared_difficulty": {"declared": False, "kind": ""},
        "tool_suggestion": "",
        "intent": intent,
    }


def test_intent_show_data_returns_show_data_action(client_db) -> None:
    """§2 : « c'est quoi mes devoirs » → action show_data (le front récupère l'agenda)."""
    client, _ = client_db
    _use_chat_llm(_chat_intent({"kind": "show_data", "data": "agenda"}, "Voici tes devoirs !"))
    sid = _open(client)
    resp = _say(client, sid, text="c'est quoi mes devoirs")
    assert resp.status_code == 200
    action = resp.json()["action"]
    assert action and action["kind"] == "show_data" and action["data"] == "agenda"


def test_intent_open_subject_navigates_to_anchored_route(client_db) -> None:
    """§1/§2 : « on révise les maths » → route matière ANCRÉE (slug de la vraie matière seedée)."""
    client, _ = client_db
    _use_chat_llm(
        _chat_intent({"kind": "open_subject", "subject_query": "maths", "tool": "revision"})
    )
    sid = _open(client)
    resp = _say(client, sid, text="on révise les maths")
    action = resp.json()["action"]
    assert action and action["kind"] == "navigate"
    assert action["route"] == "/revision?subject=mathematiques"


def test_intent_open_notion_unavailable_never_hallucinates_a_route(client_db, monkeypatch) -> None:
    """§1/§3 : notion HORS PROGRAMME → jamais de route inventée ; ZETIS est honnête ET propose de
    DEMANDER À PAPA de l'ajouter (action opt-in `request_notion`, jamais une navigation)."""
    client, _ = client_db
    # Seuil inatteignable → « fractions » ne résout pas (hors-programme déterministe).
    monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 2.0)
    _use_chat_llm(_chat_intent({"kind": "open_notion", "notion_query": "les fractions", "tool": "fiche"}))
    sid = _open(client)
    resp = _say(client, sid, text="montre mes fiches sur les fractions")
    body = resp.json()
    action = body["action"]
    assert action and action["kind"] == "request_notion"  # offre d'ajout, pas une route
    assert action["route"] is None and action["confirm"] is True
    assert "fractions" in action["text"]
    assert "programme" in body["reply"] or "Papa" in body["reply"]  # honnêteté (§3)


def test_resolve_action_anchors_only_available_content(client_db, monkeypatch) -> None:
    """§1/§3 (unité) : l'action est construite depuis `galaxy.notion_panel` ; un contenu non
    `available` ne produit AUCUNE route (et annonce une demande à Papa)."""
    from app.modules.chat import actions
    from app.tests.fakes import FakeEmbeddingProvider

    _, TestSession = client_db
    db = TestSession()
    panel = {
        "skill_id": 42,
        "name": "Les fractions",
        "status": "weak",
        "chapter_title": "Nombres",
        "subject_slug": "mathematiques",
        "subject_name": "Mathématiques",
        "actions": [
            {"kind": "cours", "available": True, "lesson_id": 3},  # cours validé → ELI5 s'y ancre
            {"kind": "eli5", "available": True},
            {"kind": "fiche", "available": True, "fiche_id": 7},
            {"kind": "mindmap", "available": True, "mindmap_id": 5},
            {"kind": "revision", "available": False},  # contenu absent (probe « demande à Papa »)
        ],
    }
    monkeypatch.setattr(actions, "notion_panel", lambda db, skill_id: panel)
    emb = FakeEmbeddingProvider()

    def resolve(tool: str):
        return actions.resolve_action(
            db, emb, student_id=1, intent={"kind": "open_notion", "tool": tool}, fallback_skill_id=42
        )

    assert resolve("fiche").action.route == "/fiches/mathematiques"
    assert resolve("mindmap").action.route == "/mindmaps/reconstruire/5"  # ciblage par id de carte
    assert resolve("eli5").action.route.startswith("/eli5?skill_id=42")  # cours validé → ELI5 offert
    rev = resolve("revision")  # contenu absent → pas d'action + demande à Papa
    assert rev.action is None and "Papa" in (rev.note or "")
    db.close()


def test_named_notion_offers_a_card_even_without_llm_intent(client_db, monkeypatch) -> None:
    """Correctif 2026-07-30 : Massimo NOMME une notion résolue mais le LLM dit intent=none → le
    serveur propose quand même une porte d'entrée VALIDÉE, marquée `confirm` (offre implicite).
    Ici la notion n'a qu'une fiche (pas de cours) → ELI5 non offert (il inventerait), la fiche l'est."""
    from app.modules.chat import actions

    client, _ = client_db
    panel = {
        "skill_id": 1,
        "name": "Les fractions",
        "status": "weak",
        "chapter_title": "Nombres",
        "subject_slug": "mathematiques",
        "subject_name": "Mathématiques",
        "actions": [
            {"kind": "fiche", "available": True, "fiche_id": 7},
            {"kind": "cours", "available": False},  # pas de cours → ELI5 exclu
        ],
    }
    monkeypatch.setattr(actions, "notion_panel", lambda db, skill_id: panel)
    _use_chat_llm(_chat_intent({"kind": "none"}, "Les fractions, chouette sujet !"))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    action = resp.json()["action"]
    assert action and action["kind"] == "navigate"
    assert action["route"] == "/fiches/mathematiques"  # porte VALIDÉE (pas d'ELI5 génératif)
    assert action["confirm"] is True  # offre implicite → carte, jamais d'auto-nav vocale


def test_named_notion_shows_menu_of_available_content(client_db, monkeypatch) -> None:
    """Q1 (2026-07-30) : notion nommée sans outil précis → MENU des contenus DISPONIBLES (pas une
    porte devinée), chaque entrée ancrée ; les indisponibles n'y sont pas."""
    from app.modules.chat import actions

    client, _ = client_db
    panel = {
        "skill_id": 1,
        "name": "Les fractions",
        "status": "weak",
        "chapter_title": "Nombres",
        "subject_slug": "mathematiques",
        "subject_name": "Mathématiques",
        "actions": [
            {"kind": "cours", "available": True, "lesson_id": 3},  # cours validé → ELI5 offert
            {"kind": "eli5", "available": True},
            {"kind": "fiche", "available": True, "fiche_id": 7},
            {"kind": "mindmap", "available": True, "mindmap_id": 5},
            {"kind": "revision", "available": False},  # indisponible → absent du menu
        ],
    }
    monkeypatch.setattr(actions, "notion_panel", lambda db, skill_id: panel)
    _use_chat_llm(_chat_intent({"kind": "none"}, "Les fractions, chouette !"))
    sid = _open(client)
    resp = _say(client, sid, text=RESOLVING)
    action = resp.json()["action"]
    assert action and action["kind"] == "notion_menu"
    kinds = [i["kind"] for i in action["items"]]
    assert "eli5" in kinds and "fiche" in kinds and "mindmap" in kinds and "cours" in kinds
    assert "revision" not in kinds  # non disponible → absent du menu (jamais grisé côté chat)
    assert all(i["route"] for i in action["items"])  # chaque entrée est ancrée


# --- Règle de corroboration du signal déclaratif (§3) ----------------------------------------


def _declare_difficulty(client, sid):
    _use_chat_llm(
        {
            "reply": "On va renforcer ça ensemble.",
            "declared_difficulty": {"declared": True, "kind": "confusion"},
            "tool_suggestion": "",
        }
    )
    return _say(client, sid, text=RESOLVING)


def test_declared_difficulty_emits_event(client_db) -> None:
    client, TestSession = client_db
    sid = _open(client)
    resp = _declare_difficulty(client, sid)
    assert resp.status_code == 200
    assert resp.json()["difficulty_declared"] is True
    assert _count(TestSession, LearningEvent, event_type=EVENT_CHAT_DIFFICULTY_DECLARED) == 1


def test_declared_difficulty_without_mastery_creates_no_gap(client_db) -> None:
    """§3b : sans donnée de maîtrise (aucune ligne), la déclaration reste un événement seul."""
    client, TestSession = client_db
    sid = _open(client)
    _declare_difficulty(client, sid)
    assert _count(TestSession, Gap) == 0


def test_declared_difficulty_on_weak_mastery_opens_low_gap(client_db) -> None:
    """§3a/b : maîtrise fragile → une Gap `ai_observation`, `severity=low`."""
    client, TestSession = client_db
    student_id, skill_id = _ids(TestSession)
    db = TestSession()
    db.add(SkillMastery(student_id=student_id, skill_id=skill_id, status="weak", mastery_score=20))
    db.commit()
    db.close()

    sid = _open(client)
    _declare_difficulty(client, sid)

    db = TestSession()
    gap = db.scalar(select(Gap).where(Gap.student_id == student_id, Gap.skill_id == skill_id))
    assert gap is not None
    assert gap.source == "ai_observation"
    assert gap.severity == "low"
    db.close()


def test_declared_difficulty_on_mastered_creates_no_gap(client_db) -> None:
    """§3b : sur une notion consolidée, la déclaration ne crée aucune lacune."""
    client, TestSession = client_db
    student_id, skill_id = _ids(TestSession)
    db = TestSession()
    db.add(
        SkillMastery(student_id=student_id, skill_id=skill_id, status="mastered", mastery_score=95)
    )
    db.commit()
    db.close()

    sid = _open(client)
    _declare_difficulty(client, sid)
    assert _count(TestSession, Gap) == 0


def test_declared_difficulty_never_escalates_existing_gap(client_db) -> None:
    """§3a/c : une lacune ouverte existante n'est ni doublée ni escaladée par du déclaratif."""
    client, TestSession = client_db
    student_id, skill_id = _ids(TestSession)
    db = TestSession()
    subject_id = db.scalar(select(Skill.subject_id).where(Skill.id == skill_id))
    db.add(SkillMastery(student_id=student_id, skill_id=skill_id, status="weak", mastery_score=20))
    db.add(
        Gap(
            student_id=student_id,
            skill_id=skill_id,
            subject_id=subject_id,
            source="diagnostic",
            severity="high",
            status="open",
        )
    )
    db.commit()
    db.close()

    sid = _open(client)
    _declare_difficulty(client, sid)

    db = TestSession()
    gaps = db.scalars(select(Gap).where(Gap.student_id == student_id, Gap.skill_id == skill_id)).all()
    assert len(gaps) == 1, "aucune lacune supplémentaire"
    assert gaps[0].severity == "high", "jamais d'escalade par déclaration"
    db.close()


# --- Frontière parent, TTL, purge, anti-spam -------------------------------------------------


def test_no_chat_route_outside_student_scope() -> None:
    """§5 : aucune route parent ne sert un verbatim — tout le chat est sous /api/student/chat,
    et aucune méthode GET n'expose la conversation (introspection via le schéma OpenAPI)."""
    paths = app.openapi()["paths"]
    chat_paths = {p: methods for p, methods in paths.items() if "chat" in p}
    assert chat_paths, "les routes de chat doivent exister"
    for path, methods in chat_paths.items():
        assert path.startswith("/api/student/chat"), path
        assert "get" not in methods, f"aucune lecture de verbatim : {path}"


def test_ttl_set_at_session_creation(client_db) -> None:
    """§1a : le TTL est posé dès la création de session."""
    client, _ = client_db
    _open(client)
    store = app.dependency_overrides[get_chat_store]()
    assert store.last_ttl_seconds == settings.chat_session_ttl_minutes * 60


def test_close_purges_session(client_db) -> None:
    """§1a : la clôture purge — la session n'existe plus (les tours suivants échouent en 404)."""
    client, _ = client_db
    sid = _open(client)
    assert _say(client, sid, text="Bonjour").status_code == 200
    assert client.post(f"/api/student/chat/sessions/{sid}/close").status_code == 204
    assert _say(client, sid, text="Encore ?").status_code == 404


def test_message_on_unknown_session_is_404(client_db) -> None:
    client, _ = client_db
    assert _say(client, "inexistante", text="Coucou").status_code == 404


def test_tts_returns_audio(client_db) -> None:
    """Lot 2 : la voix de ZETIS est synthétisée à la volée (Piper mocké) et renvoyée en WAV.
    Aucune persistance — c'est un flux HTTP éphémère."""
    client, _ = client_db
    resp = client.post("/api/student/chat/tts", json={"text": "Bonjour Massimo, on y va ?"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/")
    assert len(resp.content) > 0


def test_anti_spam_quota_returns_429(client_db, monkeypatch) -> None:
    """§Points ouverts 3 : au-delà du plafond de tours, 429."""
    client, _ = client_db
    monkeypatch.setattr(settings, "chat_max_turns_per_session", 1)
    sid = _open(client)
    assert _say(client, sid, text="Premier message").status_code == 200
    assert _say(client, sid, text="Deuxième message").status_code == 429
