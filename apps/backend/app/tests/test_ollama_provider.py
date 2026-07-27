"""Tests unitaires du OllamaProvider — en particulier le garde-fou `think:false` (ADR-0008).

On mocke `httpx.post` : aucun serveur ollama requis.
"""

import app.modules.ai.ollama_provider as ollama_mod
from app.modules.ai.ollama_provider import OllamaProvider
from app.modules.ai.provider import LLMRequest


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def _patch_post(monkeypatch, capture: dict):
    def fake_post(url, json=None, timeout=None):  # noqa: A002 - signature httpx
        capture["url"] = url
        capture["json"] = json
        return _FakeResponse({"response": '{"ok": true}', "model": json.get("model")})

    monkeypatch.setattr(ollama_mod.httpx, "post", fake_post)


def test_qwen3_model_disables_thinking(monkeypatch) -> None:
    # Sans think:false, un modèle Qwen3 renvoie le JSON dans `thinking` (response vide).
    capture: dict = {}
    _patch_post(monkeypatch, capture)
    OllamaProvider(base_url="http://x:11434", model="qwen3.6:35b-a3b").generate(
        LLMRequest(prompt="p", json_output=True)
    )
    assert capture["json"]["think"] is False


def test_non_qwen3_model_keeps_thinking_absent(monkeypatch) -> None:
    # Les modèles sans « thinking » (qwen2.5, llama3.3…) ne reçoivent pas le champ.
    capture: dict = {}
    _patch_post(monkeypatch, capture)
    OllamaProvider(base_url="http://x:11434", model="qwen2.5:32b").generate(
        LLMRequest(prompt="p", json_output=True)
    )
    assert "think" not in capture["json"]


def test_fmt_schema_takes_precedence_over_json(monkeypatch) -> None:
    capture: dict = {}
    _patch_post(monkeypatch, capture)
    schema = {"type": "object"}
    OllamaProvider(base_url="http://x:11434", model="qwen3.6:35b-a3b").generate(
        LLMRequest(prompt="p", fmt=schema)
    )
    assert capture["json"]["format"] == schema
    assert capture["json"]["think"] is False
