from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.modules.auth.service import decode_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, str]:
    """Dépendance FastAPI : extrait et valide le JWT du header Authorization."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentification requise",
        )
    user = decode_token(credentials.credentials)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token invalide ou expiré",
        )
    return user


# Rôles autorisés pour l'espace Papa (le login dev émet le rôle "papa" ; on tolère
# aussi les rôles DB "parent"/"admin").
_PARENT_ROLES = frozenset({"papa", "parent", "admin"})


def require_parent(
    current: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:
    """Dépendance FastAPI : réserve la route à Papa (parent/admin). Cf. CLAUDE.md §sécurité."""
    if current.get("role") not in _PARENT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé à Papa.",
        )
    return current


# Rôles de l'espace enfant (le login dev émet "massimo" ; on tolère le rôle DB "child").
_CHILD_ROLES = frozenset({"massimo", "child"})


def require_child(
    current: dict[str, str] = Depends(get_current_user),
) -> dict[str, str]:
    """Dépendance FastAPI : réserve la route à Massimo (télémétrie de navigation).

    Symétrique de `require_parent` : la seule écriture cliente du journal d'activité ne doit pas
    pouvoir être alimentée depuis l'espace Papa."""
    if current.get("role") not in _CHILD_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé à l'espace de Massimo.",
        )
    return current
