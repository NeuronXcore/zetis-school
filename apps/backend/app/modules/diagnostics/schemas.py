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


class RelectureQuestionOut(BaseModel):
    """Une question telle que PAPA la relit : les cinq éléments, clé et explication comprises.

    ⚠️ **Quatre champs de `PapaQuestionOut` sont volontairement absents** — `difficulty`, `source`,
    `status`, `sort_order`. Sur un diagnostic ils sont constants par construction (les routes
    d'édition et de retrait de `quizzes` sont fermées à ce type par `_mission_quiz_or_404`) :
    mesuré, 304 questions de diagnostic, 0 retirée, toutes `generated`. Servir un champ constant
    invite à le lire comme s'il pouvait varier.

    ⚠️ `question_type` est absent pour la même raison : un diagnostic est `mcq` **en dur**
    (`service.py`, la génération). Le jour où ce n'est plus vrai, c'est le champ qu'il faut ajouter
    — et le rendu du client qui doit changer avec.
    """

    id: int
    prompt_markdown: str
    choices_json: list[str]
    # 🔴 `None` = clé illisible, et c'est une information. Coercer en silence désignerait le
    # MAUVAIS choix comme bonne réponse — sur une surface dont le seul rôle est de vérifier
    # justement ça.
    correct_answer_json: int | None
    explanation_markdown: str | None


class RelectureNotionOut(BaseModel):
    """Les questions d'UNE notion. C'est le groupe qui porte la notion, pas la question.

    🔴 `skill_name` vaut `None` quand la notion manque — **jamais `"Notion"`**, contrairement à
    `DiagQuestionOut` qui sert la vue élève. Le repli est bon pour un enfant ; ici il donnerait à un
    défaut de génération l'apparence d'une notion, sur l'écran fait pour repérer ce défaut-là.
    Le client écrit « — notion non renseignée — ».
    """

    skill_id: int | None
    skill_name: str | None
    questions: list[RelectureQuestionOut]


class DiagnosticRelectureOut(BaseModel):
    """Le questionnaire complet, pour la relecture de Papa (ADR-0051 Décision 5).

    ⚠️ Ce schéma doit **déclarer chaque clé** : `response_model` filtre en silence tout champ non
    déclaré, et le dépôt s'est fait avoir deux fois de suite sur ce motif (ADR-0045 puis ADR-0047).

    ⚠️ **`notions` peut n'avoir qu'UN groupe.** `MAX_SKILLS = 8` est un plafond, pas une forme :
    4 diagnostics de la base de dev portent 2 questions sur une seule notion.
    """

    quiz_id: int
    title: str
    subject: str
    # Le compte de questions du LOT, servi plutôt que recalculé côté client : c'est le volume que
    # Papa s'apprête à relire, et il commande la forme de l'écran (40 au maximum, ADR-0051 §4).
    total: int
    notions: list[RelectureNotionOut]


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
    """Une réponse, et les deux signaux qui se rattachent VRAIMENT à elle (ADR-0048).

    🔴 **Les deux derniers champs sont OPTIONNELS, et ils doivent le rester.** Un corps qui
    n'envoie que `question_id` et `choice_index` — le contrat d'avant le chantier — continue de
    fonctionner à l'identique. C'est ce qui garde les tests existants verts et rend le déploiement
    sans ordre imposé entre le back et le front.

    ⚠️ `ms_depuis_precedente` est une **durée**, jamais un horodatage : le client la mesure avec
    `performance.now()` (monotone, immune au changement d'heure), et aucun temps absolu venu du
    navigateur n'entre dans ZETIS.

    🔴 **La sortie d'écran n'est PAS ici** — elle est dans `DiagnosticConditionsIn` (Décision 1 bis).
    L'écran de passation affiche **toutes les questions d'un bloc** : il n'y a pas de question
    courante, donc rien à quoi rattacher une sortie. Ne pas la « remonter » ici en croyant bien
    faire : elle y serait fausse.
    """

    question_id: int
    choice_index: int
    # Délai depuis la réponse PRÉCÉDENTE (pour la première : depuis le début de la passation). C'est
    # le RYTHME de Massimo. INDICE, ne déclenche jamais rien.
    #
    # 🔴 Ce champ s'appelait `ms_reflexion` et prétendait mesurer « l'affichage → la réponse ».
    # Inimplémentable : l'écran de passation affiche TOUTES les questions d'un bloc, il n'existe
    # aucun instant d'affichage par question (ADR-0048 Décision 1 bis).
    ms_depuis_precedente: int | None = None
    # L'énoncé a été copié. FAIT, et le SEUL des trois qui survit au niveau de la réponse : une
    # sélection se localise dans le bloc d'une question, contrairement à une sortie d'écran.
    enonce_copie: bool = False


