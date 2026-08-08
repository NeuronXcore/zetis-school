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
    """Ce que la page de Massimo doit pouvoir HIÉRARCHISER (ADR-0044 Décision 6).

    Les dates sont des chaînes ISO, comme partout dans ce module (`DiagnosticResultSummary`) et
    dans `packages/types` — pas des `datetime`, pour que le contrat de sortie reste le même d'un
    schéma à l'autre.
    """

    quiz_id: int
    title: str
    subject: str
    # Sans le slug, le front n'a pas de quoi appeler `subjectIconFor` et se remet à coder les
    # matières en dur — ce que `CLAUDE.md` interdit. `useMissions` en est la démonstration : faute
    # de slug servi, il reconstruit un `nameToSlug` à partir d'un second appel.
    subject_slug: str
    questions_count: int
    # ⚠️ REMPLACE `taken: bool` : le booléen reste dérivable (`taken_at is not None`), et deux
    # sources pour un même fait est une divergence en attente.
    taken_at: str | None
    last_attempt_id: int | None
    # La mesure la plus récente parmi les notions DE CE DIAGNOSTIC — jamais de sa matière.
    # `None` = aucune de ses notions n'a jamais été mesurée.
    #
    # 🔴 C'est ce champ, et lui seul, qui porte le tri de la page (Décision 2). Il regarde l'ÂGE
    # d'une mesure, jamais son RÉSULTAT : c'est ce qui rend l'ordre montrable à un enfant, là où
    # un tri « la matière où il est le plus faible » serait un diagnostic négatif — un ordre de
    # liste est une formulation.
    measured_at: str | None


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
    # open|in_progress|resolved|ignored — l'ÉTAT, relu en base à chaque affichage. Il est servi
    # plutôt que déduit : la station ② porte un badge `résolue`, impossible à afficher si la lacune
    # était filtrée sur les statuts ouverts.
    status: str = "open"
    # ok|aucune_lecon|cours_brouillon (ADR-0042). 🔴 Les deux derniers ne se confondent pas — sans
    # leçon le quiz s'ancre sur la notion, avec une leçon en brouillon la voie notion REFUSE. Le
    # geste de Papa diffère : produire, ou valider le cours.
    content_state: str = "ok"


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


class RailEntryOut(BaseModel):
    """Une entrée du rail chronologique — une passation, ou un diagnostic en cours de route.

    🔴 `score_percent` est `None` sur les deux premiers crans, **jamais 0** : aucun score n'existe
    avant qu'une tentative n'ait été complétée, et un zéro se lirait comme une mesure catastrophique
    au lieu d'une absence."""

    cle: str  # identifiant de ligne stable — une tentative et un quiz ne partagent pas d'espace d'id
    cran: str  # genere|propose|passe
    quiz_id: int
    attempt_id: int | None
    subject_id: int
    subject: str
    subject_slug: str
    date: str | None
    notions_count: int
    score_percent: int | None
    rang: int | None  # rang de la passation DANS SA MATIÈRE (1ʳᵉ, 2ᵉ…), `None` hors 3ᵉ cran


class PlusAncienneLectureOut(BaseModel):
    subject: str
    date: str
    jours: int


class JaugesOut(BaseModel):
    """Les quatre jauges du bandeau instrument."""

    matieres_mesurees: int
    matieres_total: int
    a_relire: int
    proposes_non_passes: int
    jamais_generees: int
    plus_ancienne_lecture: PlusAncienneLectureOut | None
    lacunes_ouvertes: int
    lacunes_sans_contenu: int
    # 🔴 **Toujours 0, par décision.** `trigger='evidence'` reste fermé : ZETIS ne se commande pas
    # de production sur sa propre mesure. Servi plutôt que déduit, pour que la page rende un « vide
    # voulu » (hachures, gris, jamais rouge) et non un compteur de panne.
    lots_declenches: int


class SubjectRefOut(BaseModel):
    id: int
    name: str
    slug: str


class ApercuSubjectOut(SubjectRefOut):
    """Une matière de l'année active, pour les pastilles de filtre.

    `a_un_diagnostic` est **faux et servi quand même** : les matières sans aucun diagnostic restent
    dans la rangée, atténuées — leur absence est l'information (spec §Filtres). Les retirer ferait
    disparaître ce qui reste à mesurer."""

    a_un_diagnostic: bool


class DiagnosticApercuOut(BaseModel):
    """Bandeau + rail + matières jamais mesurées, en UN appel.

    Aucune autre route ne peut le servir : `list_diagnostics` est gaté sur `validated` depuis
    l'ADR-0043 — c'est une route élève — alors que Papa a précisément besoin de voir le premier
    cran, celui que Massimo ne voit pas."""

    subjects: list[ApercuSubjectOut]
    jauges: JaugesOut
    rail: list[RailEntryOut]
    # Sans `a_un_diagnostic` : par définition il vaudrait `false` sur toute la liste. Servir un
    # champ constant inviterait à le lire comme s'il pouvait varier.
    jamais_genere: list[SubjectRefOut]


class DiagnosticResultSummary(BaseModel):
    """Vue Papa : résultats récents d'un diagnostic, par notion + lacunes."""

    attempt_id: int
    quiz_id: int
    subject_id: int | None = None
    subject: str
    score_percent: int
    completed_at: str | None
    per_skill: list[SkillScoreOut]
    gaps: list[GapOut]
