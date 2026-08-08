import pytest
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


# 🔴 LE VERROU du défaut du 2026-08-08, trouvé sur l'iPhone de Massimo et pas ici.
#
# `test_login_bad_password` ci-dessus existait déjà — et il n'a rien vu, parce qu'il essaie
# « wrong », qui est de l'ASCII pur. `secrets.compare_digest` ne lève que sur du NON-ASCII :
# l'endpoint rendait **500** au lieu de 401, avec un traceback ASGI, dès qu'un accent entrait
# dans la saisie. Sur un clavier français, c'est le cas RATÉ le plus banal qui soit.
#
# ⚠️ Ce que ce verrou vérifie n'est PAS « le mot de passe est refusé » — l'ancien test le faisait
# déjà. C'est : **le refus est un 401 propre, jamais une erreur serveur.** Un endpoint
# d'authentification qui s'effondre sur une entrée utilisateur arbitraire est un défaut à part.
@pytest.mark.parametrize(
    "mot_de_passe",
    [
        "massimoé",  # l'accent français — celui qui a réellement déclenché le 500
        ",qssi,o&é\"'",  # la saisie exacte relevée à l'écran (AZERTY lu en QWERTY)
        "пароль",  # hors alphabet latin
        "massimo1234🔑",  # hors du plan multilingue de base
    ],
)
def test_mot_de_passe_non_ascii_rend_401_jamais_500(mot_de_passe: str) -> None:
    response = client.post(
        "/api/auth/login", json={"username": "massimo", "password": mot_de_passe}
    )
    assert response.status_code == 401, (
        f"un mot de passe non-ASCII doit être REFUSÉ proprement, pas faire tomber le serveur "
        f"(reçu {response.status_code})"
    )


def test_un_identifiant_non_ascii_est_refuse_sans_incident() -> None:
    # L'autre porte d'entrée : ici `dev_users.get()` rend None avant toute comparaison, donc le
    # défaut ne pouvait pas s'y produire. Le verrou fige ce fait plutôt que de le supposer.
    response = client.post(
        "/api/auth/login", json={"username": "massimö", "password": "peu importe"}
    )
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