class DiagnosticConditionsIn(BaseModel):
    """Ce que le client a observé sur la passation ENTIÈRE (ADR-0048). Optionnel en bloc."""

    ms_total: int | None = None
    # Combien de fois l'écran a été quitté PENDANT la passation. FAIT (ADR-0048 Décision 1 bis).
    # Porté ici et non par la réponse : toutes les questions sont affichées ensemble, une sortie
    # d'écran ne se rattache à aucune d'elles.
    sorties_ecran: int = 0
    plein_ecran_quitte: bool = False
    taille_changee: bool = False
    # 🔴 Ce que l'appareil PERMETTAIT d'observer. Sans lui, l'absence d'un signal se lirait comme
    # l'absence du comportement — or iOS Safari refuse le plein écran sur iPhone.
    signaux_observables: list[str] = Field(default_factory=list)


class DiagnosticSubmitRequest(BaseModel):
    answers: list[DiagAnswerIn] = Field(default_factory=list)
    conditions: DiagnosticConditionsIn | None = None


class ExplicationIn(BaseModel):
    """Le mot de Massimo sur une bonne réponse (ADR-0048 Décision 5).

    200 caractères et non 140 : une phrase **dite** est plus longue qu'une phrase tapée, et le champ
    porte un micro. Tronquer la parole d'un enfant en silence est ce que ce chantier s'interdit
    partout ailleurs."""

    question_id: int
    texte: str = Field(max_length=200)


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
    # 🔴 **Où le geste doit mener** (2026-08-11). Sans ces deux champs, « Valider le cours de cette
    # leçon » ne pouvait construire que `/programme?subject=` : la matière s'ouvrait et Papa se
    # retrouvait devant TOUS ses chapitres, sans rien qui désigne la leçon. Un lien bien formé,
    # cliquable, et qui ne mène nulle part de précis — le motif que l'ADR-0050 nomme *« un
    # cul-de-sac qui a l'air de marcher »*.
    #
    # ⚠️ **Les deux vont ENSEMBLE ou pas du tout.** `ProgrammePage` a besoin de `subject` pour
    # sélectionner, de `chapter` pour déplier, et de `lesson` pour mettre en évidence : servir
    # `lesson_id` seul rouvrirait le même cul-de-sac un cran plus bas, le chapitre restant replié.
    lesson_id: int | None = None
    chapter_id: int | None = None


class DiagnosticGapEleveOut(BaseModel):
    """Une notion à renforcer, telle que MASSIMO la voit : son nom, rien d'autre.

    ⚠️ Ne pas confondre avec `GapOut`, qui porte `severity`, `status` et `content_state` — c'est
    le contrat de PAPA. Ici, `skill_id` n'est pas de l'analytique : c'est de la plomberie (la page
    en fait un lien vers la notion).
    """

    skill_id: int | None
    skill_name: str


class FiabiliteFaitsOut(BaseModel):
    # Nombre de sorties d'écran SUR LA PASSATION — pas « questions quittées » (Décision 1 bis) :
    # toutes les questions étant affichées ensemble, on ne sait pas laquelle était lue.
    sorties_ecran: int = 0
    enonces_copies: int = 0
    plein_ecran_quitte: bool = False
    acquises_sans_trace: int = 0
    notions_total: int = 0


class FiabiliteIndicesOut(BaseModel):
    """Ils s'AFFICHENT et ne déclenchent jamais. Les cacher au motif qu'ils sont bruités
    reviendrait à décider à la place de Papa, qui lit mieux qu'un seuil."""

    reponses_rapides: int = 0
    taille_changee: bool = False


