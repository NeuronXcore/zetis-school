from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import settings
from app.modules.ai.router import router as ai_router
from app.modules.auth.router import router as auth_router
from app.modules.eli5.router import router as eli5_router
from app.modules.memory.router import router as memory_router

app = FastAPI(title="ZETIS Backend", version=settings.version)

# CORS temporaire pour les frontends locaux Massimo + Papa (Étape 4/5).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(eli5_router)
app.include_router(memory_router)
app.include_router(ai_router)
