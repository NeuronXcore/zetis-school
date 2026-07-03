from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration du backend ZETIS (surchargée via .env ou variables d'env)."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="ZETIS_", extra="ignore")

    app_name: str = "zetis-backend"
    version: str = "0.1.0"

    # --- Base de données (Étape 9) ---
    database_url: str = "postgresql+psycopg://zetis:zetis_dev_password@localhost:5432/zetis"

    # --- IA (Étape 10) : provider LLM de génération. Variables sans préfixe ZETIS_. ---
    # 'ollama' (défaut) ou 'mlx' (mlx_lm.server, Apple Silicon). Cf. ADR-0008.
    llm_provider: str = Field(default="ollama", validation_alias="LLM_PROVIDER")
    ollama_base_url: str = Field(default="http://localhost:11434", validation_alias="OLLAMA_BASE_URL")
    # Modèle de génération retenu (ADR-0008 phase 2) : MoE Qwen3 — qualité ≈ 72b à la vitesse
    # la plus rapide (~5 s ELI5). `OllamaProvider` passe automatiquement `think:false` pour qwen3.
    ollama_model: str = Field(default="qwen3.6:35b-a3b", validation_alias="OLLAMA_MODEL")
    # --- MLX (ADR-0008) : serveur d'inférence local OpenAI-compatible (mlx_lm.server). ---
    # Le backend n'importe pas `mlx` : il parle en HTTP, comme pour ollama.
    mlx_base_url: str = Field(default="http://localhost:8080", validation_alias="MLX_BASE_URL")
    mlx_model: str = Field(default="mlx-community/Qwen2.5-32B-Instruct-4bit", validation_alias="MLX_MODEL")
    # --- RAG (Étape 11) : embeddings locaux + récupération sémantique pgvector ---
    # Découplé de `llm_provider` : les embeddings restent sur ollama même si la
    # génération passe sur MLX (évite toute migration pgvector). Cf. ADR-0008.
    embed_provider: str = Field(default="ollama", validation_alias="EMBED_PROVIDER")
    ollama_embed_model: str = Field(
        default="nomic-embed-text", validation_alias="OLLAMA_EMBED_MODEL"
    )
    embed_dim: int = Field(default=768, validation_alias="EMBED_DIM")
    rag_top_k: int = Field(default=3, validation_alias="RAG_TOP_K")

    # --- TTS (voix des capsules) : Piper local. Le binaire `piper` doit être sur le PATH
    # et `piper_voice_model` pointer un modèle FR (.onnx). Cf. ADR-0007 (narration). ---
    tts_provider: str = Field(default="piper", validation_alias="TTS_PROVIDER")
    # 'macos' : voix `say` (dev local Mac). Ex. "Jacques", "Amelie", ou une voix « Premium »
    # téléchargée dans Réglages Système (neurale, chaleureuse). `say_rate` = débit posé.
    say_voice: str = Field(default="Jacques", validation_alias="TTS_SAY_VOICE")
    say_rate: int = Field(default=165, validation_alias="TTS_SAY_RATE")
    piper_binary: str = Field(default="piper", validation_alias="PIPER_BINARY")
    piper_voice_model: str = Field(
        default="storage/models/piper/fr_FR-siwis-medium.onnx",
        validation_alias="PIPER_VOICE_MODEL",
    )
    # Piper : ralentit un peu la diction pour un ton plus rassurant (1.0 = normal).
    piper_length_scale: float = Field(default=1.1, validation_alias="PIPER_LENGTH_SCALE")
    # Index de locuteur pour un modèle Piper multi-voix (ex. upmc : pierre=1). None = mono-voix.
    piper_speaker: int | None = Field(default=None, validation_alias="PIPER_SPEAKER")
    audio_storage_dir: str = Field(
        default="storage/generated", validation_alias="AUDIO_STORAGE_DIR"
    )

    # --- Stockage objet des vidéos de capsule (Lot 2) : 'disk' (fallback dev) | 'minio'. ---
    # L'audio reste sur disque ; seul le MP4 rendu passe par ce backend.
    storage_backend: str = Field(default="disk", validation_alias="STORAGE_BACKEND")
    minio_endpoint: str = Field(default="localhost:9000", validation_alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(default="zetis_minio", validation_alias="MINIO_ROOT_USER")
    minio_secret_key: str = Field(
        default="zetis_minio_password", validation_alias="MINIO_ROOT_PASSWORD"
    )
    minio_secure: bool = Field(default=False, validation_alias="MINIO_SECURE")
    minio_bucket_capsules: str = Field(
        default="capsules", validation_alias="MINIO_BUCKET_CAPSULES"
    )

    # --- File de rendu asynchrone des capsules (Lot 2) : RQ sur Redis, hors backend. ---
    redis_url: str = Field(default="redis://localhost:6379/0", validation_alias="REDIS_URL")
    render_queue: str = Field(default="media", validation_alias="RENDER_QUEUE")

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
