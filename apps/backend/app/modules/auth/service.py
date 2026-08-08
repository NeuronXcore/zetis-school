import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def authenticate(username: str, password: str) -> dict[str, str] | None:
    """Vérifie les identifiants de développement (comparaison constant-time).

    Renvoie {"username", "role"} si valides, sinon None.

    ⚠️ La comparaison porte sur des **bytes**, pas sur des `str`, et ce n'est pas cosmétique :
    `secrets.compare_digest` lève `TypeError: comparing strings with non-ASCII characters is not
    supported` dès qu'une des deux chaînes sort de l'ASCII. Un mot de passe simplement MAL TAPÉ
    avec un accent faisait donc rendre **HTTP 500** à cet endpoint au lieu d'un 401 — et le 500
    casse la réponse avant les en-têtes CORS, si bien que le navigateur n'affiche qu'une erreur
    réseau (« Load failed ») qui accuse le réseau au lieu du mot de passe.
    Reproduit en vrai le 2026-08-08 sur l'iPhone, avec un `é` produit par un décalage AZERTY.
    L'encodage UTF-8 accepte n'importe quelle entrée et **préserve le temps constant**.
    """
    user = settings.dev_users.get(username)
    if user is None:
        return None
    if not secrets.compare_digest(password.encode("utf-8"), user["password"].encode("utf-8")):
        return None
    return {"username": username, "role": user["role"]}


def create_access_token(username: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": username, "role": role, "exp": expire}
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict[str, str] | None:
    """Décode un JWT. Renvoie {"username", "role"} ou None si invalide/expiré."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    username = payload.get("sub")
    role = payload.get("role")
    if not username or not role:
        return None
    return {"username": username, "role": role}
