import io
import json
import wave

from app.modules.ai.provider import LLMRequest, LLMResponse
from app.modules.rag.transcript import TranscriptError
from app.modules.stt.provider import SttRequest, SttResponse
from app.modules.tts.provider import TtsRequest, TtsResponse


class FakeEmbeddingProvider:
    """Embedder « déterministe » pour les tests (aucun appel ollama).

    ⚠️ **Il ne l'est PAS d'un run à l'autre** : `hash()` d'une `str` est salé par
    `PYTHONHASHSEED`. Suffisant pour vérifier qu'une ingestion écrit un vecteur, **piégeux** dès
    qu'un test dépend du CLASSEMENT des voisins — il devient alors instable à ~50 %.
    Pour ces cas-là : `Crc32EmbeddingProvider` ci-dessous.
    """

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        # Vecteur reproductible dérivé du texte (suffisant pour vérifier l'ingestion).
        return [[float(((hash(t) + i) % 1000) / 1000.0) for i in range(self.dim)] for t in texts]


class Crc32EmbeddingProvider:
    """Embedder **vraiment** déterministe — `zlib.crc32`, stable d'un processus à l'autre.

    À utiliser dès qu'un test porte sur la RÉSOLUTION ou la NON-résolution d'un voisinage : avec
    `FakeEmbeddingProvider`, un tel test est vert une fois sur deux et son échec ressemble à une
    régression. Même parade que `test_chat_announce`, qui avait déjà troqué `hash()` contre
    `crc32` pour la même raison.
    """

    def __init__(self, dim: int = 768) -> None:
        self.dim = dim

    def embed(self, texts: list[str]) -> list[list[float]]:
        import zlib

        return [
            [float(((zlib.crc32(t.encode()) + i) % 1000) / 1000.0) for i in range(self.dim)]
            for t in texts
        ]


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


# CouncilReportSpec déterministe valide (cf. reports/schemas.py, ADR-0020) renvoyé quand le schéma
# `fmt` a la propriété `global_summary`. Recommandations vides par défaut (aucun skill_id à ancrer,
# donc valide quels que soient les ids seedés) ; un test passant `council=` cible des skill_id réels.
_DEFAULT_COUNCIL = {
    "global_summary": "Massimo progresse ; quelques notions sont à renforcer, rien d'inquiétant.",
    "subjects": [
        {
            "subject_id": 1,
            "subject_name": "Mathématiques",
            "strengths": "De l'aisance sur les bases.",
            "to_reinforce": "Une notion en cours de construction.",
            "recent_evolution": "Tendance stable ces derniers temps.",
            "recommendations": [],
        }
    ],
}


# FicheSpec déterministe valide (cf. fiches/schemas.py, ADR-0015) renvoyé quand le schéma `fmt`
# a la propriété `essentiel`. Budgets respectés (definitions 2≤4, points 3≤5, erreurs 2≤3).
_DEFAULT_FICHE = {
    "title": "Les nombres relatifs",
    "subject": "Mathématiques",
    "level": "4e",
    "chapter": "Nombres relatifs",
    "essentiel": (
        "Un nombre relatif est un nombre précédé d'un signe + ou -. La droite graduée aide à "
        "les placer et à les comparer : plus on va vers la droite, plus le nombre est grand."
    ),
    "definitions": [
        {"terme": "Nombre relatif", "definition": "Un nombre positif, négatif ou nul, avec son signe."},
        {"terme": "Opposé", "definition": "Le même nombre avec le signe contraire (opposé de -3 : +3)."},
    ],
    "points_cles": [
        "Plus à droite = plus grand",
        "0 sépare positifs et négatifs",
        "Deux opposés sont à la même distance de 0",
    ],
    "erreurs_a_eviter": [
        "Penser que -5 est plus grand que -1",
        "Oublier le signe devant le nombre",
    ],
    "mini_exemple": "Comparer -3 et 2 : -3 est à gauche de 2, donc -3 < 2.",
}


