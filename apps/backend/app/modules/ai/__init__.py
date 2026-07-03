from app.core.config import settings
from app.modules.ai.mlx_provider import MLXProvider
from app.modules.ai.ollama_provider import OllamaEmbeddingProvider, OllamaProvider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider


def get_provider() -> LLMProvider:
    """Dépendance FastAPI : fournit le LLM de génération configuré (pas de fallback)."""
    if settings.llm_provider == "ollama":
        return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
    if settings.llm_provider == "mlx":
        return MLXProvider(base_url=settings.mlx_base_url, model=settings.mlx_model)
    raise NotImplementedError(
        f"LLM_PROVIDER '{settings.llm_provider}' non supporté (attendu 'ollama' ou 'mlx')."
    )


def get_embedder() -> EmbeddingProvider:
    """Dépendance FastAPI : fournit le provider d'embeddings RAG.

    Découplé de `llm_provider` (cf. ADR-0008) : reste sur ollama même quand la
    génération passe sur MLX, pour ne pas migrer la dimension pgvector.
    """
    if settings.embed_provider == "ollama":
        return OllamaEmbeddingProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_embed_model,
            dim=settings.embed_dim,
        )
    raise NotImplementedError(
        f"EMBED_PROVIDER '{settings.embed_provider}' non supporté (seul 'ollama' à cette étape)."
    )
