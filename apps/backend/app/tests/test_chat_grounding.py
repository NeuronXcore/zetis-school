"""ZETIS répond au fond — mais UNIQUEMENT ancré (ADR-0059 §7, §8, §9).

La règle « aiguilleur » de l'ADR-0027 §3 est révoquée pour la seule PAROLE de ZETIS. Ce qui la
remplace n'est pas une permission : c'est une **contrainte d'ancrage**, et elle doit tenir sans
dépendre de la docilité du moteur. Ces verrous décrivent ce que le serveur garantit, quoi que
le moteur réponde.
"""

import app.db.models as m
from sqlalchemy import select

from app.db.models import AIJob, Skill, StudentProfile
from app.main import app
from app.modules.ai import get_embedder, get_provider
from app.modules.chat import service as chat_service
from app.tests.fakes import Crc32EmbeddingProvider, FakeLLMProvider

RESOLVING = "Nombres relatifs"  # = nom exact de la Skill seedée → cosinus 1.0 (ancrage garanti)


def _open(client) -> str:
    return client.post("/api/student/chat/sessions").json()["session_id"]


def _say(client, sid: str, *, text: str):
    return client.post(f"/api/student/chat/sessions/{sid}/messages", json={"text": text})


def _question(used_source: str, reply: str = "Parce que les parts doivent être égales.") -> dict:
    """Sortie d'un moteur qui déclare répondre à une question de fond."""
    return {
        "reply": reply,
        "declared_difficulty": {"declared": False, "kind": ""},
        "tool_suggestion": "",
        "answer": {"is_question": True, "used_source": used_source},
        "intent": {"kind": "none"},
    }


def _use(chat: dict) -> None:
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider(chat=chat)
    # ⚠️ **`Crc32EmbeddingProvider`, jamais `FakeEmbeddingProvider`.** Ces tests dépendent de la
    # RÉSOLUTION de la notion (le refus honnête n'enregistre une demande que si `skill_id` est
    # résolu). Le fake par défaut dérive de `hash()`, salé par `PYTHONHASHSEED` : un test de
    # résolution y est vert une fois sur deux. Piège déjà consigné dans la mémoire du projet.
    app.dependency_overrides[get_embedder] = lambda: Crc32EmbeddingProvider()


def _skill_id(Session) -> int:
    db = Session()
    try:
        return db.scalar(select(Skill.id).where(Skill.name == RESOLVING))
    finally:
        db.close()


def test_sans_ancrage_zetis_ne_repond_pas_et_le_dit(client_db) -> None:
    """🔴 LE verrou de la révocation : pas de source ⇒ pas de réponse de fond.

    Le moteur local CONNAÎT les fractions. Lui donner le droit de répondre le rend beaucoup plus
    enclin à répondre *sans* le cours — et une explication inventée avec aplomb contourne la
    validation de Papa sans que personne s'en aperçoive. Le serveur ne se fie donc pas au prompt :
    quand rien n'ancrait, il **remplace** la réponse par la note honnête.

    Sabotage : garder `reply` du moteur et se contenter d'y ajouter une note.
    """
    client, Session = client_db
    # Aucune leçon validée en base pour cette notion → `resolve_canonical_context` ne rend rien.
    _use(_question("cours", reply="Parce que blablabla inventé par le moteur."))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()

    assert body["grounding"]["kind"] == "aucune"
    assert "inventé" not in body["reply"]
    assert body["reply"] == chat_service.NOTE_SANS_ANCRAGE


def test_le_refus_honnete_enregistre_la_demande(client_db) -> None:
    """§8 — troisième déclencheur : une question sans ancrage devient une demande de cours.

    Zéro plomberie neuve : on réutilise `_maybe_request_content`. Sabotage : retirer ce
    déclencheur — ZETIS resterait honnête mais Papa n'apprendrait jamais ce qui manque.
    """
    client, Session = client_db
    skill_id = _skill_id(Session)
    _use(_question("aucune"))
    sid = _open(client)
    _say(client, sid, text=RESOLVING)

    db = Session()
    try:
        lignes = db.query(m.ContentRequest).all()
        assert [(r.skill_id, r.content_kind) for r in lignes] == [(skill_id, "cours")]
    finally:
        db.close()


def test_le_grounding_est_calcule_serveur_jamais_cru_au_moteur(client_db) -> None:
    """🔴 §7 — `used_source` sert à DÉTECTER LE MENSONGE, jamais à décider.

    Le moteur annonce « d'après le cours » alors qu'aucune leçon n'a été injectée : c'est qu'il a
    répondu de mémoire. Le serveur pose `aucune` et trace l'incohérence, auditable après coup.

    Sabotage : `grounding.kind = parsed["answer"]["used_source"]`.
    """
    client, Session = client_db
    _use(_question("cours"))
    sid = _open(client)
    body = _say(client, sid, text=RESOLVING).json()

    assert body["grounding"]["kind"] == "aucune"  # ce que le SERVEUR sait avoir injecté

    db = Session()
    try:
        job = db.scalars(select(AIJob).where(AIJob.job_type == "chat_turn")).one()
        assert job.output_json["source_mismatch"] is True
        assert job.output_json["grounding"] == "aucune"
    finally:
        db.close()


