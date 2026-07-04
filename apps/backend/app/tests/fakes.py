import io
import json
import wave

from app.modules.ai.provider import LLMRequest, LLMResponse
from app.modules.stt.provider import SttRequest, SttResponse
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


class FakeSttProvider:
    """STT déterministe pour les tests : renvoie une transcription fixe (aucun Whisper)."""

    def __init__(self, text: str = "Un nombre relatif est un nombre avec un signe.") -> None:
        self._text = text

    def transcribe(self, request: SttRequest) -> SttResponse:
        # La durée dépend de la taille de l'audio (reproductible), sans décoder quoi que ce soit.
        return SttResponse(text=self._text, duration_seconds=max(1.0, len(request.audio) / 32000.0))


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


# GeneratedLessons déterministe valide (cf. curriculum/schemas.py) renvoyé quand le
# schéma `fmt` est celui de la passe 2 (repéré par sa propriété `lessons`). La notion
# « Nombres relatifs » correspond EXACTEMENT à la Skill seedée par conftest : les tests
# de dédup vérifient sa réutilisation (aucun doublon créé).
_DEFAULT_LESSONS = {
    "lessons": [
        {
            "title": "Additionner et soustraire des nombres relatifs",
            "summary": "Règle des signes pour l'addition et la soustraction de relatifs.",
            "notions": ["Nombres relatifs", "Règle des signes"],
        },
        {
            "title": "Multiplier et diviser des nombres relatifs",
            "summary": "Règle des signes pour le produit et le quotient.",
            "notions": ["Règle des signes"],
        },
        {
            "title": "Repérage sur une droite graduée",
            "summary": "Abscisse d'un point et comparaison de nombres relatifs.",
            "notions": ["Repérage sur une droite graduée"],
        },
    ]
}


# GeneratedChapters déterministe valide (cf. curriculum/schemas.py) renvoyé quand le
# schéma `fmt` est celui du curriculum (repéré par sa propriété `chapters`). 3 chapitres
# = borne basse du schéma de production (3-25).
_DEFAULT_CURRICULUM = {
    "subject": "Mathématiques",
    "cycle": "cycle 4",
    "program_version": "2020",
    "chapters": [
        {
            "title": "Nombres relatifs : opérations",
            "description": "Additionner, soustraire, multiplier et diviser des relatifs.",
            "themes": ["Nombres et calculs"],
            "suggested_class": "4e",
            "repartition": "officielle",
        },
        {
            "title": "Théorème de Pythagore",
            "description": "Calculer une longueur dans un triangle rectangle.",
            "themes": ["Espace et géométrie"],
            "suggested_class": "4e",
            "repartition": "officielle",
        },
        {
            "title": "Proportionnalité et pourcentages",
            "description": "Traiter des situations de proportionnalité.",
            "themes": ["Organisation et gestion de données, fonctions"],
            "suggested_class": "4e",
            "repartition": "officielle",
        },
    ],
}


# GeneratedLessonContent déterministe valide (≥ 300 caractères, structure imposée par
# le prompt lesson_content) renvoyé quand le schéma `fmt` a la propriété `content`.
_DEFAULT_LESSON_CONTENT = {
    "content": (
        "# Les nombres relatifs\n\n"
        "Un nombre relatif, c'est un nombre avec un signe : + ou -. Imagine un "
        "thermomètre : au-dessus de zéro il fait +5 °C, en dessous il fait -3 °C.\n\n"
        "Par exemple, si tu descends de 2 étages depuis le rez-de-chaussée, tu es à "
        "l'étage -2.\n\n"
        "## Méthode\n\n1. Repère le signe de chaque nombre.\n2. Place-les sur une "
        "droite graduée.\n3. Compare leur position : plus à droite = plus grand.\n\n"
        "## Mini-exercices\n\n1. Compare -3 et 2. Solution : 2 > -3, car 2 est à "
        "droite de -3.\n2. Range -1, 4 et -5. Solution : -5 < -1 < 4.\n\n"
        "## Ce qu'il faut retenir\n\n- Un relatif a un signe.\n- La droite graduée "
        "aide à comparer.\n- Plus à droite = plus grand."
    )
}


# Cartes SRS déterministes (cf. prompts/srs_cards.py, ADR-0013) renvoyées quand le schéma
# `fmt` a la propriété `cards`. Deux types distincts (definition + method) pour vérifier la
# borne 1-3, la variété et la clé métier `(student, skill, card_type)`.
_DEFAULT_SRS_CARDS = {
    "cards": [
        {
            "card_type": "definition",
            "front_markdown": "Qu'est-ce qu'un nombre relatif ?",
            "back_markdown": "Un nombre avec un signe : + ou -.",
        },
        {
            "card_type": "method",
            "front_markdown": "Comment comparer deux nombres relatifs ?",
            "back_markdown": "Sur la droite graduée, le plus à droite est le plus grand.",
        },
    ]
}


class FakeLLMProvider:
    """Provider IA déterministe pour les tests (aucun appel ollama)."""

    def __init__(
        self,
        feedback: str = "Bien joué, tu progresses ! Prochaine étape : un petit quiz.",
        score: int = 80,
        capsule_spec: dict | None = None,
        curriculum_chapters: dict | None = None,
        curriculum_lessons: dict | None = None,
        lesson_content: dict | None = None,
        srs_cards: dict | None = None,
    ) -> None:
        self._feedback = feedback
        self._score = score
        self._capsule_spec = capsule_spec
        self._curriculum_chapters = curriculum_chapters
        self._curriculum_lessons = curriculum_lessons
        self._lesson_content = lesson_content
        self._srs_cards = srs_cards

    def generate(self, request: LLMRequest) -> LLMResponse:
        # Sortie structurée demandée (fmt) → objet déterministe selon le schéma :
        # curriculum passe 1 (propriété `chapters`), passe 2 (`lessons`), rédaction de
        # cours (`content`) ou CapsuleSpec (fallback — garder cette branche EN DERNIER).
        # `fmt` est ignoré au-delà de ce branchement (le fake ne parle pas à ollama).
        if isinstance(request.fmt, dict) and "chapters" in request.fmt.get("properties", {}):
            chapters = self._curriculum_chapters or _DEFAULT_CURRICULUM
            return LLMResponse(text=json.dumps(chapters), model="fake", duration_ms=1)
        if isinstance(request.fmt, dict) and "lessons" in request.fmt.get("properties", {}):
            lessons = self._curriculum_lessons or _DEFAULT_LESSONS
            return LLMResponse(text=json.dumps(lessons), model="fake", duration_ms=1)
        if isinstance(request.fmt, dict) and "content" in request.fmt.get("properties", {}):
            content = self._lesson_content or _DEFAULT_LESSON_CONTENT
            return LLMResponse(text=json.dumps(content), model="fake", duration_ms=1)
        if isinstance(request.fmt, dict) and "cards" in request.fmt.get("properties", {}):
            cards = self._srs_cards or _DEFAULT_SRS_CARDS
            return LLMResponse(text=json.dumps(cards), model="fake", duration_ms=1)
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
