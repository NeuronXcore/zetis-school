from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Quiz, QuizAttempt
from app.modules.activity.events import EVENT_QUIZ_ATTEMPTED, log_learning_event
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import require_child, require_parent
from app.modules.diagnostics import service
from app.modules.diagnostics.schemas import (
    DiagnosticApercuOut,
    DiagnosticGenerateRequest,
    DiagnosticGenerateResponse,
    DiagnosticQuizListItem,
    DiagnosticQuizOut,
    DiagnosticRelectureOut,
    DiagnosticResultOut,
    DiagnosticResultSummary,
    DiagnosticSubmitRequest,
    DiagnosticValidationOut,
    ExplicationIn,
    PorteeOut,
    SubjectOut,
    VerbalisationOut,
)
from app.modules.eli5.service import get_default_student
from app.modules.ai import travaux
from app.modules.ai.schemas import TravailAccepteOut

router = APIRouter(prefix="/api/diagnostics", tags=["diagnostics"])

# Les rôles, route par route (ADR-0043 Décision 2). Jusqu'ici les six se contentaient de
# `get_current_user` : n'importe quel compte pouvait soumettre un diagnostic à la place de Massimo,
# donc écraser `skill_mastery` et ouvrir des `Gap` avec un signal fort et faux.
#
# 🔴 **Ce n'est pas une dérive de périmètre, c'est la moitié manquante du gate** : protéger l'entrée
# (ce qui est servi) en laissant la sortie ouverte (ce qui est écrit) ne protège rien.
#
# 🔴 **Les TROIS dernières routes sans rôle ont été fermées le 2026-08-16**, et `get_current_user`
# a quitté ce fichier : plus AUCUNE route de `diagnostics` ne se contente d'un compte authentifié.
# Ce n'est pas une décision neuve — c'est l'exécution de la règle ci-dessus sur ce qu'elle avait
# laissé passer. `test_diagnostics_roles.py` interdit désormais la quatrième, le jour où elle est
# écrite. Chacune est allée au rôle de son SEUL appelant réel, relevé dans les deux frontends :
#   · GET /subjects            → require_parent  (frontend-papa seul)
#   · GET /quizzes             → require_child   (frontend-massimo seul)
#   · GET /quizzes/{quiz_id}   → require_child   (frontend-massimo seul, cf. sa route sœur)


@router.get("/subjects", response_model=list[SubjectOut])
def subjects(db: Session = Depends(get_db), _: dict = Depends(require_parent)) -> list[dict]:
    """Les matières sur lesquelles Papa peut lancer un diagnostic.

    `require_parent` et pas `get_current_user` : son seul appelant est l'espace Papa
    (`frontend-papa/src/lib/diagnostic.ts:52`), qui la lit pour peupler le sélecteur de
    `POST /generate` — déjà `require_parent`. Servir la liste sans le rôle laissait l'entrée
    d'un geste de pilotage plus ouverte que le geste lui-même.
    """
    return [{"id": s.id, "name": s.name} for s in service.list_subjects(db)]


@router.post(
    "/generate", response_model=TravailAccepteOut, status_code=status.HTTP_202_ACCEPTED
)
def generate(
    req: DiagnosticGenerateRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_parent),
) -> dict:
    """Papa lance un diagnostic. **202 — accepté, pas exécuté** (ADR-0041 §4).

    `quiz_id`, `subject` et `questions_count` se lisent dans `output` quand le travail est
    `succeeded` — le contrat de `DiagnosticGenerateResponse` y est déplacé tel quel.

    🔴 **Le `404` est rejoué ICI, avant d'enfiler, et c'est une correction trouvée par un test.**
    La file diffère le TRAVAIL, jamais le VERDICT sur la demande : une matière inconnue doit être
    refusée au clic, pas rapportée deux minutes plus tard comme un travail en échec. Le contrôle
    coûte une lecture indexée, et le service le refait de son côté — le monde a pu changer entre
    le clic et l'exécution.
    """
    service._subject_or_404(db, req.subject_id)
    return travaux.enfiler(
        db,
        job_type="diagnostic_generate",
        payload={"subject_id": req.subject_id, "level": req.level},
    )


@router.get("/quizzes", response_model=list[DiagnosticQuizListItem])
def quizzes(db: Session = Depends(get_db), _: dict = Depends(require_child)) -> list[dict]:
    """Ce que Massimo peut passer — la liste gatée sur `validated` (ADR-0043).

    `require_child` : son seul appelant est l'espace Massimo
    (`frontend-massimo/src/lib/diagnostic.ts:122`), et `API_SPEC.md` la titre déjà `(Massimo)`.
    Papa ne passe pas par ici — il lit `/apercu` et `/quizzes/{id}/relecture`.
    """
    student = get_default_student(db)
    return service.list_diagnostics(db, student)


