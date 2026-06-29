import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings

ALGORITHM = "HS256"


def authenticate(username: str, password: str) -> dict[str, str] | None:
    """Vérifie les identifiants de développement (comparaison constant-time).

    Renvoie {"username", "role"} si valides, sinon None.
    """
    user = settings.dev_users.get(username)
    if user is None:
        return None
    if not secrets.compare_digest(password, user["password"]):
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
