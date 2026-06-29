import json

from app.modules.ai.provider import LLMRequest, LLMResponse


class FakeLLMProvider:
    """Provider IA déterministe pour les tests (aucun appel ollama)."""

    def __init__(
        self,
        feedback: str = "Bien joué, tu progresses ! Prochaine étape : un petit quiz.",
        score: int = 80,
    ) -> None:
        self._feedback = feedback
        self._score = score

    def generate(self, request: LLMRequest) -> LLMResponse:
        payload = {
            # clés explain
            "title": "Comprendre la notion",
            "simple_explanation": "Une explication simple.",
            "analogy": "Une analogie du quotidien.",
            "example": "Un exemple concret.",
            "common_mistake": "L'erreur fréquente à éviter.",
            "check_question": "Peux-tu reformuler avec tes mots ?",
            "next_action": "reverse_explain",
            # clés reverse
            "score": self._score,
            "feedback": self._feedback,
            "missing_points": ["Pense aussi à zéro"],
        }
        return LLMResponse(text=json.dumps(payload), model="fake", duration_ms=1)