@router.get("/quizzes/{quiz_id}", response_model=DiagnosticQuizOut)
def quiz_questions(
    quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(require_child)
) -> dict:
    """La route de PASSATION — celle de Massimo, et le docstring de sa sœur le disait déjà.

    `require_child` : `/quizzes/{id}/relecture`, juste en dessous, est `require_parent` et pose
    l'arbitrage — *deux routes pour deux rôles*. Celle-ci gate sur `validated` et retire la clé et
    l'explication ; elle n'a jamais rien eu à servir à Papa.
    """
    return service.get_quiz_for_taking(db, quiz_id)


@router.get("/quizzes/{quiz_id}/relecture", response_model=DiagnosticRelectureOut)
def quiz_relecture(
    quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(require_parent)
) -> dict:
    """Papa ouvre un diagnostic pour le relire — **y compris non relu** (ADR-0051 Décision 5).

    🔴 **La route de Papa, et c'est ce qui la rend nécessaire.** `GET /quizzes/{id}` juste au-dessus
    est celle de Massimo : elle gate sur `validated` et retire la clé et l'explication. Un `pending`
    y répond 404 — correct, et exactement ce qui rendait la relecture impossible.

    ⚠️ **Une route de plus plutôt que celle qui existe déjà, et c'est un arbitrage écrit.**
    `GET /api/quizzes/{id}` (module `quizzes`) sert la même forme sous `require_parent`, mais résout
    par `_mission_quiz_or_404`. L'élargir ouvrirait du même coup `regenerate`, `add_question` et
    `delete_quiz` aux diagnostics — **cinq gestes de production pour un besoin de lecture**, sans
    qu'une ligne de page change ni qu'un test rougisse. Alternative (a) de l'ADR-0051, écartée.

    Précédent exact : `GET /api/diagnostics/apercu`, née de la même cause (ADR-0043 §3) — *un gate
    ne se pose pas sans se demander qui perd la vue au passage.*
    """
    return service.get_quiz_for_relecture(db, quiz_id)


@router.post("/quizzes/{quiz_id}/submit", response_model=DiagnosticResultOut)
def submit(
    quiz_id: int,
    req: DiagnosticSubmitRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_child),
) -> dict:
    student = get_default_student(db)
    result = service.submit(db, student, quiz_id, req.answers, conditions=req.conditions)
    # Journal d'activité : une tentative de quiz, saveur « diagnostic ». Pas de dédupe — refaire
    # un diagnostic EST une activité, contrairement à un rafraîchissement de page.
    #
    # 🔴 Le score se lit sur LA PASSATION, plus dans `result` (ADR-0044 Décision 5) : la réponse
    # servie à Massimo ne le porte plus. Ce n'est pas un contournement de la décision — le journal
    # est de la **télémétrie interne**, lue par l'activité et le dashboard de Papa, jamais rendue à
    # l'enfant. Et la source est meilleure qu'avant : la passation écrite, pas une vue qui se
    # trouvait la transporter.
    #
    # 🔴 **CE `log_learning_event` DOIT RESTER DANS LE ROUTEUR** (ADR-0048, piège n° 3). Il est écrit
    # APRÈS le retour de `submit()` : c'est ce qui empêche le contraste avec l'historique de voir
    # l'événement de sa propre passation. Le déplacer dans le service — même « pour regrouper les
    # écritures » — casserait le contraste **sans toucher au contraste**, et sans qu'aucun test du
    # calcul ne rougisse. Un test-verrou tient cet ordre ; s'il tombe, c'est ici qu'il faut
    # regarder, pas dans `fiabilite.py`.
    passation = db.get(QuizAttempt, result["attempt_id"])
    log_learning_event(
        db,
        student_id=student.id,
        event_type=EVENT_QUIZ_ATTEMPTED,
        subject_id=db.get(Quiz, quiz_id).subject_id,
        payload={
            "quiz_id": quiz_id,
            "quiz_type": "diagnostic",
            "score_percent": passation.score_percent if passation is not None else None,
        },
    )
    db.commit()
    return result


@router.post("/quizzes/{quiz_id}/validate", response_model=DiagnosticValidationOut)
def validate(
    quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(require_parent)
) -> dict:
    """Papa laisse passer un diagnostic — il devient servable (ADR-0043).

    Convention `fiches` (`/{id}/validate`, `/{id}/reject`) reprise telle quelle : `reviewActions`
    n'est qu'une table d'aiguillage, et inventer une sixième convention pour une sixième famille
    est précisément ce que ce module refuse de faire.
    """
    quiz = service.set_validation(db, quiz_id, "validate")
    return {"quiz_id": quiz.id, "validation_status": quiz.validation_status}


