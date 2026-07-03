"""Résolution du provider LLM des tâches `curriculum_*` (ADR-0009, addendum).

Dérogation cloud étroite (issue (b) du bench T4) : `CURRICULUM_LLM_PROVIDER=anthropic`
par défaut. Sans clé API : erreur explicite qui propose le repli local assumé
(`CURRICULUM_LLM_PROVIDER=ollama`) — JAMAIS de bascule silencieuse (condition 4).
Les autres modules gardent `get_provider()` (100 % local, ADR-0008 inchangé).
"""

from fastapi import HTTPException, status

from app.core.config import settings
from app.modules.ai.anthropic_provider import AnthropicProvider
from app.modules.ai.mlx_provider import MLXProvider
from app.modules.ai.ollama_provider import OllamaProvider
from app.modules.ai.provider import LLMProvider


def get_curriculum_provider() -> LLMProvider:
    """Dépendance FastAPI : LLM des tâches `curriculum_*` uniquement."""
    provider = settings.curriculum_llm_provider
    if provider == "anthropic":
        if not settings.anthropic_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Génération de référentiel indisponible : ANTHROPIC_API_KEY absente. "
                    "La génération du programme est routée vers Anthropic "
                    f"({settings.anthropic_model}, ADR-0009). Renseigne la clé dans `.env`, "
                    "ou choisis explicitement le repli local avec "
                    "CURRICULUM_LLM_PROVIDER=ollama (qualité moindre documentée par le "
                    "bench T4). Aucune bascule silencieuse n'est faite."
                ),
            )
        return AnthropicProvider(
            base_url=settings.anthropic_base_url,
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
        )
    if provider == "ollama":
        return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
    if provider == "mlx":
        return MLXProvider(base_url=settings.mlx_base_url, model=settings.mlx_model)
    raise NotImplementedError(
        f"CURRICULUM_LLM_PROVIDER '{provider}' non supporté "
        "(attendu 'anthropic', 'ollama' ou 'mlx')."
    )
