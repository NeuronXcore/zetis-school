import json

from app.modules.ai.provider import LLMRequest, LLMResponse


class FakeEmbeddingProvider:
    """Embedder déterministe pour les tests (aucun appel ollama)."""

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Vecteur reproductible dérivé du texte (suffisant pour vérifier l'ingestion).
        return [[float(((hash(t) + i) % 1000) / 1000.0) for i in range(self.dim)] for t in texts]


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
            # clés diagnostic (génération QCM) — déterministe : index 0 correct
            "questions": [
                {
                    "prompt": "Question de diagnostic ?",
                    "choices": ["Bonne réponse", "Mauvaise A", "Mauvaise B", "Mauvaise C"],
                    "correct_index": 0,
                    "explanation": "Parce que c'est la bonne.",
                },
                {
                    "prompt": "Autre question ?",
                    "choices": ["Vrai", "Faux"],
                    "correct_index": 0,
                    "explanation": "Explication courte.",
                },
            ],
        }
        return LLMResponse(text=json.dumps(payload), model="fake", duration_ms=1)