def test_une_modestie_n_est_pas_un_mensonge(client_db) -> None:
    """Déclarer une source PLUS FAIBLE que celle fournie ne trahit rien.

    Le mensonge qu'on traque est la sur-déclaration (prétendre le cours quand il n'y en a pas),
    pas la sous-déclaration. Confondre les deux ferait rougir la trace sur des tours honnêtes, et
    le signal `source_mismatch` deviendrait inexploitable.
    """
    client, Session = client_db
    _use(_question("aucune"))
    sid = _open(client)
    _say(client, sid, text=RESOLVING)

    db = Session()
    try:
        job = db.scalars(select(AIJob).where(AIJob.job_type == "chat_turn")).one()
        assert job.output_json["source_mismatch"] is None
    finally:
        db.close()


def test_un_tour_qui_n_est_pas_une_question_n_a_aucun_grounding(client_db) -> None:
    """Bavarder n'est pas demander le fond : la puce de source ne doit pas s'afficher.

    Sabotage : rendre un `grounding` sur tous les tours — Massimo verrait « d'après ta leçon »
    sous un « salut ! ».
    """
    client, _ = client_db
    _use(
        {
            "reply": "Salut Massimo !",
            "declared_difficulty": {"declared": False, "kind": ""},
            "tool_suggestion": "",
            "answer": {"is_question": False},
            "intent": {"kind": "none"},
        }
    )
    sid = _open(client)
    body = _say(client, sid, text="coucou").json()
    assert body["grounding"] is None
    # La réponse du moteur n'est PAS remplacée. (L'orchestration peut y ajouter sa propre note
    # d'honnêteté — « coucou » ne désigne aucune notion — et c'est son droit : ce qu'on vérifie
    # ici est que la substitution du §7 ne s'est pas déclenchée.)
    assert body["reply"].startswith("Salut Massimo !")
    assert chat_service.NOTE_SANS_ANCRAGE not in body["reply"]


def test_le_chat_passe_un_skill_id_jamais_un_lesson_id(client_db, monkeypatch) -> None:
    """⚠️ Piège consigné dans la mémoire du projet, épinglé ici avant qu'on l'importe.

    `resolve_canonical_context` attend un `skill_id`. Le module `fiches` a dû forcer un
    `CanonicalContext` parce qu'il partait d'une LEÇON — un patron qu'on pourrait recopier ici
    par mimétisme. Le chat, lui, part d'une notion (`resolve_skill`) : il n'a jamais à le faire.
    """
    client, Session = client_db
    vus: list[int] = []
    vrai = chat_service.resolve_canonical_context

    def espion(db, embedder, *, skill_id, query):  # noqa: ANN001, ANN202
        vus.append(skill_id)
        return vrai(db, embedder, skill_id=skill_id, query=query)

    monkeypatch.setattr(chat_service, "resolve_canonical_context", espion)
    _use(_question("aucune"))
    sid = _open(client)
    _say(client, sid, text=RESOLVING)

    assert vus, "le contexte canonique doit être résolu à chaque tour ancré"
    db = Session()
    try:
        connus = {s for (s,) in db.execute(select(Skill.id))}
        for identifiant in vus:
            assert identifiant in connus, "un id de LEÇON a été passé là où une NOTION est attendue"
    finally:
        db.close()


def test_la_regle_d_autorite_survit_a_la_troncature(client_db, monkeypatch) -> None:
    """🔴 §9 — le cours peut être coupé, la phrase qui dit quoi en faire JAMAIS.

    Jusqu'au 2026-08-15, `_compose_context` tronquait le bloc COMPOSÉ à 1200 caractères. La règle
    d'autorité, écrite en dernier par `build_canonical_sections`, disparaissait donc à tous les
    coups — ZETIS recevait un cours arbitrairement coupé sans savoir qu'il faisait foi.

    Sabotage : remettre une troncature sur la concaténation finale.
    """
    from app.modules.ai.canonical_context import CanonicalContext, build_canonical_sections

    class _Lecon:
        title = "Les fractions"
        content_markdown = "\n\n".join(f"Paragraphe {i} " + "x" * 400 for i in range(20))

    bloc = build_canonical_sections(
        CanonicalContext(lesson=_Lecon(), chunks=[]),
        max_lesson_chars=1200,
        max_chunk_chars=400,
    )
    assert "le cours fait foi" in bloc, "la règle d'autorité ne doit jamais être tronquée"
    assert "Paragraphe 0" in bloc, "le début du cours doit survivre"
    assert "Paragraphe 19" not in bloc, "le budget doit réellement mordre"
    # Coupé à une frontière de PARAGRAPHE : chaque paragraphe conservé doit être intact, aucun
    # ne doit être amputé. Une coupe brute (`texte[:n]`) laisserait le dernier tronqué.
    corps = bloc.split("## COURS VALIDÉ (source canonique)\n", 1)[1].split("\n\nRègle :", 1)[0]
    entiers = set(_Lecon.content_markdown.split("\n\n"))
    for paragraphe in corps.split("\n\n"):
        assert paragraphe in entiers, "un paragraphe a été coupé en son milieu"