class FiabilitePorteeOut(BaseModel):
    observables: list[str] = Field(default_factory=list)


class FiabiliteOut(BaseModel):
    """Les conditions dans lesquelles une mesure a été prise (ADR-0048).

    🔴 **Servi `None` quand la passation n'a jamais été observée** — toutes celles d'avant le
    chantier. `None` ne veut PAS dire « rien à signaler » : il veut dire « ZETIS ne regardait pas ».
    La page rend trois états, pas deux.

    ⚠️ Ce schéma doit **déclarer chaque clé** : `response_model` filtre en silence tout champ non
    déclaré, et le dépôt s'est fait avoir deux fois de suite sur ce motif (ADR-0045 puis ADR-0047).
    """

    verdict: str  # a_confirmer|rien_a_signaler
    regle_version: int
    faits: FiabiliteFaitsOut
    indices: FiabiliteIndicesOut
    declencheurs: list[str] = Field(default_factory=list)
    portee: FiabilitePorteeOut


class VerbalisationOut(BaseModel):
    """La question posée à Massimo après sa soumission — « raconte comment tu as trouvé ».

    🔴 **Servie à CHAQUE passation, quel que soit le verdict.** La conditionner au doute la
    transformerait en accusation : deux ou trois passations suffisent à un enfant pour comprendre,
    et le seul signal non falsifiable du lot serait détruit par la manière de le demander.

    Le tirage est **déterministe** (dérivé de l'`attempt_id`) : recharger repose la même question.
    """

    question_id: int
    skill_id: int | None
    skill_name: str
    # Ce que Massimo a déjà répondu, s'il a répondu. En relecture il se relit ; on ne lui redemande
    # pas. `None` = pas encore répondu, et ce n'est **jamais** un signal.
    explication: str | None = None


class DiagnosticResultOut(BaseModel):
    """Ce que Massimo voit de sa propre mesure (ADR-0044 Décision 5).

    🔴 **Un seul schéma pour DEUX routes** — `POST /submit` et la relecture d'une passation. Deux
    schémas pour un même écran finiraient par diverger, et c'est l'écran de l'enfant.

    **Ni `score_percent`, ni `per_skill`, ni `severity`.** La spec v1 prescrivait déjà « pas
    d'affichage de note brute immédiate » ; l'écran la contredisait depuis l'étape 14. Un score par
    notion est un score : le garder ferait rentrer par la porte de service ce que la décision fait
    sortir par la grande.

    ⚠️ Le score continue d'être **calculé et écrit** (`QuizAttempt.score_percent`) et reste servi à
    **Papa** : c'est sa diffusion à l'enfant qui cesse, pas sa mesure.
    """

    attempt_id: int
    quiz_id: int
    subject: str
    completed_at: str | None
    strengths: list[str]
    gaps: list[DiagnosticGapEleveOut]
    # 🔴 La SEULE part de l'anti-triche que Massimo voit — et il ne voit rien du verdict, jamais
    # (ADR-0048). `None` uniquement si la passation n'a aucune bonne réponse à faire raconter.
    verbalisation: VerbalisationOut | None = None


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
    # Le verdict, pour que la marque du rail soit repérable SANS ouvrir le panneau (ADR-0048).
    # Le verdict seul, pas les faits : le rail signale, le panneau explique.
    #
    # 🔴 `None` sur les deux premiers crans — une passation qui n'a pas eu lieu n'a pas de mesure,
    # donc rien à qualifier — ET sur les passations d'avant le chantier.
    fiabilite_verdict: str | None = None


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
    # Les conditions de cette mesure (ADR-0048). `None` = ZETIS ne regardait pas.
    fiabilite: FiabiliteOut | None = None
    # Ce que Massimo a dit d'une de ses bonnes réponses, s'il l'a dit. Rendu dans la station ①, à
    # côté de la notion dont il parle — pas dans la bande, qui ne porte que ce que ZETIS a OBSERVÉ.
    #
    # 🔴 Papa ne doit jamais le reprocher à Massimo. Le jour où « j'ai cherché » se retourne contre
    # lui, la question ne reçoit plus jamais de réponse vraie.
    verbalisation: VerbalisationOut | None = None
