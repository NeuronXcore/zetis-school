from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health", tags=["system"])
def health() -> dict[str, str]:
    """Healthcheck — utilisé par les frontends et le monitoring (cf. DEPLOYMENT.md)."""
    return {"status": "ok", "service": settings.app_name}


@router.get("/api/version", tags=["system"])
def version() -> dict[str, str]:
    return {"name": settings.app_name, "version": settings.version}
