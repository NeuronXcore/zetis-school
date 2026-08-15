"""Interrogation orale de ZETIS (ADR-0059 §10, §11, §12).

Ce qui est verrouillé ici n'est pas « ZETIS pose des questions » — c'est **tout ce qu'il ne peut
pas faire** : inventer les questions sans cours, dire « faux » à cause d'une dictée approximative,
continuer quand Massimo veut arrêter, ou faire compter une mesure qui n'est pas fiable.
"""

import app.db.models as m
from sqlalchemy import select

from app.db.models import Skill, XPEvent
from app.main import app
from app.modules.ai import get_embedder, get_provider
from app.modules.chat import actions, recall
from app.modules.chat.store import get_chat_store
from app.tests.fakes import Crc32EmbeddingProvider, FakeLLMProvider

RESOLVING = "Nombres relatifs"  # nom exact de la Skill seedée → ancrage garanti


def _open(client) -> str:
    return client.post("/api/student/chat/sessions").json()["session_id"]


def _say(client, sid: str, *, text: str):
    return client.post(f"/api/student/chat/sessions/{sid}/messages", json={"text": text})


def _panel(skill_id: int, *, avec_cours: bool) -> dict:
    return {
        "skill_id": skill_id,
        "name": RESOLVING,
        "status": "weak",
        "chapter_title": "Nombres",
        "subject_slug": "mathematiques",
        "subject_name": "Mathématiques",
        "actions": [
            {"kind": "cours", "available": avec_cours, "lesson_id": 3 if avec_cours else None},
            {"kind": "eli5", "available": avec_cours},
        ],
    }


class _Interrogateur:
    """Moteur déterministe : rend un tour de chat OU un tour de recall selon le schéma reçu."""

    def __init__(self, *, verdict: str = "ok", question: str = "Que vaut -3 + 5 ?") -> None:
        self.verdict = verdict
        self.question = question
        self.appels = 0

    def generate(self, request):  # noqa: ANN001, ANN201
        import json

        from app.modules.ai.provider import LLMResponse

        proprietes = (request.fmt or {}).get("properties", {})
        if "next_question" in proprietes:
            self.appels += 1
            return LLMResponse(
                text=json.dumps(
                    {
                        "verdict": self.verdict,
                        "feedback": "C'est ça.",
                        "next_question": self.question,
                    }
                ),
                model="fake",
                duration_ms=1,
            )
        return LLMResponse(
            text=json.dumps(
                {
                    "reply": "D'accord !",
                    "declared_difficulty": {"declared": False, "kind": ""},
                    "tool_suggestion": "",
                    "intent": {"kind": "start_recall", "notion_query": RESOLVING},
                }
            ),
            model="fake",
            duration_ms=1,
        )


def _use(moteur) -> None:  # noqa: ANN001
    app.dependency_overrides[get_provider] = lambda: moteur
    app.dependency_overrides[get_embedder] = lambda: Crc32EmbeddingProvider()


def _skill_id(Session) -> int:
    db = Session()
    try:
        return db.scalar(select(Skill.id).where(Skill.name == RESOLVING))
    finally:
        db.close()


def test_pas_de_cours_pas_d_interrogation(client_db, monkeypatch) -> None:
    """🔴 §10 — sans cours validé, ZETIS inventerait les questions ET les corrections.

    Le gate est EMPRUNTÉ à `resolve_panoply` (`eli5.available` ⇔ un cours existe), jamais
    redérivé : le filtre dupliqué a dû être supprimé d'`actions.py` le 2026-08-01.

    Sabotage : ouvrir l'interrogation quand seuls des extraits existent.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=False))
    _use(_Interrogateur())
    sid = _open(client)
    body = _say(client, sid, text=f"interroge-moi sur {RESOLVING}").json()

    assert body["recall"] is None
    assert "je le note" in body["reply"]
    db = Session()
    try:
        lignes = db.query(m.ContentRequest).all()
        assert [(r.skill_id, r.content_kind) for r in lignes] == [(skill_id, "cours")]
    finally:
        db.close()


def test_l_interrogation_s_ouvre_et_pose_une_question(client_db, monkeypatch) -> None:
    """Ouverture nominale : ZETIS pose sa première question, l'état vit dans Redis."""
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    _use(_Interrogateur())
    sid = _open(client)
    body = _say(client, sid, text=f"interroge-moi sur {RESOLVING}").json()

    assert body["recall"]["asked"] == 1
    assert body["recall"]["total"] == 3
    assert body["recall"]["finished"] is False
    assert "-3 + 5" in body["reply"]
    # `action` est ABSENTE : rien à auto-naviguer pendant une interrogation.
    assert body["action"] is None


