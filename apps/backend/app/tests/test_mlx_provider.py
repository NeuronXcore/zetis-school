"""Tests unitaires du MLXProvider (ADR-0008).

On mocke `httpx.post` : aucun serveur `mlx_lm.server` requis. On vérifie le
contrat OpenAI-compatible (messages, response_format) et le parsing de la réponse.
"""

import json

import app.modules.ai.mlx_provider as mlx_mod
from app.core.config import settings
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.mlx_provider import MLXProvider
from app.modules.ai.ollama_provider import OllamaEmbeddingProvider
from app.modules.ai.provider import LLMRequest


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def _patch_post(monkeypatch, capture: dict):
    """Capture le body envoyé et renvoie une réponse OpenAI-compatible figée."""

    def fake_post(url, json=None, timeout=None):  # noqa: A002 - signature httpx
        capture["url"] = url
        capture["json"] = json
        return _FakeResponse(
            {"choices": [{"message": {"role": "assistant", "content": '{"ok": true}'}}]}
        )

    monkeypatch.setattr(mlx_mod.httpx, "post", fake_post)


def test_generate_builds_openai_messages_and_parses_content(monkeypatch) -> None:
    capture: dict = {}
    _patch_post(monkeypatch, capture)

    provider = MLXProvider(base_url="http://localhost:8080/", model="test-model")
    resp = provider.generate(LLMRequest(prompt="Bonjour", system="Sois bref", json_output=False))

    assert capture["url"] == "http://localhost:8080/v1/chat/completions"
    body = capture["json"]
    assert body["model"] == "test-model"
    assert body["messages"] == [
        {"role": "system", "content": "Sois bref"},
        {"role": "user", "content": "Bonjour"},
    ]
    # Garde-fou capsule : max_tokens relevé au-delà du défaut 512 de mlx_lm.server.
    assert body["max_tokens"] >= 2048
    # json_output=False, fmt=None → pas de contrainte de format.
    assert "response_format" not in body
    assert resp.text == '{"ok": true}'
    assert resp.model == "test-model"
    assert resp.duration_ms >= 0


def test_json_output_maps_to_json_object(monkeypatch) -> None:
    capture: dict = {}
    _patch_post(monkeypatch, capture)

    MLXProvider(base_url="http://localhost:8080", model="m").generate(
        LLMRequest(prompt="p", json_output=True)
    )
    assert capture["json"]["response_format"] == {"type": "json_object"}


def test_schema_fmt_maps_to_json_schema(monkeypatch) -> None:
    capture: dict = {}
    _patch_post(monkeypatch, capture)

    schema = {"type": "object", "properties": {"x": {"type": "integer"}}}
    MLXProvider(base_url="http://localhost:8080", model="m").generate(
        LLMRequest(prompt="p", fmt=schema)
    )
    rf = capture["json"]["response_format"]
    assert rf["type"] == "json_schema"
    assert rf["json_schema"]["schema"] == schema


def test_get_provider_returns_mlx_when_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_provider", "mlx")
    assert isinstance(get_provider(), MLXProvider)


def test_embedder_stays_ollama_when_generation_is_mlx(monkeypatch) -> None:
    # Découplage ADR-0008 : génération MLX mais embeddings toujours ollama.
    monkeypatch.setattr(settings, "llm_provider", "mlx")
    monkeypatch.setattr(settings, "embed_provider", "ollama")
    embedder = get_embedder()
    assert isinstance(embedder, OllamaEmbeddingProvider)
    assert embedder.dim == settings.embed_dim


def test_fake_capsule_json_is_valid_reference() -> None:
    # Garde-fou : le JSON figé du mock reste parseable (utile pour le bench MLX).
    assert json.loads('{"ok": true}') == {"ok": True}