# MindmapJson déterministe valide (cf. mindmaps/schemas.py, ADR-0016) renvoyé quand le schéma
# `fmt` a la propriété `center`. ARBRE STRICT intègre (parents cohérents, aucun cycle) : 2 racines,
# 2 enfants, 2 optionnels. `required_nodes` pilotent le barème de reconstruction déterministe.
_DEFAULT_MINDMAP = {
    "center": "Les nombres relatifs",
    "nodes": [
        {"id": "signe", "label": "Un signe + ou -", "parent": None},
        {"id": "droite", "label": "Droite graduée", "parent": None},
        {"id": "oppose", "label": "Opposé", "parent": "signe"},
        {"id": "comparer", "label": "Comparer", "parent": "droite"},
        {"id": "exemple", "label": "-3 < 2", "parent": "comparer"},
        {"id": "erreur", "label": "Ne pas oublier le signe", "parent": "signe"},
    ],
    "required_nodes": ["signe", "droite", "oppose", "comparer"],
    "optional_nodes": ["exemple", "erreur"],
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


# Quiz déterministe multi-formats (ADR-0014) renvoyé quand le schéma `fmt` a la propriété
# `questions`. UN exemplaire de chacun des sept formats du Lot 1. Chaque énoncé porte un tag
# `[[Qn]]` : la passe d'auto-vérification (fmt `answer`) le relit dans le prompt pour renvoyer
# une réponse baked. La question `matching` (Q7) DIVERGE volontairement de sa clé à la
# vérification → elle doit être écartée (jamais persistée). `skill` = la Skill seedée par conftest.
_DEFAULT_QUIZ = {
    "questions": [
        {"question_type": "mcq", "skill": "Nombres relatifs", "prompt": "[[Q1]] Quel est l'opposé de -2 ?",
         "choices": ["+2", "-2", "0", "+4"], "correct_index": 0, "explanation": "L'opposé de -2 est +2."},
        {"question_type": "mcq_multi", "skill": "Nombres relatifs", "prompt": "[[Q2]] Lesquels sont négatifs ?",
         "choices": ["-3", "+5", "-1", "+2"], "correct_indices": [0, 2], "explanation": "-3 et -1 portent le signe -."},
        {"question_type": "true_false", "skill": "Nombres relatifs", "prompt": "[[Q3]] -5 est plus petit que -1.",
         "answer": True, "explanation": "Sur la droite graduée, -5 est à gauche de -1."},
        {"question_type": "cloze", "skill": "Nombres relatifs", "prompt": "[[Q4]] Un nombre relatif a un ___ .",
         "blanks": [["signe"]], "explanation": "Un relatif porte un signe + ou -."},
        {"question_type": "numeric", "skill": "Nombres relatifs", "prompt": "[[Q5]] Donne une valeur approchée de pi.",
         "value": "3.14", "tolerance": 0.01, "explanation": "pi ≈ 3,14."},
        {"question_type": "ordering", "skill": "Nombres relatifs", "prompt": "[[Q6]] Range du plus petit au plus grand.",
         "items": ["4", "-5", "-1"], "order": ["-5", "-1", "4"], "explanation": "-5 < -1 < 4."},
        {"question_type": "matching", "skill": "Nombres relatifs", "prompt": "[[Q7]] Associe l'animal à sa classe.",
         "left": ["chat", "truite"], "right": ["mammifère", "poisson"],
         "pairs": {"chat": "mammifère", "truite": "poisson"}, "explanation": "Le chat est un mammifère."},
    ]
}

# Réponse baked de l'auto-vérification par tag. Toutes CONCORDENT avec la clé, SAUF Q7
# (matching) qui inverse les paires → divergence → question écartée par la passe de contrôle.
_DEFAULT_QUIZ_SELFCHECK = {
    "[[Q1]]": {"choice_index": 0},
    "[[Q2]]": {"choice_indices": [0, 2]},
    "[[Q3]]": {"value": True},
    "[[Q4]]": {"blanks": ["signe"]},
    "[[Q5]]": {"value": "3.14"},
    "[[Q6]]": {"order": ["-5", "-1", "4"]},
    "[[Q7]]": {"pairs": {"chat": "poisson", "truite": "mammifère"}},  # ← divergence volontaire
}


# Tour de chat déterministe (ADR-0026) renvoyé quand le schéma `fmt` a la propriété `reply`.
# Défaut : aucune difficulté déclarée, aucun outil proposé. Les tests passent un `chat` custom
# pour exercer la difficulté déclarée (→ event + règle Gap) et la proposition d'outil.
_DEFAULT_CHAT = {
    "reply": "Bonne question ! On regarde ça ensemble, étape par étape.",
    "declared_difficulty": {"declared": False, "kind": ""},
    "tool_suggestion": "",
}


# Jugement `open` déterministe (ADR-0014 Lot 2) renvoyé quand le schéma `fmt` a la propriété
# `criteria`. Défaut : deux critères acquis, juge confiant → réponse créditée. Les tests de
# calibrage passent un `quiz_judge` custom (critère non acquis, juge non confiant → ambiguïté…).
_DEFAULT_QUIZ_JUDGE = {
    "criteria": [
        {"label": "Point attendu 1", "met": True, "note": "bien présent"},
        {"label": "Point attendu 2", "met": True, "note": "bien présent"},
    ],
    "feedback": "Bravo, tu as bien expliqué avec tes mots !",
    "confident": True,
}


class FakeLLMProvider:
    """Provider IA déterministe pour les tests (aucun appel ollama)."""

    def __init__(
        self,
        feedback: str = "Bien joué, tu progresses ! Prochaine étape : un petit quiz.",
        score: int = 80,
        capsule_spec: dict | None = None,
        fiche: dict | None = None,
        mindmap: dict | None = None,
        curriculum_chapters: dict | None = None,
        curriculum_lessons: dict | None = None,
        lesson_content: dict | None = None,
        srs_cards: dict | None = None,
        quiz: dict | None = None,
        quiz_selfcheck: dict | None = None,
        quiz_judge: dict | None = None,
        council: dict | None = None,
        chat: dict | None = None,
    ) -> None:
        self._feedback = feedback
        self._score = score
        self._capsule_spec = capsule_spec
        self._fiche = fiche
        self._mindmap = mindmap
        self._curriculum_chapters = curriculum_chapters
        self._curriculum_lessons = curriculum_lessons
        self._lesson_content = lesson_content
        self._srs_cards = srs_cards
        self._quiz = quiz
        self._quiz_selfcheck = quiz_selfcheck
        self._quiz_judge = quiz_judge
        self._council = council
        self._chat = chat

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
        # Quiz (ADR-0014) : génération (propriété `questions`) puis auto-vérification à
        # l'aveugle (propriété `answer`) — repérée par tag `[[Qn]]` relu dans le prompt.
        if isinstance(request.fmt, dict) and "questions" in request.fmt.get("properties", {}):
            quiz = self._quiz or _DEFAULT_QUIZ
            return LLMResponse(text=json.dumps(quiz), model="fake", duration_ms=1)
        if isinstance(request.fmt, dict) and "answer" in request.fmt.get("properties", {}):
            checks = self._quiz_selfcheck or _DEFAULT_QUIZ_SELFCHECK
            answer = next((a for tag, a in checks.items() if tag in request.prompt), None)
            return LLMResponse(text=json.dumps({"answer": answer}), model="fake", duration_ms=1)
        if isinstance(request.fmt, dict) and "criteria" in request.fmt.get("properties", {}):
            verdict = self._quiz_judge or _DEFAULT_QUIZ_JUDGE
            return LLMResponse(text=json.dumps(verdict), model="fake", duration_ms=1)
        # Chat ZETIS (ADR-0026) : schéma repéré par sa propriété `reply`. AVANT le fallback capsule.
        if isinstance(request.fmt, dict) and "reply" in request.fmt.get("properties", {}):
            chat = self._chat or _DEFAULT_CHAT
            return LLMResponse(text=json.dumps(chat), model="fake", duration_ms=1)
        # Fiche de révision (ADR-0015) : schéma repéré par sa propriété `essentiel`. AVANT le
        # fallback capsule (qui capte tout `fmt` restant), sinon la fiche recevrait un CapsuleSpec.
        if isinstance(request.fmt, dict) and "essentiel" in request.fmt.get("properties", {}):
            fiche = self._fiche or _DEFAULT_FICHE
            return LLMResponse(text=json.dumps(fiche), model="fake", duration_ms=1)
        # Mindmap (ADR-0016) : schéma repéré par sa propriété `center`. AVANT le fallback capsule.
        if isinstance(request.fmt, dict) and "center" in request.fmt.get("properties", {}):
            mindmap = self._mindmap or _DEFAULT_MINDMAP
            return LLMResponse(text=json.dumps(mindmap), model="fake", duration_ms=1)
        # Conseil de classe IA (ADR-0020) : schéma repéré par sa propriété `global_summary`.
        # AVANT le fallback capsule (qui capte tout `fmt` restant).
        if isinstance(request.fmt, dict) and "global_summary" in request.fmt.get("properties", {}):
            council = self._council or _DEFAULT_COUNCIL
            return LLMResponse(text=json.dumps(council), model="fake", duration_ms=1)
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
            #
            # ⚠️ **CINQ questions depuis l'ADR-0043 Décision 3, et le nombre n'est pas décoratif.**
            # `generate_diagnostic` tronque à `QUESTIONS_PER_SKILL` : tant que ce faux n'en rendait
            # que deux, une passation de test restait à trois valeurs de score possibles et AUCUN
            # test ne pouvait exercer la granularité fine — ni un score à 20 %, ni un 80 %, ni la
            # différence entre les deux grains que la page doit savoir dire.
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
                {
                    "prompt": "Troisième question ?",
                    "choices": ["Bonne réponse", "Mauvaise A", "Mauvaise B"],
                    "correct_index": 0,
                    "explanation": "Explication courte.",
                },
                {
                    "prompt": "Quatrième question ?",
                    "choices": ["Bonne réponse", "Mauvaise A"],
                    "correct_index": 0,
                    "explanation": "Explication courte.",
                },
                {
                    "prompt": "Cinquième question ?",
                    "choices": ["Bonne réponse", "Mauvaise A", "Mauvaise B", "Mauvaise C"],
                    "correct_index": 0,
                    "explanation": "Explication courte.",
                },
            ],
        }
        return LLMResponse(text=json.dumps(payload), model="fake", duration_ms=1)