def test_l_interrogation_s_arrete_TOUTE_SEULE_a_trois_questions(client_db, monkeypatch) -> None:
    """🔴 §10 — c'est le SERVEUR qui arrête. Un modèle à qui l'on demande d'arrêter n'arrête pas.

    Le moteur propose ici une question à CHAQUE tour, y compris au dernier. Elle ne doit pas être
    servie. Sabotage : laisser `next_question` du dernier tour passer dans la réponse.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    _use(_Interrogateur())
    sid = _open(client)
    _say(client, sid, text=f"interroge-moi sur {RESOLVING}")

    for attendu in (2, 3):
        body = _say(client, sid, text="ça fait deux, je crois bien").json()
        assert body["recall"]["asked"] == attendu
        assert body["recall"]["finished"] is False

    fin = _say(client, sid, text="ça fait deux, je crois bien").json()
    assert fin["recall"]["finished"] is True
    assert "-3 + 5" not in fin["reply"], "aucune question au-delà du plafond"
    assert recall.CLOTURE in fin["reply"]

    # L'état a disparu : le tour suivant redevient une conversation ordinaire.
    # ⚠️ Le store des tests est celui de la fixture (en mémoire), pas le singleton Redis :
    # `get_chat_store()` rendrait un client Redis réel et lirait à côté.
    store = app.dependency_overrides[get_chat_store]()
    db = Session()
    try:
        student_id = db.scalar(select(m.StudentProfile.id))
    finally:
        db.close()
    assert store.read_state(student_id, sid) is None


def test_massimo_peut_sortir_a_tout_moment_et_zetis_n_insiste_pas(client_db, monkeypatch) -> None:
    """§10 — « stop » sort, sans un mot de plus. `adr-0026` §4 : ZETIS n'insiste JAMAIS.

    ⚠️ La sortie est testée AVANT tout appel au moteur : une sortie qui dépendrait de lui
    pourrait être ignorée par lui, et l'enfant serait retenu dans une boucle.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    moteur = _Interrogateur()
    _use(moteur)
    sid = _open(client)
    _say(client, sid, text=f"interroge-moi sur {RESOLVING}")
    avant = moteur.appels

    body = _say(client, sid, text="stop").json()
    assert body["recall"]["finished"] is True
    assert moteur.appels == avant, "aucun appel au moteur pour sortir"
    assert "encore" not in body["reply"].lower()


def test_une_reponse_trop_courte_n_est_JAMAIS_evaluee(client_db, monkeypatch) -> None:
    """🔴 §11.3 — une dictée ratée ne produit pas de verdict sur Massimo.

    Le plancher est déterministe, sans LLM. Sabotage : le supprimer — « euh » deviendrait une
    réponse jugée, et le moteur la jugerait probablement mal.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    moteur = _Interrogateur()
    _use(moteur)
    sid = _open(client)
    _say(client, sid, text=f"interroge-moi sur {RESOLVING}")
    avant = moteur.appels

    body = _say(client, sid, text="euh").json()
    assert moteur.appels == avant, "aucune évaluation demandée sur une dictée trop courte"
    assert body["reply"] == recall.TROP_COURT
    assert body["recall"]["asked"] == 1, "on ne consomme pas une question"


def test_un_verdict_inconnu_retombe_sur_le_DOUTE_jamais_sur_un_negatif() -> None:
    """🔴 §11.1 — le doute profite à l'enfant PAR CONSTRUCTION.

    Le vocabulaire est fermé et ne contient PAS « faux ». Un moteur qui en invente un se voit
    normaliser vers `a_reformuler` — pas vers `a_revoir`.

    Sabotage : mapper l'inconnu vers `a_revoir`.
    """
    assert recall._verdict("faux") == "a_reformuler"
    assert recall._verdict("incorrect") == "a_reformuler"
    assert recall._verdict("") == "a_reformuler"
    assert recall._verdict("nul") == "a_reformuler"
    # Les quatre valeurs légitimes passent telles quelles.
    for valeur in ("ok", "partiel", "a_revoir", "a_reformuler"):
        assert recall._verdict(valeur) == valeur


def test_une_interrogation_complete_ne_produit_ni_XP_ni_maitrise_ni_event_neuf(
    client_db, monkeypatch
) -> None:
    """🔴 §12 — la mesure la moins fiable du dépôt ne devient pas probante.

    Un seul événement, à l'OUVERTURE, et c'est un `chat_tool_response` : un ACTE (« il a accepté
    d'être interrogé »), pas une mesure. Zéro XP, zéro `SkillMastery`, aucun `event_type` neuf.

    Sabotage : appeler `award_xp` ou `record_mastery_transition` dans `recall.py`.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    _use(_Interrogateur())
    sid = _open(client)
    _say(client, sid, text=f"interroge-moi sur {RESOLVING}")
    for _ in range(3):
        _say(client, sid, text="ça fait deux, je crois bien")

    db = Session()
    try:
        assert db.query(XPEvent).count() == 0
        assert db.query(m.SkillMastery).count() == 0
        types = {e.event_type for e in db.query(m.LearningEvent).all()}
        assert types <= {"chat_topic", "chat_tool_response", "chat_difficulty_declared"}
        actes = [
            e
            for e in db.query(m.LearningEvent).all()
            if (e.payload_json or {}).get("tool_type") == "interro_orale"
        ]
        assert len(actes) == 1, "un seul acte, à l'ouverture — pas un par question"
    finally:
        db.close()


def test_l_etat_d_interrogation_meurt_avec_la_session(client_db, monkeypatch) -> None:
    """§10 — `close_session` purge LES DEUX clés Redis.

    Sabotage : oublier `clear_state` dans `close_session` — une session close « se souviendrait »
    d'une interrogation en cours jusqu'au TTL.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    monkeypatch.setattr(actions, "notion_panel", lambda db, sid: _panel(skill_id, avec_cours=True))
    _use(_Interrogateur())
    sid = _open(client)
    _say(client, sid, text=f"interroge-moi sur {RESOLVING}")

    # ⚠️ Le store des tests est celui de la fixture (en mémoire), pas le singleton Redis :
    # `get_chat_store()` rendrait un client Redis réel et lirait à côté.
    store = app.dependency_overrides[get_chat_store]()
    db = Session()
    try:
        student_id = db.scalar(select(m.StudentProfile.id))
    finally:
        db.close()
    assert store.read_state(student_id, sid) is not None

    client.post(f"/api/student/chat/sessions/{sid}/close")
    assert store.read_state(student_id, sid) is None
