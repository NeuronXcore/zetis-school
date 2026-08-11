from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi import status as http_status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.db.models import Subject
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.gamification import service
from app.modules.gamification.schemas import GamificationSummary, XpHistoryOut
from app.modules.motivation import service as motivation_service

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("/summary", response_model=GamificationSummary)
def summary(db: Session = Depends(get_db), _: dict = Depends(get_current_user)) -> dict:
    """Synthèse de progression de l'élève : XP, niveau, badges, activité récente, régularité.

    La régularité est composée ICI et non dans `gamification.service` : ce service est le grand
    livre de l'économie XP (bas niveau), `motivation` lit tout le reste (haut niveau). Faire
    dépendre le premier du second inversait le sens des dépendances et créait un cycle
    `motivation → memory → gamification → motivation`. Le routeur, lui, est la racine de
    composition : il a le droit de connaître les deux."""
    student = get_default_student(db)
    return {
        **service.summary(db, student),
        "regularity": motivation_service.week_engagement(db, student_id=student.id),
    }


@router.get("/history", response_model=XpHistoryOut)
def history(
    days: int = Query(
        default=service.XP_HISTORY_DEFAULT_DAYS, ge=1, le=service.XP_HISTORY_MAX_DAYS
    ),
    subject: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    """Les jours où Massimo a gagné du XP — « Mon ciel » sur l'Accueil (addendum ADR-0024 §A/§B).

    **Les jours sans XP sont OMIS**, jamais renvoyés à zéro : la donnée d'absence n'existe pas.
    C'est ce qui distingue cette route de l'historique d'objectifs que `motivation` REFUSE de
    servir (« un historique d'objectifs manqués serait le streak déguisé ») — un objectif porte
    un attendu, un XP est un gain obtenu, et un jour sans gain n'est pas un jour raté.

    Fenêtre bornée serveur : le client choisit une fenêtre, pas l'ampleur du scan.

    `subject=<slug>` restreint à une matière (addendum ADR-0024 « page matière onglets »).
    **404 sur un slug inconnu**, jamais une série vide : une courbe vide se lirait « tu n'as rien
    fait ici » alors que la vraie réponse est « cette matière n'existe pas ». C'est la porte
    ouverte sur du vide que l'addendum du 2026-07-30 a déjà coûté une fois.
    """
    subject_id: int | None = None
    if subject is not None:
        found = db.scalar(select(Subject.id).where(Subject.slug == subject))
        if found is None:
            raise HTTPException(
                status_code=http_status.HTTP_404_NOT_FOUND,
                detail=f"Matière « {subject} » inconnue.",
            )
        subject_id = found

    return service.xp_history(db, get_default_student(db), days=days, subject_id=subject_id)