class FakeTranscriptFetcher:
    """Récupérateur de transcription déterministe (aucun appel réseau)."""

    def __init__(
        self,
        text: str = "This is a test transcript about the present perfect tense.",
        language: str = "en",
        available: bool = True,
    ) -> None:
        self._text = text
        self._language = language
        self._available = available

    def fetch(self, video_id: str) -> tuple[str, str]:
        if not self._available:
            raise TranscriptError("Transcription désactivée pour cette vidéo.")
        return self._text, self._language


class FakeQueue:
    """File RQ de test : elle ENREGISTRE, elle n'enfile rien — et surtout elle ne parle à aucun Redis.

    ⚠️ **Elle existe parce que la défense d'avant était opt-in.** `test_capsule_render` patchait
    `enqueue_render` à la main, cinq fois ; le jour où un test a posté sur
    `/api/production/runs/from-request` sans y penser, **18 jobs `run_production(1)` sont partis
    dans la vraie file de dev** — constaté le 2026-08-04, récidive des 35 purgés le 2026-08-03.
    Ils échouaient (`run 1` n'existe pas en base) ; le jour où `run 1` existe, un worker rejoue un
    vrai lot autant de fois qu'il y a de jobs.

    ⚠️ **Le point de greffe est la FABRIQUE de file, jamais `enqueue_*`.** `runs_router` importe
    `enqueue_production` au niveau module : le nom y est lié à l'import, donc patcher
    `app.core.queue.enqueue_production` ne rebinde rien chez lui — un garde-fou vert et sans effet.
    `enqueue_production`, lui, résout `production_queue` dans les globals de SON module **à
    l'appel** : remplacer la fabrique attrape tous les appelants, quelle que soit la façon dont ils
    ont importé. Voir le fixture `file_rq_factice` de `conftest.py`.
    """

    def __init__(self) -> None:
        # `(func, args)` — de quoi affirmer ce qui AURAIT été enfilé, sans rien exécuter.
        self.enqueued: list[tuple] = []

    def _job(self):
        from types import SimpleNamespace

        # `enqueue_production` rend `job.id` : sans cet attribut, la route tomberait en test pour
        # une raison qui n'a rien à voir avec ce qu'elle teste.
        return SimpleNamespace(id=f"fake-job-{len(self.enqueued)}")

    def enqueue(self, func, *args, **kwargs):
        self.enqueued.append((func, args))
        return self._job()

    def enqueue_in(self, delay, func, *args, **kwargs):
        self.enqueued.append((func, args))
        return self._job()

    @property
    def jobs(self) -> list:
        return []

    def fetch_job(self, job_id: str):
        return None
