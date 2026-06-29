from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration du backend ZETIS (surchargée via .env ou variables d'env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ZETIS_", extra="ignore")

    app_name: str = "zetis-backend"
    version: str = "0.1.0"
    # Origines autorisées par CORS — frontends Massimo (5173) et Papa (5174) en local.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]


settings = Settings()
