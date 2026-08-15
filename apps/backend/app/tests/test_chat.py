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
from app.modules.ai import get_embedder, get_provider
from app.modules.chat.store import get_chat_store
from app.modules.stt import get_stt
from app.tests.fakes import Crc32EmbeddingProvider, FakeLLMProvider

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
        # ⚠️ `prompt_version` ajouté par l'`adr-0059` §17. C'est un ÉLARGISSEMENT d'allowlist
        # (une clé nommée de plus), jamais un affaiblissement : la liste reste fermée, et la
        # première clé non prévue fait toujours rougir.
        assert set((job.input_json or {}).keys()) <= {
            "session_id",
            "turn_index",
            "prompt_version",
        }
        assert set((job.output_json or {}).keys()) <= {
            "skill_id",
            "kind",
            "tool_type",
            "duration_ms",
            "action",  # métadonnées d'orchestration (route/skill_id/tool), jamais un message
            # `adr-0059` §7 — deux ÉTIQUETTES, jamais du texte : sur quoi la réponse s'appuie
            # (`cours`/`extraits`/`aucune`), et si le moteur a prétendu une source qu'on ne lui
            # avait pas donnée. Élargissement d'allowlist, la liste reste fermée.
            "grounding",
            "source_mismatch",
        }
    db.close()


def test_aucun_ai_jobs_de_dictee_ne_porte_les_mots_de_massimo(client_db) -> None:
    """🔴 Test-verrou §1c REFORMULÉ (`adr-0059` §18) — et c'est le verrou qui manquait.

    Celui du dessus filtre `job_type == "chat_turn"`. Il était vert, il l'est resté, et pendant
    ce temps la dictée du chat écrivait les phrases de Massimo dans `ai_jobs` via la route
    d'ELI5 : **78 lignes en base au 2026-08-15**, du 4 juillet au 14 août. Un verrou qui ne
    regarde qu'un `job_type` ne protège qu'un `job_type` — et la fuite est passée par la porte
    d'à côté.

    Nouvelle formulation, celle de l'ADR : *aucun `ai_jobs`, de quelque `job_type` que ce soit,
    ne porte un texte dicté*. Le scan est donc **sans filtre** : c'est ce qui le rend capable
    d'attraper la prochaine surface de dictée, celle qui n'existe pas encore.

    Sabotage qui doit le faire rougir : rétablir `output_json = {"transcript": …}` dans
    `stt/service.py`, ou rebrancher le chat sur `/api/ai/eli5/transcribe`.
    """
    client, TestSession = client_db
    marqueur = "MARQUEUR_DICTE_ZorglubXYZ"

    class _Dictee:
        """Moteur STT qui rend un marqueur reconnaissable — on cherche sa trace en base."""

        def transcribe(self, request):  # noqa: ANN001, ANN201
            from app.modules.stt.provider import SttResponse

            return SttResponse(text=marqueur, duration_seconds=1.5)

    app.dependency_overrides[get_stt] = lambda: _Dictee()
    try:
        resp = client.post(
            "/api/student/chat/transcribe",
            files={"file": ("dictee.wav", b"RIFF....WAVEfmt ", "audio/wav")},
        )
        assert resp.status_code == 200
        # Le transcript est bien RENDU à l'appelant — c'est sa seule voie de sortie.
        assert resp.json()["transcript"] == marqueur
    finally:
        app.dependency_overrides.pop(get_stt, None)

    db = TestSession()
    try:
        jobs = db.scalars(select(AIJob)).all()
        assert jobs, "la dictée doit rester auditable — une trace de métadonnées est attendue"
        for job in jobs:
            blob = json.dumps(job.input_json or {}) + json.dumps(job.output_json or {})
            assert marqueur not in blob, (
                f"les mots de Massimo ont fui dans ai_jobs (job_type={job.job_type})"
            )
    finally:
        db.close()


