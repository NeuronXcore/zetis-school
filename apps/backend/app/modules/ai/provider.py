from dataclasses import dataclass
from typing import Protocol


@dataclass
class LLMRequest:
    prompt: str
    system: str | None = None
    json_output: bool = True
    temperature: float = 0.2


@dataclass
class LLMResponse:
    text: str
    model: str
    duration_ms: int


class LLMProvider(Protocol):
    """Abstraction LLM imposée par TECH_STACK.md (un seul provider à cette étape)."""

    def generate(self, request: LLMRequest) -> LLMResponse:
        ...
