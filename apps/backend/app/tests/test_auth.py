from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_login_papa_ok() -> None:
    response = client.post("/api/auth/login", json={"username": "papa", "password": "papa1234"})
    assert response.status_code == 200
    body = response.json()
    assert body["role"] == "papa"
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_massimo_ok() -> None:
    response = client.post(
        "/api/auth/login", json={"username": "massimo", "password": "massimo1234"}
    )
    assert response.status_code == 200
    assert response.json()["role"] == "massimo"


def test_login_bad_password() -> None:
    response = client.post("/api/auth/login", json={"username": "papa", "password": "wrong"})
    assert response.status_code == 401


def test_me_requires_token() -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_role() -> None:
    token = client.post(
        "/api/auth/login", json={"username": "massimo", "password": "massimo1234"}
    ).json()["access_token"]
    response = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"username": "massimo", "role": "massimo"}
