from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.activity.events import EVENT_LOGIN, log_learning_event, student_id_or_none
from app.modules.auth.deps import get_current_user
from app.modules.auth.schemas import LoginRequest, MeResponse, TokenResponse
from app.modules.auth.service import authenticate, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Rôles dont la connexion constitue une activité de Massimo (le journal ne trace pas Papa).
_CHILD_ROLES = frozenset({"massimo", "child"})


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate(payload.username, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )
    # Journal d'activité : seule la connexion de Massimo est une activité pédagogique. Émission
    # SERVEUR (le client ne déclare pas s'être connecté). Sans profil élève en base, on ne trace
    # rien — une connexion ne doit jamais échouer à cause du journal.
    if user["role"] in _CHILD_ROLES:
        student_id = student_id_or_none(db)
        if student_id is not None:
            log_learning_event(db, student_id=student_id, event_type=EVENT_LOGIN, payload={})
            db.commit()
    token = create_access_token(user["username"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], username=user["username"])


@router.get("/me", response_model=MeResponse)
def me(current: dict[str, str] = Depends(get_current_user)) -> MeResponse:
    return MeResponse(username=current["username"], role=current["role"])
