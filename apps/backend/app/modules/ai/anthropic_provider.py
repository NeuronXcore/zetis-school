"""Provider Anthropic (Messages API) — dérogation étroite `curriculum_*` (ADR-0009).

HTTP pur via httpx, comme `OllamaProvider`/`MLXProvider` : aucun SDK. Leçons du bench T4
(`scripts/bench_llm.py`, `call_anthropic`) :
- `temperature` est déprécié sur les modèles Claude récents (Sonnet 5) → jamais envoyé ;
- le raisonnement étendu renvoie des blocs `thinking` → on ne concatène que les blocs `text` ;
- malgré la consigne, le JSON peut arriver clôturé par des balises ``` → `_unfence`.

Pas de mode JSON natif côté API : quand `fmt` est un JSON Schema, la conformité est forcée
par consigne système (schéma inclus) et garantie en dur par la validation Pydantic du service.
"""

import json
import time

import httpx

from app.modules.ai.provider import LLMRequest, LLMResponse

ANTHROPIC_VERSION = "2023-06-01"

_JSON_ONLY_INSTRUCTION = (
    "\n\nRÈGLE DE SORTIE (impératif) : réponds UNIQUEMENT par un objet JSON valide, "
    "sans aucun texte avant ou après, sans balises ```."
)


def _unfence(text: str) -> str:
    """Retire un éventuel bloc markdown ```json … ``` autour du JSON (pattern du bench)."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


class AnthropicProvider:
    """Implémentation `LLMProvider` cloud Anthropic. Réservée aux tâches `curriculum_*`."""

    def __init__(
        self,
        base_url: str,
        model: str,
        api_key: str,
        timeout: float = 120.0,
        max_tokens: int = 8192,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.api_key = api_key
        self.timeout = timeout
        # Un référentiel peut atteindre 25 chapitres décrits : plafond large.
        self.max_tokens = max_tokens

    def generate(self, request: LLMRequest) -> LLMResponse:
        system = request.system or ""
        # Mapping `fmt` : un JSON Schema explicite est injecté en consigne système ;
        # la garantie dure reste la validation Pydantic côté service (ADR-0007/0009).
        if isinstance(request.fmt, dict):
            system += (
                _JSON_ONLY_INSTRUCTION
                + " L'objet doit être strictement conforme à ce JSON Schema :\n"
                + json.dumps(request.fmt, ensure_ascii=False)
            )
        elif request.fmt == "json" or (request.fmt is None and request.json_output):
            system += _JSON_ONLY_INSTRUCTION

        # NB : pas de `temperature` (déprécié sur Sonnet 5 → 400 sinon).
        payload: dict = {
            "model": self.model,
            "max_tokens": self.max_tokens,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        if system:
            payload["system"] = system
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        }

        start = time.monotonic()
        response = httpx.post(
            f"{self.base_url}/v1/messages", json=payload, headers=headers, timeout=self.timeout
        )
        response.raise_for_status()
        data = response.json()
        duration_ms = int((time.monotonic() - start) * 1000)
        # Blocs `thinking` possibles en tête : seuls les blocs `text` portent la réponse.
        parts = data.get("content", [])
        text = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
        return LLMResponse(text=_unfence(text), model=self.model, duration_ms=duration_ms)
