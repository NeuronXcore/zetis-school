from pydantic import BaseModel, Field


class SubjectOut(BaseModel):
    id: int
    name: str


class DiagnosticGenerateRequest(BaseModel):
    """Papa lance un diagnostic sur une matière (niveau optionnel)."""

    subject_id: int
    level: str | None = None


class DiagnosticGenerateResponse(BaseModel):
    quiz_id: int
    subject: str
    questions_count: int


class DiagQuestionOut(BaseModel):
    """Question telle que servie à Massimo : SANS la bonne réponse."""

    id: int
    prompt: str
    choices: list[str]
    skill_id: int | None
    skill_name: str


class DiagnosticQuizOut(BaseModel):
    quiz_id: int
    title: str
    subject: str
    questions: list[DiagQuestionOut]


class DiagnosticQuizListItem(BaseModel):
    quiz_id: int
    title: str
    subject: str
    questions_count: int
    taken: bool


class DiagAnswerIn(BaseModel):
    question_id: int
    choice_index: int


class DiagnosticSubmitRequest(BaseModel):
    answers: list[DiagAnswerIn] = Field(default_factory=list)


class SkillScoreOut(BaseModel):
    skill_id: int | None
    skill_name: str
    score: int  # 0..100
    status: str  # mastered|solid|learning|weak
    # Le GRAIN de cette mesure (ADR-0043 Décision 3). 2 avant l'ADR, 5 après : la granularité du
    # dépôt est MIXTE pour toujours, et un score de 50 % ne dit pas la même chose selon qu'il
    # porte sur 2 ou 5 questions. Servi pour que la page puisse le dire au lieu de le taire.
    questions_count: int = 0


class GapOut(BaseModel):
    skill_id: int | None
    skill_name: str
    severity: str  # medium|high


class DiagnosticResultOut(BaseModel):
    attempt_id: int
    quiz_id: int
    subject: str
    score_percent: int
    per_skill: list[SkillScoreOut]
    gaps: list[GapOut]
    strengths: list[str]


class PorteePointOut(BaseModel):
    """Un point de la portée. **`None` à la place de l'objet = notion non mesurée** par cette
    passation — jamais la valeur précédente reportée (spec §portée : aucune interpolation)."""

    attempt_id: int
    score: int
    questions_count: int


class PorteeNotionOut(BaseModel):
    """Une notion mesurée **au moins deux fois**. Un point ne fait pas une pente."""

    skill_id: int
    skill_name: str
    points: list[PorteePointOut | None]
    delta: int  # dernière mesure − première mesure, en points


class PorteePassationOut(BaseModel):
    attempt_id: int
    completed_at: str | None
    score_percent: int


class PorteeOut(BaseModel):
    """La portée d'une matière — `latest_results` transposé, par notion au lieu de par passation.

    `attempts` est servi **du plus ancien au plus récent** et indexe `points` position par
    position : la page n'a aucun appariement à refaire."""

    subject_id: int
    subject: str
    attempts: list[PorteePassationOut]
    notions: list[PorteeNotionOut]


class DiagnosticValidationOut(BaseModel):
    """Retour d'un verdict de Papa. **Deux champs, pas le quiz entier** : la file de relecture
    retire la ligne en optimiste et n'affiche rien du corps — lui rendre le contenu du diagnostic
    ferait transiter des questions que personne ne lit."""

    quiz_id: int
    validation_status: str  # pending|validated|rejected


class DiagnosticResultSummary(BaseModel):
    """Vue Papa : résultats récents d'un diagnostic, par notion + lacunes."""

    attempt_id: int
    quiz_id: int
    subject: str
    score_percent: int
    completed_at: str | None
    per_skill: list[SkillScoreOut]
    gaps: list[GapOut]
