"""Route du témoin de nouveauté en navigation (ADR-0030).

`student_router` uniquement : **aucune route Papa**. Un témoin de nouveauté ne s'applique pas à
l'interface Papa — Papa n'a pas de contenu qui « arrive » sans qu'il l'ait demandé ; ce que porte
sa sidebar est une file de VALIDATION, objet distinct (§7).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.news import service
from app.modules.news.schemas import NewsSummary

student_router = APIRouter(
    prefix="/api/student/news",
    tags=["news-student"],
    dependencies=[Depends(get_current_user)],
)


@student_router.get("/summary", response_model=NewsSummary)
def news_summary(db: Session = Depends(get_db)) -> dict:
    """Les témoins de nouveauté de la navigation Massimo — le compte vit dans `service.py`.

    Lecture seule et sans effet de bord : consulter le badge n'est pas le regarder. Le geste qui
    consomme une nouveauté est ailleurs, sur la surface qui montre réellement le contenu.
    """
    return service.news_summary(db, get_default_student(db).id)
