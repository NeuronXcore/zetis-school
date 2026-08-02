"""Le retour de demande à l'ouverture du chat (addendum ADR-0026).

Chacun de ces tests interdit une régression qui serait **silencieuse et honteuse** : annoncer un
contenu qui n'existe pas, faire porter un refus par la machine, ou transformer l'annonce en file
qui s'accumule.

⚠️ Ces tests n'utilisent PAS `FakeEmbeddingProvider` : il dérive ses vecteurs de `hash()`, qui est
**randomisé par processus** (`PYTHONHASHSEED`), et deux textes quelconques y sont souvent
colinéaires. Les tests du §3 étaient flaky à ~50 % — un texte censé NE PAS résoudre franchissait le
seuil une fois sur deux. `_ExactMatchEmbedder` remplace ce hasard par une règle : même texte →
même vecteur (cosinus 1.0), texte différent → vecteur quasi orthogonal (cosinus ≈ 0). C'est ce qui
rend les DEUX branches du §3 testables.
"""

import random
import zlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

import app.db.models as m
from app.main import app
from app.modules.activity import events
from app.modules.ai import get_embedder
from app.modules.chat import announce
from app.tests.test_fiche_service import _seed_validated_lesson


class _ExactMatchEmbedder:
    """Embedder DÉTERMINISTE : le texte seul décide du vecteur, jamais l'état du processus.

    Chaque texte sème un PRNG (`crc32`, stable d'un run à l'autre — contrairement à `hash()`) qui
    tire un vecteur gaussien. En dimension 768, deux tirages indépendants sont quasi orthogonaux :
    un texte identique donne 1.0, tout le reste tombe très loin sous le seuil de 0.72.
    """

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for text in texts:
            rng = random.Random(zlib.crc32(text.strip().casefold().encode()))
            out.append([rng.gauss(0.0, 1.0) for _ in range(self.dim)])
        return out


def _use_exact_embedder() -> None:
    """À appeler dans tout test qui dépend d'une résolution de notion (§3)."""
    app.dependency_overrides[get_embedder] = lambda: _ExactMatchEmbedder()

RESOLVING = "Nombres relatifs"  # nom exact de la Skill seedée → cosinus 1.0


# --- Helpers ---------------------------------------------------------------------------------


def _open(client) -> dict:
    resp = client.post("/api/student/chat/sessions")
    assert resp.status_code == 200, resp.text
    return resp.json()


def _skill(db) -> m.Skill:
    return db.scalar(select(m.Skill).where(m.Skill.name == RESOLVING))


def _student(db) -> m.StudentProfile:
    return db.scalar(select(m.StudentProfile).order_by(m.StudentProfile.id))


def _validated_fiche(db, lesson_id: int) -> m.Fiche:
    """Fiche VALIDÉE — c'est elle qui rend `fiche` `available` dans `resolve_panoply`."""
    fiche = m.Fiche(lesson_id=lesson_id, spec_json={"titre": "Fiche"}, validation_status="validated")
    db.add(fiche)
    db.commit()
    return fiche


def _content_request(db, *, kind: str, status: str = "done") -> m.ContentRequest:
    row = m.ContentRequest(
        student_id=_student(db).id,
        skill_id=_skill(db).id,
        content_kind=kind,
        status=status,
        source="chat_orchestrator",
    )
    db.add(row)
    db.commit()
    return row


def _announced(TestSession, model) -> list:
    with TestSession() as db:
        return [row.announced_at for row in db.scalars(select(model)).all()]


# --- §2 — le gate est la disponibilité, jamais le statut --------------------------------------


def test_demande_done_sans_contenu_ne_sannonce_pas_et_nest_pas_tamponnee(client_db) -> None:
    """LE test du §2. Papa a cliqué « Fait » ; la fiche n'existe pas. « Fait » est un geste, la
    disponibilité est un fait — annoncer sur le statut reconstruirait le mensonge tué le
    2026-07-30 (`notion_panel` annonçait un cours absent)."""
    client, TestSession = client_db
    with TestSession() as db:
        _seed_validated_lesson(db)  # cours validé, mais AUCUNE fiche
        _content_request(db, kind="fiche")

    assert _open(client)["announcement"] is None
    assert _announced(TestSession, m.ContentRequest) == [None], "la ligne a été tamponnée à tort"


def test_demande_done_avec_contenu_disponible_sannonce_avec_une_route_ancree(client_db) -> None:
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)
        _content_request(db, kind="fiche")

    announcement = _open(client)["announcement"]
    assert announcement is not None
    assert RESOLVING.lower() in announcement["text"].lower()
    assert len(announcement["actions"]) == 1
    action = announcement["actions"][0]
    assert action["kind"] == "navigate"
    assert action["route"].startswith("/fiches/")  # construite par `_notion_route`, pas ici
    assert action["confirm"] is True, "une offre se tape, elle ne s'auto-navigue jamais"


