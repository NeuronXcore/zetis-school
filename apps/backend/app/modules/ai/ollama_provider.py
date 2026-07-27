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
        # Modèles Qwen3 « thinking » : sans `think:false`, la sortie JSON part dans le champ
        # `thinking` et `response` revient vide → contenu invalide. Cf. ADR-0008 (addendum).
        if "qwen3" in self.model.lower():
            payload["think"] = False
        if request.system:
            payload["system"] = request.system
        # Sortie structurée : un JSON Schema (ou "json") explicite prime sur le simple
        # `format:"json"` déduit de json_output (cf. ADR-0007, addendum `fmt`).
        if request.fmt is not None:
            payload["format"] = request.fmt
        elif request.json_output:
            payload["format"] = "json"

        start = time.monotonic()
        response = httpx.post(f"{self.base_url}/api/generate", json=payload, timeout=self.timeout)
        response.raise_for_status()
        data = response.json()
        duration_ms = int((time.monotonic() - start) * 1000)
        return LLMResponse(text=data.get("response", ""), model=self.model, duration_ms=duration_ms)


class OllamaEmbeddingProvider:
    """Embeddings locaux via ollama (nomic-embed-text → 768 dims). Pas de fallback."""

    def __init__(self, base_url: str, model: str, dim: int, timeout: float = 60.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.dim = dim
        self.timeout = timeout

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        response = httpx.post(
            f"{self.base_url}/api/embed",
            json={"model": self.model, "input": texts},
            timeout=self.timeout,
        )
        response.raise_for_status()
        embeddings = response.json().get("embeddings", [])
        if len(embeddings) != len(texts):
            raise ValueError("Réponse d'embeddings ollama incohérente (taille ≠ entrée).")
        return embeddings
