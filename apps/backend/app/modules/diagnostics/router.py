from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Quiz
from app.modules.activity.events import EVENT_QUIZ_ATTEMPTED, log_learning_event
from app.modules.ai import get_provider
from app.modules.ai.provider import LLMProvider
from app.modules.auth.deps import get_current_user, require_child, require_parent
from app.modules.diagnostics import service
from app.modules.diagnostics.schemas import (
    DiagnosticApercuOut,
    DiagnosticGenerateRequest,
    DiagnosticGenerateResponse,
    DiagnosticQuizListItem,
    DiagnosticQuizOut,
    DiagnosticResultOut,
    DiagnosticResultSummary,
    DiagnosticSubmitRequest,
    DiagnosticValidationOut,
    PorteeOut,
    SubjectOut,
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


@router.get("/subjects", response_model=list[SubjectOut])
def subjects(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
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
def quizzes(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> list[dict]:
    student = get_default_student(db)
    return service.list_diagnostics(db, student)


@router.get("/quizzes/{quiz_id}", response_model=DiagnosticQuizOut)
def quiz_questions(
    quiz_id: int, db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> dict:
    return service.get_quiz_for_taking(db, quiz_id)


@router.post("/quizzes/{quiz_id}/submit", response_model=DiagnosticResultOut)
def submit(
    quiz_id: int,
    req: DiagnosticSubmitRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_child),
) -> dict:
    student = get_default_student(db)
    result = service.submit(db, student, quiz_id, req.answers)
    # Journal d'activité : une tentative de quiz, saveur « diagnostic ». Pas de dédupe — refaire
    # un diagnostic EST une activité, contrairement à un rafraîchissement de page.
    log_learning_event(
        db,
        student_id=student.id,
        event_type=EVENT_QUIZ_ATTEMPTED,
        subject_id=db.get(Quiz, quiz_id).subject_id,
        payload={
            "quiz_id": quiz_id,
            "quiz_type": "diagnostic",
            "score_percent": result["score_percent"],
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
