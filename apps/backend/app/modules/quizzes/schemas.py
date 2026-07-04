"""Schémas Pydantic du moteur de quiz (ADR-0014).

Trois familles :
1. **Parsing de la génération LLM** — union discriminée par `question_type`, chaque variante
   validant ses propres champs (pipeline ADR-0007 : validation stricte → 1 réparation → 502).
   Chaque variante sait produire ses colonnes DB via `.columns()` → (choices_json, key_json).
2. **CRUD Papa** — questions AVEC clés et explications.
3. **Flux élève** — les modèles de sortie ne contiennent PHYSIQUEMENT ni `correct_answer_json`
   ni `explanation_markdown` (asymétrie serveur, pas un oubli de sérialisation).
"""

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field

from app.modules.quizzes.correction import normalize_text

# --- 1. Parsing de la sortie LLM (union discriminée) --------------------------


class _GenBase(BaseModel):
    skill: str
    prompt: str
    explanation: str
    difficulty: int | None = None


class GenMcq(_GenBase):
    question_type: Literal["mcq"]
    choices: list[str] = Field(min_length=2)
    correct_index: int

    def columns(self) -> tuple[Any, Any]:
        if not 0 <= self.correct_index < len(self.choices):
            raise ValueError("correct_index hors des choix")
        return list(self.choices), self.correct_index


class GenMcqMulti(_GenBase):
    question_type: Literal["mcq_multi"]
    choices: list[str] = Field(min_length=2)
    correct_indices: list[int]

    def columns(self) -> tuple[Any, Any]:
        if not self.correct_indices or any(
            not 0 <= i < len(self.choices) for i in self.correct_indices
        ):
            raise ValueError("correct_indices hors des choix")
        return list(self.choices), sorted(set(self.correct_indices))


class GenTrueFalse(_GenBase):
    question_type: Literal["true_false"]
    answer: bool

    def columns(self) -> tuple[Any, Any]:
        return None, bool(self.answer)


class GenCloze(_GenBase):
    question_type: Literal["cloze"]
    blanks: list  # chaque trou : str (une réponse) ou list[str] (variantes acceptées)

    def columns(self) -> tuple[Any, Any]:
        if not self.blanks or "___" not in self.prompt:
            raise ValueError("cloze sans trou (___) ou sans réponse")
        normed = [[b] if isinstance(b, str) else [str(x) for x in b] for b in self.blanks]
        if any(not opts for opts in normed):
            raise ValueError("trou sans réponse acceptée")
        return None, {"blanks": normed}


class GenNumeric(_GenBase):
    question_type: Literal["numeric"]
    value: str | float | int
    tolerance: float | None = None
    accept: list[str] | None = None

    def columns(self) -> tuple[Any, Any]:
        key: dict[str, Any] = {"value": self.value}
        if self.tolerance is not None:
            key["tolerance"] = self.tolerance
        if self.accept:
            key["accept"] = list(self.accept)
        return None, key


class GenOrdering(_GenBase):
    question_type: Literal["ordering"]
    items: list[str] = Field(min_length=2)
    order: list[str] = Field(min_length=2)

    def columns(self) -> tuple[Any, Any]:
        if sorted(normalize_text(x) for x in self.items) != sorted(
            normalize_text(x) for x in self.order
        ):
            raise ValueError("`order` doit être une permutation de `items`")
        return {"items": list(self.items)}, {"order": list(self.order)}


class GenMatching(_GenBase):
    question_type: Literal["matching"]
    left: list[str] = Field(min_length=2)
    right: list[str] = Field(min_length=2)
    pairs: dict[str, str]

    def columns(self) -> tuple[Any, Any]:
        if not self.pairs:
            raise ValueError("matching sans association")
        return {"left": list(self.left), "right": list(self.right)}, {"pairs": dict(self.pairs)}


GeneratedQuestion = Annotated[
    Union[
        GenMcq, GenMcqMulti, GenTrueFalse, GenCloze, GenNumeric, GenOrdering, GenMatching
    ],
    Field(discriminator="question_type"),
]


class GeneratedQuiz(BaseModel):
    questions: list[GeneratedQuestion]


# --- 2. Requêtes & CRUD Papa --------------------------------------------------


class QuizGenerateRequest(BaseModel):
    """Papa paramètre le volume (court ≈ 5 / normal ≈ 8) et la difficulté (⭐/⭐⭐/⭐⭐⭐)."""

    count: Literal[5, 8] = 5
    difficulty: Literal[1, 2, 3] = 2


class QuizGenerateResponse(BaseModel):
    quiz_id: int
    lesson_id: int
    questions_generated: int
    questions_discarded: int


class QuizListItem(BaseModel):
    quiz_id: int
    title: str
    quiz_type: str
    status: str
    lesson_id: int | None
    lesson_title: str | None
    questions_count: int
    manual_count: int
    discard_rate: float | None  # taux d'écart de l'auto-vérification (indicateur de santé)


class PapaQuestionOut(BaseModel):
    """Question côté Papa : AVEC clé et explication."""

    id: int
    question_type: str
    prompt_markdown: str
    choices_json: Any | None
    correct_answer_json: Any | None
    explanation_markdown: str | None
    skill_id: int | None
    skill_name: str
    difficulty: int | None
    source: str
    status: str
    sort_order: int


class PapaQuizDetailOut(BaseModel):
    quiz_id: int
    title: str
    lesson_id: int | None
    subject_id: int
    status: str
    questions: list[PapaQuestionOut]


class QuestionPatch(BaseModel):
    prompt_markdown: str | None = None
    choices_json: Any | None = None
    correct_answer_json: Any | None = None
    explanation_markdown: str | None = None
    difficulty: int | None = None


class ManualQuestionCreate(BaseModel):
    question_type: str
    prompt_markdown: str
    choices_json: Any | None = None
    correct_answer_json: Any = None
    explanation_markdown: str | None = None
    skill_id: int | None = None
    difficulty: int | None = None


# --- 3. Flux élève (SANS clé ni explication) ----------------------------------


class StudentQuizListItem(BaseModel):
    quiz_id: int
    title: str
    lesson_id: int | None
    lesson_title: str | None
    questions_count: int


class StudentQuestionOut(BaseModel):
    """Question servie à Massimo : ni `correct_answer_json` ni `explanation_markdown`."""

    id: int
    question_type: str
    prompt_markdown: str
    choices_json: Any | None
    skill_id: int | None
    skill_name: str


class StudentQuizOut(BaseModel):
    quiz_id: int
    title: str
    questions: list[StudentQuestionOut]


class StartAttemptOut(BaseModel):
    attempt_id: int
    quiz_id: int
    questions_count: int


class SubmitAnswerRequest(BaseModel):
    question_id: int
    answer_json: Any = None


class AnswerFeedbackOut(BaseModel):
    """Feedback immédiat : correct + explication. La clé elle-même n'est JAMAIS renvoyée."""

    is_correct: bool
    explanation_markdown: str | None


class SkillScoreOut(BaseModel):
    skill_id: int | None
    skill_name: str
    score: int
    status: str


class CompleteOut(BaseModel):
    attempt_id: int
    quiz_id: int
    score_percent: int
    xp_awarded: int
    per_skill: list[SkillScoreOut]
    strengths: list[str]  # forces
    to_review: list[str]  # « à revoir bientôt » — jamais de vocabulaire d'échec