def test_la_trace_de_dictee_mesure_le_traitement_pas_la_duree_de_l_audio(client_db) -> None:
    """Test-verrou `adr-0059` §6 — l'instrument doit mesurer ce que son nom annonce.

    `duration_ms` portait `info.duration` de faster-whisper, c'est-à-dire la longueur de l'AUDIO,
    là où partout ailleurs dans le dépôt (`ollama_provider`, `mlx_provider`,
    `anthropic_provider`) c'est un `time.monotonic()` écoulé. Une phrase de 3 s transcrite en 6 s
    s'enregistrait à `3000` : **toute mesure de la réactivité faite sur cette colonne aurait été
    fausse**, et c'est la première chose dont la slice 0 avait besoin.

    On rend un audio délibérément LONG (30 s) transcrit instantanément par le faux moteur : si la
    colonne portait encore la durée de l'audio, elle vaudrait ~30000.

    Sabotage : remettre `job.duration_ms = int(result.duration_seconds * 1000)`.
    """
    client, TestSession = client_db

    class _Long:
        def transcribe(self, request):  # noqa: ANN001, ANN201
            from app.modules.stt.provider import SttResponse

            return SttResponse(text="peu importe", duration_seconds=30.0)

    app.dependency_overrides[get_stt] = lambda: _Long()
    try:
        resp = client.post(
            "/api/student/chat/transcribe",
            files={"file": ("dictee.wav", b"RIFF....WAVEfmt ", "audio/wav")},
        )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_stt, None)

    db = TestSession()
    try:
        job = db.scalars(
            select(AIJob).where(AIJob.job_type == "chat_transcribe")
        ).one()
        assert job.duration_ms is not None
        assert job.duration_ms < 5000, (
            "duration_ms doit mesurer le TRAITEMENT (instantané ici), pas les 30 s d'audio"
        )
        # La durée de l'audio reste disponible — comme métadonnée, sous son vrai nom.
        assert (job.output_json or {}).get("audio_seconds") == 30.0
    finally:
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
    assert "programme" in body["reply"] or "je le note" in body["reply"]  # honnêteté (§3)


def test_resolve_action_anchors_only_available_content(client_db, monkeypatch) -> None:
    """§1/§3 (unité) : l'action est construite depuis `galaxy.notion_panel` ; un contenu non
    `available` ne produit AUCUNE route (et annonce que ZETIS note la demande)."""
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
            {"kind": "revision", "available": False},  # contenu absent (probe « je le note »)
        ],
    }
    monkeypatch.setattr(actions, "notion_panel", lambda db, skill_id: panel)
    emb = FakeEmbeddingProvider()

    def resolve(tool: str):
        return actions.resolve_action(
            db, emb, student_id=1, intent={"kind": "open_notion", "tool": tool}, fallback_skill_id=42
        )

    # 🔴 **Chaque activité ouvre SA ressource, pas le paquet de la matière** (`adr-0059` §A2).
    # `fiche` et `cours` attendaient `/fiches/mathematiques` et `/subjects/…/cours` jusqu'au
    # 2026-08-15 : les ids étaient reçus de `notion_panel` puis jetés. La mindmap, elle, ciblait
    # déjà — c'est ce qui rendait l'anomalie visible.
    assert resolve("fiche").action.route == "/fiches/mathematiques?fiche=7"
    assert resolve("cours").action.route == "/subjects/mathematiques/cours?lesson=3"
    assert resolve("mindmap").action.route == "/mindmaps/reconstruire/5"  # ciblage par id de carte
    assert resolve("eli5").action.route.startswith("/eli5?skill_id=42")  # cours validé → ELI5 offert
    rev = resolve("revision")  # contenu absent → pas d'action + « je le note »
    assert rev.action is None and "je le note" in (rev.note or "")
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
    # Porte VALIDÉE (pas d'ELI5 génératif) — et désormais CIBLÉE sur la fiche elle-même.
    # ⚠️ Attendait `/fiches/mathematiques` jusqu'au 2026-08-15 : le `fiche_id` du panneau était
    # reçu puis ignoré, et Massimo ouvrait les douze fiches de Maths au lieu de la sienne
    # (`adr-0059` §A2). Ce que ce test verrouille est INCHANGÉ — « on ne route que vers du
    # validé » ; seule la précision de la cible a changé.
    assert action["route"] == "/fiches/mathematiques?fiche=7"
    assert action["confirm"] is True  # offre implicite → carte, jamais d'auto-nav vocale