def test_quiz_et_capsule_ne_sannoncent_pas_faute_de_route(client_db) -> None:
    """`_notion_route` n'a pas leur branche (« hors v1 ») : pas de route ⇒ pas de carte ⇒ pas
    d'annonce ⇒ **pas de tampon**. Ils redeviendront annonçables le jour où la branche existera —
    construire la route ici la dédoublerait (addendum ADR-0024)."""
    client, TestSession = client_db
    with TestSession() as db:
        _seed_validated_lesson(db)
        _content_request(db, kind="quiz")
        _content_request(db, kind="capsule")

    assert _open(client)["announcement"] is None
    assert _announced(TestSession, m.ContentRequest) == [None, None]


# --- §6 — le refus n'a pas de canal, la route 1 reste muette -----------------------------------


def test_demande_ignoree_ne_sannonce_jamais(client_db) -> None:
    """Papa fait « Ignorer » → Massimo n'apprend rien. Jamais. Un refus est un acte parental ;
    faire porter le « non » par la machine l'abîme des deux côtés."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)  # le contenu EXISTE : seul le statut l'exclut
        _content_request(db, kind="fiche", status="dismissed")

    assert _open(client)["announcement"] is None
    assert _announced(TestSession, m.ContentRequest) == [None]


def test_contenu_produit_sans_demande_nannonce_rien(client_db) -> None:
    """Route 1 muette : rien n'a été promis, donc rien n'est dû. Pousser du contenu non sollicité
    serait la relance interdite."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)  # produit, mais personne ne l'a demandé

    assert _open(client)["announcement"] is None


# --- §4 et §1 — nommer 2, tamponner tout ; puis s'éteindre -------------------------------------


def test_nomme_deux_max_mais_tamponne_tout_le_lot(client_db) -> None:
    """Tamponner seulement ce qu'on nomme ferait s'empiler le reliquat, qui redeviendrait une
    pression annonce après annonce. Et rien ne dit « et 3 autres » : ce compteur est interdit."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)
        skill_id, student_id = _skill(db).id, _student(db).id
        # 3 types tous réellement disponibles sur la même notion (cours, fiche, et une carte SRS).
        db.add(
            m.SpacedReviewCard(
                student_id=student_id,
                skill_id=skill_id,
                front_markdown="Q ?",
                back_markdown="R.",
                interval_days=1,
                due_at=lesson.created_at,
                status="scheduled",
            )
        )
        db.commit()
        for kind in ("cours", "fiche", "card"):
            _content_request(db, kind=kind)

    announcement = _open(client)["announcement"]
    assert announcement is not None
    assert len(announcement["actions"]) == 2, "règle « ≤ 2 propositions »"
    assert "autre" not in announcement["text"].lower(), "aucun compteur de reliquat"
    assert all(stamp is not None for stamp in _announced(TestSession, m.ContentRequest))


def test_lannonce_seteint_a_la_deuxieme_ouverture(client_db) -> None:
    """Dite une fois, éteinte. Aucune file qui grossit : ne pas venir chercher sa fiche
    n'accumule rien."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)
        _content_request(db, kind="fiche")

    assert _open(client)["announcement"] is not None
    assert _open(client)["announcement"] is None


# --- §3 — pour `notion_requests`, le résolveur EST la preuve -----------------------------------


def test_notion_request_non_resolue_ne_sannonce_pas_et_reste_eligible(client_db) -> None:
    """`notion_requests` n'a pas de `skill_id` : « ajoutée » est un statut invérifiable. Un texte
    qui ne résout pas ⇒ ni annonce ni tampon — la ligne reste éligible pour le jour où Papa
    l'ajoutera vraiment."""
    client, TestSession = client_db
    _use_exact_embedder()
    with TestSession() as db:
        _seed_validated_lesson(db)
        db.add(
            m.NotionRequest(student_id=_student(db).id, text="pythagore", status="added")
        )
        db.commit()

    assert _open(client)["announcement"] is None
    assert _announced(TestSession, m.NotionRequest) == [None]


def test_notion_request_resolue_sannonce(client_db) -> None:
    """Le résolveur avait échoué à la création — c'est pourquoi la ligne existe. Qu'il réussisse
    maintenant EST la preuve que la notion est entrée au programme."""
    client, TestSession = client_db
    _use_exact_embedder()
    with TestSession() as db:
        _seed_validated_lesson(db)
        db.add(m.NotionRequest(student_id=_student(db).id, text=RESOLVING, status="added"))
        db.commit()

    announcement = _open(client)["announcement"]
    assert announcement is not None
    assert RESOLVING in announcement["text"]
    assert all(stamp is not None for stamp in _announced(TestSession, m.NotionRequest))


