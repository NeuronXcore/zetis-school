from app.core.config import settings
from app.modules.ai.ollama_provider import OllamaProvider
from app.modules.ai.provider import LLMProvider


def get_provider() -> LLMProvider:
    """Dépendance FastAPI : fournit le LLM configuré (un seul provider, pas de fallback)."""
    if settings.llm_provider == "ollama":
        return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
    raise NotImplementedError(
        f"LLM_PROVIDER '{settings.llm_provider}' non supporté (seul 'ollama' à cette étape)."
    )
