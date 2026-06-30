from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.eli5.service import get_default_student
from app.modules.memory.service import get_due_cards

router = APIRouter(prefix="/api/memory", tags=["memory"])


class DueCard(BaseModel):
    id: int
    skill_id: int
    front_markdown: str
    interval_days: int


@router.get("/reviews/due", response_model=list[DueCard])
def reviews_due(
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> list[DueCard]:
    student = get_default_student(db)
    cards = get_due_cards(db, student_id=student.id)
    return [
        DueCard(
            id=c.id, skill_id=c.skill_id, front_markdown=c.front_markdown, interval_days=c.interval_days
        )
        for c in cards
    ]
