from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

# Convention du monorepo : les clés API (secrets) vivent UNIQUEMENT dans le .env à la
# racine du projet ; apps/backend/.env ne porte que la config locale du backend.
# Chemins absolus (indépendants du cwd d'uvicorn) ; un fichier absent est ignoré.
_BACKEND_DIR = Path(__file__).resolve().parents[2]  # apps/backend
_REPO_ROOT = _BACKEND_DIR.parents[1]


class Settings(BaseSettings):
    """Configuration du backend ZETIS (surchargée via .env ou variables d'env)."""

    # Ordre = priorité croissante : le .env du backend surcharge celui de la racine ;
    # les vraies variables d'environnement priment sur les deux.
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT / ".env", _BACKEND_DIR / ".env"),
        env_prefix="ZETIS_",
        extra="ignore",
    )

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
    # --- Curriculum (ADR-0009, addendum) : dérogation cloud étroite pour `curriculum_*`. ---
    # Seules les tâches de génération de référentiel sont routées vers Anthropic (bench T4,
    # issue (b)) ; zéro donnée de Massimo dans ces prompts. Sans clé : erreur explicite,
    # jamais de bascule silencieuse. Repli local assumé : CURRICULUM_LLM_PROVIDER=ollama.
    curriculum_llm_provider: str = Field(
        default="anthropic", validation_alias="CURRICULUM_LLM_PROVIDER"
    )
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    anthropic_base_url: str = Field(
        default="https://api.anthropic.com", validation_alias="ANTHROPIC_BASE_URL"
    )
    anthropic_model: str = Field(default="claude-sonnet-5", validation_alias="ANTHROPIC_MODEL")

    # --- Missions (ADR-0017 lot 1) : récompense d'effort + seuils du verdict d'acquisition. ---
    # L'XP récompense l'EFFORT (crédité à la complétion, inconditionnel) : +50 (arbitrage 5bis,
    # valeur DATA_MODEL.md retenue). Le VERDICT (acquired vs review_later) est découplé : il
    # exige score reverse ET score quiz ≥ seuils. Seuils versionnés avec le scoring (Lot 2).
    mission_xp_reward: int = Field(default=50, validation_alias="MISSION_XP_REWARD")
    mission_reverse_threshold: int = Field(default=70, validation_alias="MISSION_REVERSE_THRESHOLD")
    mission_quiz_threshold: int = Field(default=70, validation_alias="MISSION_QUIZ_THRESHOLD")

    # --- Sélecteur de la mission du jour (ADR-0017 lot 2, décision 2) : scoring DÉTERMINISTE,
    # zéro LLM. La formule est VERSIONNÉE (`MISSION_SCORING_VERSION` couvre formule ET templates
    # d'étapes) : tout changement de facteur/pondération = bump, tracé dans la sortie du sélecteur.
    # Pondérations et seuils vivent ICI, jamais dans le code du service. ---
    mission_scoring_version: str = Field(default="v1", validation_alias="MISSION_SCORING_VERSION")
    mission_weight_severity: float = Field(default=1.0, validation_alias="MISSION_WEIGHT_SEVERITY")
    mission_weight_due_pressure: float = Field(
        default=0.8, validation_alias="MISSION_WEIGHT_DUE_PRESSURE"
    )
    mission_weight_continuity: float = Field(
        default=0.6, validation_alias="MISSION_WEIGHT_CONTINUITY"
    )
    # `variety` est un MALUS (soustrait) : anti-répétition si la même matière a été élue la veille
    # (proxy déterministe : matière de la dernière mission complétée — l'ADR interdit de stocker
    # les élections).
    mission_weight_variety: float = Field(default=0.5, validation_alias="MISSION_WEIGHT_VARIETY")
    # Plancher des missions `manual` (priorité forcée Papa) : domine le score sans jamais être
    # dominé (une mission « avant le contrôle » court-circuite le score, jamais l'inverse).
    mission_weight_forced_priority: float = Field(
        default=100.0, validation_alias="MISSION_WEIGHT_FORCED_PRIORITY"
    )
    # Nombre de cartes dues qui sature `due_pressure` à 1.0.
    mission_due_pressure_cap: int = Field(default=6, validation_alias="MISSION_DUE_PRESSURE_CAP")

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

    # --- STT (dictée ELI5, ADR-0012) : Whisper LOCAL via faster-whisper. 100 % local,
    # aucun tiers (vie privée de Massimo). Dépendance optionnelle `[stt]` : sans elle,
    # l'endpoint /transcribe répond 503 et le frontend masque le micro. ---
    stt_provider: str = Field(default="faster-whisper", validation_alias="STT_PROVIDER")
    # 'small' = rapide sur CPU/Apple Silicon (défaut), déjà bon en français. Pour plus de
    # précision (plus lent) : 'medium' (bon compromis) ou 'large-v3' (max, ~3 Go).
    whisper_model: str = Field(default="small", validation_alias="WHISPER_MODEL")
    whisper_device: str = Field(default="cpu", validation_alias="WHISPER_DEVICE")
    # int8 = rapide/léger. Pour grappiller un peu de précision : 'int8_float16' ou 'float32'
    # (plus lent, plus de RAM). Le levier dominant reste la taille du modèle ci-dessus.
    whisper_compute_type: str = Field(
        default="int8", validation_alias="WHISPER_COMPUTE_TYPE"
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