def test_une_MATIERE_prise_pour_une_notion_ouvre_la_matiere(client_db, monkeypatch) -> None:
    """🔴 Né AU MICRO le 2026-08-15 — « montre-moi mes fiches de français ».

    Le moteur a classé la demande en `open_notion` avec `notion_query="français"`. Aucune notion
    ne s'appelle ainsi, donc ZETIS a répondu « je ne le trouve pas dans ton programme » et — bien
    pire — a proposé **« Ajouter "français" à mon programme »** : une MATIÈRE offerte comme
    NOTION. La file de Papa se serait remplie d'absurdités, une par matière.

    Le moteur PROPOSE, le serveur ANCRE : avant de conclure au hors-programme, on regarde si la
    requête désigne une matière. Corrigé côté SERVEUR et pas seulement dans le prompt — un exemple
    de plus ne garantit rien, un ancrage garantit toujours.

    Sabotage : retirer le rattrapage `_resolve_subject` de `_open_notion`.
    """
    client, _ = client_db
    # ⚠️ Embedder DÉTERMINISTE : ce test repose sur une NON-résolution (aucune notion ne s'appelle
    # « mathématiques »). Avec le fake par défaut, dérivé de `hash()` salé par `PYTHONHASHSEED`,
    # la requête résout au hasard une fois sur deux et le rattrapage n'est jamais atteint.
    app.dependency_overrides[get_embedder] = lambda: Crc32EmbeddingProvider()
    # ⚠️ **Et le seuil doit monter.** Crc32 est déterministe mais **pas discriminant** : il rend
    # un cosinus de 0,79 entre « mathématiques » et « Nombres relatifs », au-dessus du seuil de
    # production (0,72). Sans ce relèvement, la requête « résout » vers une notion sans rapport et
    # le rattrapage n'est jamais atteint — le test serait vert pour une mauvaise raison, et le
    # sabotage passerait. À 0,99, seule une correspondance quasi exacte résout, ce qui reproduit
    # le vrai comportement (« français » ne désigne aucune notion).
    monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 0.99)
    _use_chat_llm(
        _chat_intent(
            # Le fixture ne seede qu'une matière ; le défaut est identique quelle qu'elle soit.
            {"kind": "open_notion", "notion_query": "mathématiques", "tool": "fiche"},
            "Voilà tes fiches !",
        )
    )
    sid = _open(client)
    body = _say(client, sid, text="montre-moi mes fiches de mathématiques").json()

    action = body["action"]
    assert action and action["kind"] == "navigate"
    assert action["route"] == "/fiches/mathematiques"
    assert "programme" not in body["reply"], "aucun aveu d'ignorance sur une matière qui existe"


def test_un_nom_de_matiere_EXACT_bat_une_resolution_de_notion(client_db, monkeypatch) -> None:
    """🔴 Né AU MICRO le 2026-08-15 — « mes mindmaps de maths » marchait, « mes fiches de
    mathématiques » non.

    La différence n'était pas dans la demande : `notion_query="mathématiques"` avait accroché une
    NOTION au-dessus du seuil (id 217, fiche indisponible) → aucune redirection. Le hasard de la
    similarité décidait de la réponse.

    La règle : la résolution de notion est FLOUE (cosinus d'embeddings), un nom de matière est
    EXACT. Quand les deux répondent, **l'exact gagne** — c'est la seule des deux qui ne peut pas
    se tromper.

    ⚠️ Ici l'embedder résout DÉLIBÉRÉMENT (seuil laissé bas) : c'est tout l'intérêt du test.

    Sabotage : retirer la branche `_matiere_exacte` de `_open_notion`.
    """
    client, _ = client_db
    app.dependency_overrides[get_embedder] = lambda: Crc32EmbeddingProvider()
    _use_chat_llm(
        _chat_intent(
            {"kind": "open_notion", "notion_query": "Mathématiques", "tool": "fiche"},
            "Voilà !",
        )
    )
    sid = _open(client)
    body = _say(client, sid, text="montre-moi mes fiches de mathématiques").json()

    action = body["action"]
    assert action and action["route"] == "/fiches/mathematiques"