# --- Ancrage de la trace du tap ---------------------------------------------------------------


def _tap(client, session_id: str, **tool_response):
    return client.post(
        f"/api/student/chat/sessions/{session_id}/messages",
        json={"tool_response": {"tool_type": "fiche", "accepted": True, **tool_response}},
    )


def test_le_tap_dune_carte_dannonce_trace_la_notion_de_la_carte(client_db) -> None:
    """Un tap d'annonce est souvent le PREMIER acte de la session. Sans `skill_id` sur l'action, le
    serveur retombait sur le dernier `chat_topic` de l'élève — vieux de plusieurs jours en vrai, et
    donc attribué à la mauvaise notion (observé le 2026-08-02 : trace `skill_id=102` pour une fiche
    ouverte sur la notion 126)."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)
        skill_id = _skill(db).id
        student_id = _student(db).id
        # Le repli périmé : un vieux `chat_topic` sur une AUTRE notion.
        other = m.Skill(subject_id=_skill(db).subject_id, name="Notion d'avant", level="4e")
        db.add(other)
        db.flush()
        db.add(
            m.LearningEvent(
                student_id=student_id,
                event_type="chat_topic",
                skill_id=other.id,
                payload_json={"skill_id": other.id},
                created_at=datetime.now(timezone.utc) - timedelta(days=4),
            )
        )
        _content_request(db, kind="fiche")
        db.commit()
        stale_id = other.id

    opened = _open(client)
    action = opened["announcement"]["actions"][0]
    assert action["skill_id"] == skill_id, "l'action doit porter la notion qu'elle ouvre"

    assert _tap(client, opened["session_id"], skill_id=action["skill_id"]).status_code == 200
    with TestSession() as db:
        event = db.scalars(
            select(m.LearningEvent).where(m.LearningEvent.event_type == "chat_tool_response")
        ).one()
    assert event.skill_id == skill_id
    assert event.payload_json["skill_id"] == skill_id
    assert event.skill_id != stale_id, "le repli périmé a repris la main"


def test_un_skill_id_client_invisible_est_ignore(client_db) -> None:
    """Le client ne fait que réémettre ce que le serveur lui a donné — mais un payload reste un
    payload. Un id invisible (ou inventé) est REJETÉ et le repli reprend la main : sans ce contrôle,
    n'importe qui pourrait attribuer une activité de Massimo à n'importe quelle notion."""
    client, TestSession = client_db
    with TestSession() as db:
        _seed_validated_lesson(db)

    session_id = _open(client)["session_id"]
    assert _tap(client, session_id, skill_id=999_999).status_code == 200
    with TestSession() as db:
        event = db.scalars(
            select(m.LearningEvent).where(m.LearningEvent.event_type == "chat_tool_response")
        ).one()
    assert event.skill_id is None, "un id non ancrable ne doit RIEN écrire dans le journal"


# --- Verrous de doctrine ----------------------------------------------------------------------


def test_aucun_event_type_neuf(client_db) -> None:
    """La slice réutilise `chat_tool_response` pour le tap. Un `event_type` neuf ici passerait
    inaperçu et polluerait le journal d'activité, qui est LU par l'évidence et la heatmap."""
    client, TestSession = client_db
    with TestSession() as db:
        lesson = _seed_validated_lesson(db)
        _validated_fiche(db, lesson.id)
        _content_request(db, kind="fiche")

    before = {name for name in dir(events) if name.startswith("EVENT_")}
    assert _open(client)["announcement"] is not None
    with TestSession() as db:
        types = set(db.scalars(select(m.LearningEvent.event_type)).all())
    assert types == set(), "ouvrir une session n'est pas un acte pédagogique"
    assert {name for name in dir(events) if name.startswith("EVENT_")} == before


def test_aucune_route_construite_dans_le_composeur() -> None:
    """`_notion_route` est la SEULE fabrique de destinations du chat. Une f-string commençant par
    « / » dans `announce.py` serait une seconde source — exactement ce que l'addendum ADR-0024
    interdit, et ce que le correctif du 2026-07-30 a payé."""
    import inspect

    source = inspect.getsource(announce)
    code = [
        line
        for line in source.splitlines()
        if not line.lstrip().startswith("#") and "_notion_route" not in line
    ]
    assert not any('"/' in line or "'/" in line for line in code), (
        "une destination est construite dans announce.py — elle doit venir de _notion_route"
    )
