from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.db.models as m  # noqa: F401  (peuple Base.metadata)
from app.db.base import Base, get_db
from app.main import app
from app.modules.ai import get_embedder, get_provider
from app.modules.auth.deps import get_current_user
from app.modules.chat.store import InMemoryChatStore, get_chat_store
from app.modules.curriculum import get_curriculum_provider
from app.modules.rag.transcript import get_transcript_fetcher
from app.modules.stt import get_stt
from app.modules.tts import get_tts
from app.tests.fakes import (
    FakeEmbeddingProvider,
    FakeLLMProvider,
    FakeQueue,
    FakeSttProvider,
    FakeTranscriptFetcher,
    FakeTtsProvider,
)


def _redis_interdit(*_args, **_kwargs):
    """Le verrou. Une fuite lève ICI, elle n'écrit plus dans la file de dev."""
    raise RuntimeError(
        "Un test a tenté d'ouvrir une connexion Redis. Les files sont factices en test : "
        "si ce chemin doit enfiler quelque chose, il passe par app.core.queue."
    )


@pytest.fixture(autouse=True)
def file_rq_factice(monkeypatch) -> FakeQueue:
    """AUCUN test ne parle à un vrai Redis — qu'il y ait pensé ou non.

    ⚠️ **`autouse`, et c'est tout l'objet du correctif.** La protection existait déjà, mais à la
    charge de qui écrivait le test (`monkeypatch.setattr(queue_mod, "enqueue_render", …)`, cinq
    fois dans `test_capsule_render`). Elle a donc manqué exactement là où personne n'y a pensé —
    18 jobs fantômes dans la file de dev le 2026-08-04, 35 la veille. Une défense qu'il faut
    penser à activer n'est pas une défense, c'est une convention.

    ⚠️ **On remplace les deux FABRIQUES, pas les fonctions `enqueue_*`**, et ce détail est le
    correctif : `runs_router` importe `enqueue_production` au niveau module, donc patcher la
    fonction dans `app.core.queue` ne l'atteint pas — le garde-fou évident aurait été vert et sans
    effet. Voir `FakeQueue` pour le mécanisme.

    Le fixture rend la file : un test qui veut affirmer « ce clic a bien enfilé un lot » demande
    `file_rq_factice` et lit `.enqueued`. Les autres n'ont rien à savoir.
    """
    from app.core import queue as queue_mod

    file = FakeQueue()
    # ⚠️ Les fabriques sont `lru_cache`ées : un cache peuplé avant le patch rendrait la VRAIE file
    # malgré lui. On garde les fonctions D'ORIGINE pour pouvoir vider ce cache **après** — au
    # démontage, `queue_mod._redis` est encore le leurre, qui n'a pas de `cache_clear`.
    # ⚠️ `priority_queue` est dans la liste depuis l'ADR-0041 §5, et son oubli aurait rouvert la
    # fuite EXACTEMENT là où elle avait déjà eu lieu : un clic de Papa passe désormais par la file
    # prioritaire, donc c'est le chemin le PLUS testé qui serait parti dans le vrai Redis.
    originales = (
        queue_mod._redis,
        queue_mod.production_queue,
        queue_mod.priority_queue,
        queue_mod.render_queue,
    )
    for fabrique in originales:
        fabrique.cache_clear()
    monkeypatch.setattr(queue_mod, "_redis", _redis_interdit)
    monkeypatch.setattr(queue_mod, "production_queue", lambda: file)
    monkeypatch.setattr(queue_mod, "priority_queue", lambda: file)
    monkeypatch.setattr(queue_mod, "render_queue", lambda: file)
    yield file
    for fabrique in originales:
        fabrique.cache_clear()


@pytest.fixture()
def client_db() -> Iterator[tuple[TestClient, sessionmaker]]:
    """Client FastAPI sur SQLite in-memory + provider IA mocké (pas de Postgres ni d'ollama)."""
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    TestSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    Base.metadata.create_all(engine)

    db = TestSession()
    user = m.User(email="massimo@test.local", name="Massimo", role="child")
    db.add(user)
    db.flush()
    db.add(m.StudentProfile(user_id=user.id, first_name="Massimo", school_level_current="4e"))
    subject = m.Subject(name="Mathématiques", slug="mathematiques")
    db.add(subject)
    db.flush()
    db.add(m.Skill(subject_id=subject.id, name="Nombres relatifs", level="4e"))
    db.commit()
    db.close()

    def override_get_db() -> Iterator[Session]:
        session = TestSession()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: {"username": "massimo", "role": "child"}
    app.dependency_overrides[get_provider] = lambda: FakeLLMProvider()
    # Chat (ADR-0026) : store Redis remplacé par un InMemoryChatStore PARTAGÉ (aucun Redis en CI).
    # Partagé = une seule instance sur toute la durée du client, pour que les sessions survivent
    # entre requêtes (create → messages → close). `chat_store` exposé pour les assertions de TTL.
    chat_store = InMemoryChatStore()
    app.dependency_overrides[get_chat_store] = lambda: chat_store
    # Curriculum (ADR-0009) : provider dédié, mocké lui aussi (aucun appel Anthropic).
    app.dependency_overrides[get_curriculum_provider] = lambda: FakeLLMProvider()
    app.dependency_overrides[get_embedder] = lambda: FakeEmbeddingProvider()
    app.dependency_overrides[get_transcript_fetcher] = lambda: FakeTranscriptFetcher()
    app.dependency_overrides[get_tts] = lambda: FakeTtsProvider()
    # STT (ADR-0012) : dictée mockée (aucun faster-whisper ni modèle en CI).
    app.dependency_overrides[get_stt] = lambda: FakeSttProvider()
    try:
        yield TestClient(app), TestSession
    finally:
        app.dependency_overrides.clear()