@router.post("/quizzes/{quiz_id}/reject", response_model=DiagnosticValidationOut)
def reject(quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(require_parent)) -> dict:
    """Papa écarte un diagnostic. Il sort de la file **et** reste hors de portée de Massimo.

    Rien n'est effacé : ses questions et ses éventuelles tentatives restent (ADR-0014 Décision 3).
    """
    quiz = service.set_validation(db, quiz_id, "reject")
    return {"quiz_id": quiz.id, "validation_status": quiz.validation_status}


@router.get("/apercu", response_model=DiagnosticApercuOut)
def apercu(db: Session = Depends(get_db), _: dict = Depends(require_parent)) -> dict:
    """Le bandeau, le rail et les matières jamais mesurées — un seul appel (spec §Structure).

    🔴 **Route Papa, et c'est ce qui la rend nécessaire.** `list_diagnostics` est gaté sur
    `validated` depuis l'ADR-0043 : il ne peut plus montrer un diagnostic non relu. C'est voulu —
    c'est la route de Massimo — mais Papa doit voir exactement ce que Massimo ne voit pas encore.
    """
    return service.apercu(db, get_default_student(db))


@router.get("/mes-resultats/{attempt_id}", response_model=DiagnosticResultOut)
def mon_resultat(
    attempt_id: int, db: Session = Depends(get_db), _: dict = Depends(require_child)
) -> dict:
    """Massimo relit ce que ZETIS a retenu d'une de ses passations (ADR-0044 Décision 5).

    🔴 **Cette route n'existait pas, et son absence n'était pas un détail** : le résultat était
    montré à Massimo **une seule fois**, à la soumission, puis devenait inaccessible — `/results`
    et `/results/{id}` sont `require_parent`.

    **La route de Papa n'est PAS élargie**, et c'est une décision : son schéma
    (`DiagnosticResultSummary`) porte le docstring « Vue Papa » — score global, sévérité, statut de
    lacune. Élargir son rôle servirait à l'enfant un objet conçu pour l'analyse parentale. Deux
    publics, deux schémas (frontière `adr-0017 §3`).

    Même réponse que `POST /submit`, par la même fabrique : ce que Massimo relit est **exactement**
    ce qu'il a vu en terminant.
    """
    return service.resultat_eleve(db, get_default_student(db), attempt_id)


@router.post("/mes-resultats/{attempt_id}/explication", response_model=VerbalisationOut)
def explication(
    attempt_id: int,
    req: ExplicationIn,
    db: Session = Depends(get_db),
    _: dict = Depends(require_child),
) -> dict:
    """Massimo raconte comment il a trouvé une de ses bonnes réponses (ADR-0048 Décision 5).

    `require_child` comme les trois autres routes élève, et le même contrôle d'appartenance —
    `_passation_ou_404` est partagé : deux routes qui protègent la même ressource ne peuvent pas se
    permettre deux copies de la garde.

    🔴 **Ce que cette route N'EST PAS.** Elle n'entre pas dans le calcul du verdict, et son absence
    d'appel encore moins : compter le silence ferait de « Passer » un aveu, et de la question un
    piège. Elle ne donne **aucun XP** non plus — contrairement à l'explication d'ELI5 : ici le mot
    est attaché à une **mesure**, et payer pour lui en ferait une tâche qu'on remplit n'importe
    comment.

    ⚠️ **Zéro migration** : le texte se range dans `quiz_answers.answer_json`, déjà libre.
    """
    return service.enregistrer_explication(
        db, get_default_student(db), attempt_id, req.question_id, req.texte
    )


@router.get("/results", response_model=list[DiagnosticResultSummary])
def results(db: Session = Depends(get_db), _: dict = Depends(require_parent)) -> list[dict]:
    student = get_default_student(db)
    return service.latest_results(db, student)


@router.get("/results/{attempt_id}", response_model=DiagnosticResultSummary)
def result_detail(
    attempt_id: int, db: Session = Depends(get_db), _: dict = Depends(require_parent)
) -> dict:
    """Le détail d'UNE passation (ADR-0043 §Périmètre).

    Il n'en existait aucun : le panneau devait retrouver sa passation parmi les dix que `/results`
    sert, et au-delà de dix elle était inaccessible.
    """
    return service.result_detail(db, get_default_student(db), attempt_id)


@router.get("/portee", response_model=PorteeOut)
def portee(
    subject_id: int = Query(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_parent),
) -> dict:
    """La portée d'une matière : une notion, ses passations successives, son delta.

    ⚠️ `subject_id` est **obligatoire**. Une portée toutes matières confondues mélangerait des
    notions qui ne se comparent pas, et l'`adr-0028 §9` interdit déjà le classement de matières.
    """
    return service.portee(db, student=get_default_student(db), subject_id=subject_id)
