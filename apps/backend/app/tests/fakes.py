import io
import json
import wave

from app.modules.ai.provider import LLMRequest, LLMResponse
from app.modules.tts.provider import TtsRequest, TtsResponse


class FakeEmbeddingProvider:
    """Embedder déterministe pour les tests (aucun appel ollama)."""

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Vecteur reproductible dérivé du texte (suffisant pour vérifier l'ingestion).
        return [[float(((hash(t) + i) % 1000) / 1000.0) for i in range(self.dim)] for t in texts]


class FakeTtsProvider:
    """TTS déterministe pour les tests : renvoie un WAV de silence dont la durée dépend de
    la longueur du texte (≈ 15 caractères/seconde). Aucun appel à Piper."""

    def __init__(self, rate: int = 22050) -> None:
        self.rate = rate

    def synthesize(self, request: TtsRequest) -> TtsResponse:
        seconds = max(1.0, len(request.text) / 15.0)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(self.rate)
            w.writeframes(b"\x00\x00" * int(seconds * self.rate))  # silence
        return TtsResponse(audio_wav=buf.getvalue(), duration_seconds=seconds)


# CapsuleSpec déterministe valide (cf. schemas.CapsuleSpec) renvoyé pour toute demande de
# capsule (repérée par la présence de `request.fmt` = sortie structurée). Sert aux tests
# offline sans ollama.
_DEFAULT_CAPSULE = {
    "title": "Comprendre la notion",
    "subject": "Mathématiques",
    "skill": "Nombres relatifs",
    "level": "4e",
    "fps": 30,
    "width": 1280,
    "height": 720,
    "scenes": [
        {
            "kind": "title",
            "title": "Comprendre la notion",
            "subtitle": "En capsule courte",
            "narration": "Bienvenue dans cette petite capsule pour comprendre la notion.",
            "durationInFrames": 90,
        },
        {
            "kind": "definition",
            "term": "Notion",
            "body": "Une idée clé expliquée simplement.",
            "narration": "Voici l'idée clé, expliquée le plus simplement possible.",
            "durationInFrames": 120,
        },
        {
            "kind": "bullet",
            "heading": "À retenir",
            "points": ["Premier point", "Deuxième point"],
            "narration": "Retiens surtout ces deux points importants.",
            "durationInFrames": 120,
        },
        {
            "kind": "title",
            "title": "Bien joué !",
            "subtitle": "Prochaine étape bientôt",
            "narration": "Bien joué ! On se retrouve très vite pour la suite.",
            "durationInFrames": 75,
        },
    ],
}


class FakeLLMProvider:
    """Provider IA déterministe pour les tests (aucun appel ollama)."""

    def __init__(
        self,
        feedback: str = "Bien joué, tu progresses ! Prochaine étape : un petit quiz.",
        score: int = 80,
        capsule_spec: dict | None = None,
    ) -> None:
        self._feedback = feedback
        self._score = score
        self._capsule_spec = capsule_spec

    def generate(self, request: LLMRequest) -> LLMResponse:
        # Sortie structurée demandée (fmt) → on renvoie un CapsuleSpec valide déterministe.
        # `fmt` est ignoré au-delà de ce branchement (le fake ne parle pas à ollama).
        if request.fmt is not None:
            spec = self._capsule_spec or _DEFAULT_CAPSULE
            return LLMResponse(text=json.dumps(spec), model="fake", duration_ms=1)
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
