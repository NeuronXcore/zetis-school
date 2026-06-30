from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.subjects import service
from app.modules.subjects.schemas import (
    ChapterCreate,
    ChapterOut,
    SubjectCreate,
    SubjectDetailOut,
    SubjectOut,
    ThemeCreate,
    ThemeOut,
)

# Matières & programmes (Papa) : Subject → Theme → Chapter.
router = APIRouter(prefix="/api/subjects", tags=["subjects"])


@router.get("", response_model=list[SubjectOut])
def list_subjects(
    db: Session = Depends(get_db), _: dict = Depends(get_current_user)
) -> list[dict]:
    return service.list_subjects(db)


@router.post("", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(
    payload: SubjectCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.create_subject(db, payload)


@router.get("/{subject_id}", response_model=SubjectDetailOut)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.get_subject_detail(db, subject_id)


@router.post(
    "/{subject_id}/themes", response_model=ThemeOut, status_code=status.HTTP_201_CREATED
)
def create_theme(
    subject_id: int,
    payload: ThemeCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.create_theme(db, subject_id, payload)


@router.post(
    "/themes/{theme_id}/chapters",
    response_model=ChapterOut,
    status_code=status.HTTP_201_CREATED,
)
def create_chapter(
    theme_id: int,
    payload: ChapterCreate,
    db: Session = Depends(get_db),
    _: dict = Depends(get_current_user),
) -> dict:
    return service.create_chapter(db, theme_id, payload)
