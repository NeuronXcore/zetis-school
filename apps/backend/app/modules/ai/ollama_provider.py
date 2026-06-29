import time

import httpx

from app.modules.ai.provider import LLMRequest, LLMResponse


class OllamaProvider:
    """Implémentation LLM locale via ollama (qwen2.5). Pas de routing, pas de fallback."""

    def __init__(self, base_url: str, model: str, timeout: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload: dict = {
            "model": self.model,
            "prompt": request.prompt,
            "stream": False,
            "options": {"temperature": request.temperature},
        }
        if request.system:
            payload["system"] = request.system
        if request.json_output:
            payload["format"] = "json"

        start = time.monotonic()
        response = httpx.post(f"{self.base_url}/api/generate", json=payload, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        duration_ms = int((time.monotonic() - start) * 1000)
        return LLMResponse(text=data.get("response", ""), model=self.model, duration_ms=duration_ms)