def test_un_CHAPITRE_nomme_ouvre_son_deck_pas_une_offre_d_ajout(client_db, monkeypatch) -> None:
    """🔴 Né AU MICRO le 2026-08-15 — « fais-moi réviser l'orthographe ».

    ZETIS proposait **« Ajouter orthographe à mon programme »**. Or « Orthographe » n'est ni une
    matière ni une notion : c'est un **CHAPITRE** de Français, déjà au programme et validé. Le chat
    ne connaissait que les deux extrémités de la hiérarchie et ratait l'étage du milieu — celui
    dont un enfant parle le plus naturellement.

    Le deck de chapitre existait depuis l'`adr-0049` ; il n'avait **aucune adresse** (il se
    lançait par `location.state`, comme le quiz avant ce chantier).

    Sabotage : retirer la branche `_resolve_chapitre` de `_open_notion`, ou faire rendre à
    `_route_de_chapitre` une route de matière pour `revision`.
    """
    # ⚠️ On greffe sur le module SOURCE, pas sur `chat.actions` : `_visible_notions` y est importé
    # DANS la fonction, donc patcher l'appelant serait vert et sans effet — le piège consigné dans
    # la mémoire du projet (« greffer sur les fabriques »), vérifié ici en le commettant.
    from app.modules.galaxy import service as galaxy_service

    client, _ = client_db
    monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 2.0)  # rien ne résout
    monkeypatch.setattr(
        galaxy_service,
        "_visible_notions",
        lambda db: [
            {
                "chapter_id": 3,
                "chapter_title": "Orthographe",
                "subject_slug": "francais",
                "subject_name": "Français",
            }
        ],
        raising=False,
    )
    _use_chat_llm(
        _chat_intent(
            {"kind": "open_notion", "notion_query": "orthographe", "tool": "revision"},
            "C'est parti !",
        )
    )
    sid = _open(client)
    body = _say(client, sid, text="fais-moi réviser l'orthographe").json()

    action = body["action"]
    assert action and action["kind"] == "navigate", "un chapitre s'ouvre, il ne se demande pas"
    assert action["route"] == "/revision?chapitre=3"


def test_les_INDEX_sont_atteignables_et_leur_vocabulaire_est_FERME(client_db) -> None:
    """« Montre-moi mes fiches » — sans dire lesquelles — ouvre la page qui les rassemble.

    Le chat savait viser une notion, un chapitre, une matière… et pas l'index. C'est pourtant la
    demande la plus simple qu'un enfant puisse formuler.

    ⚠️ Vocabulaire FERMÉ : un index halluciné ne produit RIEN plutôt qu'une route inventée —
    même doctrine que `DATA_KINDS`. Sabotage : accepter n'importe quelle valeur.
    """
    client, _ = client_db
    attendus = {
        "fiches": "/fiches",
        "mindmaps": "/mindmaps",
        "matieres": "/matieres",
        "quiz": "/quiz",
        "capsules": "/capsules",
        "revision": "/revision",
        "missions": "/missions",
        "agenda": "/agenda",
        "galaxy": "/galaxy",
    }
    for index, route in attendus.items():
        _use_chat_llm(_chat_intent({"kind": "open_index", "index": index}, "Voilà !"))
        sid = _open(client)
        action = _say(client, sid, text=f"montre-moi mes {index}").json()["action"]
        assert action and action["route"] == route, f"index {index}"

    _use_chat_llm(_chat_intent({"kind": "open_index", "index": "diagnostic"}, "Hmm"))
    sid = _open(client)
    # `/diagnostic` est écarté du routage par l'ADR-0027 §3 — « jamais routé de façon
    # anxiogène ». Une décision, pas un oubli : il ne doit PAS s'ouvrir depuis le chat.
    assert _say(client, sid, text="montre-moi mon diagnostic").json()["action"] is None


def test_l_atelier_de_fiche_est_atteignable_et_s_adresse_par_LECON(client_db, monkeypatch) -> None:
    """« Je veux écrire MA fiche sur X » — l'atelier existait, le chat n'y menait pas.

    ⚠️ Il s'adresse par **leçon** (c'est le cours qu'on résume), et il ne dépend d'aucune
    disponibilité : Massimo peut toujours écrire la sienne dès qu'un cours existe. Sans leçon
    rattachée, on ne route pas et le cours est réclamé à Papa.

    Sabotage : lire `fiche_id` au lieu de `lesson_id` — l'URL pointerait une fiche inexistante.
    """
    from app.modules.chat import actions

    client, _ = client_db
    monkeypatch.setattr(
        actions,
        "notion_panel",
        lambda db, sid: {
            "skill_id": 1,
            "name": "Les fractions",
            "status": "weak",
            "chapter_title": "Nombres",
            "subject_slug": "mathematiques",
            "subject_name": "Mathématiques",
            # La FICHE de ZETIS n'existe pas — et ça n'empêche pas Massimo d'écrire la sienne.
            "actions": [
                {"kind": "cours", "available": True, "lesson_id": 42},
                {"kind": "fiche", "available": False},
            ],
        },
    )
    _use_chat_llm(
        _chat_intent({"kind": "open_notion", "tool": "atelier"}, "À toi de jouer !")
    )
    sid = _open(client)
    action = _say(client, sid, text=RESOLVING).json()["action"]

    assert action and action["route"] == "/fiches/mathematiques/42/atelier"


