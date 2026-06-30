from app.core.config import settings
from app.modules.ai.ollama_provider import OllamaEmbeddingProvider, OllamaProvider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider


def get_provider() -> LLMProvider:
    """Dépendance FastAPI : fournit le LLM configuré (un seul provider, pas de fallback)."""
    if settings.llm_provider == "ollama":
        return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
    raise NotImplementedError(
        f"LLM_PROVIDER '{settings.llm_provider}' non supporté (seul 'ollama' à cette étape)."
    )


def get_embedder() -> EmbeddingProvider:
    """Dépendance FastAPI : fournit le provider d'embeddings RAG (ollama local)."""
    if settings.llm_provider == "ollama":
        return OllamaEmbeddingProvider(
            base_url=settings.ollama_base_url,
            model=settings.ollama_embed_model,
            dim=settings.embed_dim,
        )
    raise NotImplementedError(
        f"LLM_PROVIDER '{settings.llm_provider}' non supporté pour les embeddings."
    )
