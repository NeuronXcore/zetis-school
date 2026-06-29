from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration du backend ZETIS (surchargée via .env ou variables d'env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ZETIS_", extra="ignore")

    app_name: str = "zetis-backend"
    version: str = "0.1.0"

    # --- Base de données (Étape 9) ---
    database_url: str = "postgresql+psycopg://zetis:zetis_dev_password@localhost:5432/zetis"

    # --- IA (Étape 10) : provider LLM unique (ollama). Variables sans préfixe ZETIS_. ---
    llm_provider: str = Field(default="ollama", validation_alias="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="qwen2.5:32b", validation_alias="OLLAMA_MODEL")
    # Origines autorisées par CORS — frontends Massimo (5173) et Papa (5174) en local.
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    # --- Auth (Étape 6) : JWT de développement + identifiants locaux ---
    # Les mots de passe en clair ne servent qu'au prototype local. Les vrais
    # utilisateurs (hashés, en base) arrivent à l'Étape 9.
    secret_key: str = "dev-secret-change-me-in-production-please-32b"
    access_token_expire_minutes: int = 720  # 12 h
    papa_username: str = "papa"
    papa_password: str = "papa1234"
    massimo_username: str = "massimo"
    massimo_password: str = "massimo1234"

    @property
    def dev_users(self) -> dict[str, dict[str, str]]:
        """Annuaire des utilisateurs de développement : username -> {password, role}."""
        return {
            self.papa_username: {"password": self.papa_password, "role": "papa"},
            self.massimo_username: {"password": self.massimo_password, "role": "massimo"},
        }


settings = Settings()
