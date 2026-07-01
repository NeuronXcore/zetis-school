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
from app.modules.tts import get_tts
from app.tests.fakes import FakeEmbeddingProvider, FakeLLMProvider, FakeTtsProvider


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
    app.dependency_overrides[get_embedder] = lambda: FakeEmbeddingProvider()
    app.dependency_overrides[get_tts] = lambda: FakeTtsProvider()
    try:
        yield TestClient(app), TestSession
    finally:
        app.dependency_overrides.clear()
