"""Tests offline de `AnthropicProvider` (httpx.post monkeypatché, aucun appel réseau).

Vérifie les leçons du bench T4 (ADR-0009 addendum) : pas de `temperature`, consigne
JSON + schéma en system quand `fmt` est un dict, extraction des seuls blocs `text`
(les blocs `thinking` sont ignorés), retrait des balises ``` éventuelles.
"""

import httpx

from app.modules.ai.anthropic_provider import ANTHROPIC_VERSION, AnthropicProvider
from app.modules.ai.provider import LLMRequest


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:  # jamais d'erreur dans ces tests
        return None

    def json(self) -> dict:
        return self._payload


def _patch_post(monkeypatch, captured: dict, content: list[dict]) -> None:
    def fake_post(url, json=None, headers=None, timeout=None):  # noqa: A002 — signature httpx
        captured["url"] = url
        captured["payload"] = json
        captured["headers"] = headers
        return _FakeResponse({"content": content, "usage": {"output_tokens": 42}})

    monkeypatch.setattr(httpx, "post", fake_post)


def test_generate_builds_messages_without_temperature(monkeypatch) -> None:
    captured: dict = {}
    _patch_post(monkeypatch, captured, [{"type": "text", "text": '{"ok": true}'}])
    provider = AnthropicProvider(
        base_url="https://api.anthropic.com", model="claude-sonnet-5", api_key="sk-ant-test"
    )
    res = provider.generate(LLMRequest(prompt="Question", system="Rôle système"))

    assert captured["url"] == "https://api.anthropic.com/v1/messages"
    payload = captured["payload"]
    assert "temperature" not in payload  # déprécié sur Sonnet 5 (400 sinon)
    assert payload["model"] == "claude-sonnet-5"
    assert payload["messages"] == [{"role": "user", "content": "Question"}]
    assert payload["system"].startswith("Rôle système")
    assert captured["headers"]["x-api-key"] == "sk-ant-test"
    assert captured["headers"]["anthropic-version"] == ANTHROPIC_VERSION
    assert res.text == '{"ok": true}'
    assert res.model == "claude-sonnet-5"


def test_fmt_schema_injected_in_system(monkeypatch) -> None:
    captured: dict = {}
    _patch_post(monkeypatch, captured, [{"type": "text", "text": "{}"}])
    provider = AnthropicProvider(base_url="https://x", model="m", api_key="k")
    schema = {"type": "object", "properties": {"chapters": {"type": "array"}}}
    provider.generate(LLMRequest(prompt="p", system="s", fmt=schema))

    system = captured["payload"]["system"]
    assert "JSON Schema" in system
    assert '"chapters"' in system
    assert "UNIQUEMENT" in system


def test_only_text_blocks_are_extracted_and_unfenced(monkeypatch) -> None:
    captured: dict = {}
    _patch_post(
        monkeypatch,
        captured,
        [
            {"type": "thinking", "thinking": "réflexion interne à ignorer"},
            {"type": "text", "text": '```json\n{"a": 1}\n```'},
        ],
    )
    provider = AnthropicProvider(base_url="https://x", model="m", api_key="k")
    res = provider.generate(LLMRequest(prompt="p"))
    assert res.text == '{"a": 1}'
    assert "réflexion" not in res.text
