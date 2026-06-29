from fastapi import APIRouter, Depends, HTTPException, status

from app.modules.auth.deps import get_current_user
from app.modules.auth.schemas import LoginRequest, MeResponse, TokenResponse
from app.modules.auth.service import authenticate, create_access_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest) -> TokenResponse:
    user = authenticate(payload.username, payload.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants invalides",
        )
    token = create_access_token(user["username"], user["role"])
    return TokenResponse(access_token=token, role=user["role"], username=user["username"])


@router.get("/me", response_model=MeResponse)
def me(current: dict[str, str] = Depends(get_current_user)) -> MeResponse:
    return MeResponse(username=current["username"], role=current["role"])
