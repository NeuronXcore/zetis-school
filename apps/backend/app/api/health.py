from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.core.config import settings
from app.db.base import engine

router = APIRouter()


@router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Healthcheck — utilisé par les frontends et le monitoring (cf. DEPLOYMENT.md)."""
    return {"status": "ok", "service": settings.app_name}


@router.get("/health/db", tags=["system"])
def health_db() -> dict[str, str]:
    """Vérifie la connexion à PostgreSQL (Étape 9)."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Base de données injoignable : {exc}",
        ) from exc
    return {"status": "ok", "database": "reachable"}


@router.get("/api/version", tags=["system"])
def version() -> dict[str, str]:
    return {"name": settings.app_name, "version": settings.version}