def test_la_galaxie_ne_s_ouvre_pas_sur_les_fiches(client_db) -> None:
    """🔴 Né AU MICRO le 2026-08-15 — « ma galaxie d'histoire géo » ouvrait les FICHES.

    Le moteur n'avait aucun outil pour la progression et rabattait sur le plus proche : une
    réponse plausible et fausse, la pire espèce. La route était **déjà écrite** dans l'ADR-0027
    (note du 2026-07-31) ; elle n'a jamais été câblée.

    Sabotage : retirer la branche `galaxy` de `_notion_route`.
    """
    client, _ = client_db
    _use_chat_llm(
        _chat_intent(
            {"kind": "open_subject", "subject_query": "mathématiques", "tool": "galaxy"},
            "Regarde !",
        )
    )
    sid = _open(client)
    action = _say(client, sid, text="montre-moi ma galaxie de maths").json()["action"]

    assert action and action["route"] == "/galaxy?subject=mathematiques"
    assert "fiches" not in action["route"]


def test_le_moteur_ne_double_PAS_la_note_honnete_du_serveur(client_db, monkeypatch) -> None:
    """🔴 Né AU MICRO le 2026-08-15 — deux aveux à la suite.

    Lu à l'écran : *« Je n'ai pas encore de cours sur Charlemagne dans ma mémoire. Je note cette
    notion pour la prochaine fois ! Ça, je ne le trouve pas encore dans ton programme. »* Le
    moteur s'excuse ET promet, avant même que le serveur ait vérifié quoi que ce soit — puis le
    serveur dit la même chose, en mieux.

    Quand le serveur parle, il le fait **une seule fois et avec les bons mots** (composé,
    déterministe). La phrase du moteur est au mieux redondante, au pire une promesse qu'il
    n'était pas en position de tenir.

    Sabotage : remettre `_append_note` à la place de `_poser_note`.
    """
    client, _ = client_db
    app.dependency_overrides[get_embedder] = lambda: Crc32EmbeddingProvider()
    monkeypatch.setattr(settings, "chat_skill_resolution_min_score", 0.99)
    _use_chat_llm(
        _chat_intent(
            {"kind": "open_notion", "notion_query": "Charlemagne", "tool": "cours"},
            "Je n'ai pas encore de cours sur Charlemagne dans ma mémoire. Je le note !",
        )
    )
    sid = _open(client)
    reply = _say(client, sid, text="interroge-moi sur Charlemagne").json()["reply"]

    assert reply.count("note") <= 1, f"deux aveux empilés : {reply!r}"
    assert "dans ma mémoire" not in reply


def test_un_aveu_d_ignorance_DEMENTI_par_une_action_est_remplace(client_db) -> None:
    """🔴 Né AU MICRO le 2026-08-15, second passage.

    Une fois le routage réparé, ZETIS ouvrait bien le cours de français **en répondant qu'il
    n'avait pas ce sujet en mémoire**. Les deux à l'écran en même temps, et c'est l'enfant qui
    arbitre — il croira la phrase, pas le bouton.

    La cause est structurelle : le moteur rédige son `reply` AVANT que le serveur ne vérifie quoi
    que ce soit. Il ne PEUT pas savoir. Le prompt le lui interdit (`chat_v3`) et il le fera quand
    même : une consigne ne garantit rien, un ancrage garantit toujours. Même doctrine que le §7.

    Sabotage : retirer `_corriger_aveu_contredit` — la phrase du moteur revient à côté du bouton.
    """
    client, _ = client_db
    _use_chat_llm(
        _chat_intent(
            {"kind": "open_subject", "subject_query": "mathématiques", "tool": "fiche"},
            "Désolé, je n'ai pas ce sujet dans ma mémoire.",
        )
    )
    sid = _open(client)
    body = _say(client, sid, text="montre-moi mes fiches de maths").json()

    assert body["action"]["route"] == "/fiches/mathematiques"
    assert "mémoire" not in body["reply"]
    assert "je n'ai pas" not in body["reply"].lower()


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
