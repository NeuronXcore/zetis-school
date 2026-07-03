import time

import httpx

from app.modules.ai.provider import LLMRequest, LLMResponse


class MLXProvider:
    """Implémentation LLM locale via `mlx_lm.server` (Apple Silicon, ADR-0008).

    Le backend ne dépend d'aucun paquet `mlx` : il parle en HTTP à l'API
    OpenAI-compatible du serveur MLX, exactement comme `OllamaProvider` avec
    ollama. Pas de routing, pas de fallback.
    """

    def __init__(
        self, base_url: str, model: str, timeout: float = 120.0, max_tokens: int = 4096
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        # `mlx_lm.server` plafonne par défaut à 512 tokens : insuffisant pour une capsule
        # (JSON ~600 tokens) → sortie tronquée et invalide. On relève ce plafond.
        self.max_tokens = max_tokens

    def generate(self, request: LLMRequest) -> LLMResponse:
        messages: list[dict] = []
        if request.system:
            messages.append({"role": "system", "content": request.system})
        messages.append({"role": "user", "content": request.prompt})

        payload: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": request.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }

        # Sortie structurée. Ollama utilise `format` (cf. LLMRequest.fmt) ; l'API
        # OpenAI de mlx_lm.server attend `response_format`. Un JSON Schema explicite
        # (dict) prime sur le simple mode JSON déduit de json_output.
        if isinstance(request.fmt, dict):
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {"name": "output", "schema": request.fmt},
            }
        elif request.fmt == "json" or (request.fmt is None and request.json_output):
            payload["response_format"] = {"type": "json_object"}

        start = time.monotonic()
        response = httpx.post(
            f"{self.base_url}/v1/chat/completions", json=payload, timeout=self.timeout
        )
        response.raise_for_status()
        data = response.json()
        duration_ms = int((time.monotonic() - start) * 1000)
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return LLMResponse(text=text, model=self.model, duration_ms=duration_ms)
