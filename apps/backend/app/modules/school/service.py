"""Services du CRUD années scolaires — cadre temporel uniquement (ADR-0009 §9).

Règles métier serveur, testées (`test_school_years_api.py`) :
- une seule année `active` : activer une année archive l'ancienne active,
  dans la même transaction ;
- `level` immuable et `mode` invisible : tenus par les schémas (`extra="forbid"`) ;
- pas de suppression : les FK pédagogiques (chapitres, missions, historique) en dépendent.
"""

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Chapter, SchoolYear, SchoolYearSubject, StudentProfile
from app.modules.school.schemas import SchoolYearCreate, SchoolYearPatch


def _versions_by_year(db: Session) -> dict[int, str]:
    """Version de programme portée par les chapitres générés, par année (ADR-0009 §5).

    Dérivée en lecture — `min` = représentant déterministe si plusieurs versions
    coexistent (cas transitoire d'une réforme en cours)."""
    rows = db.execute(
        select(SchoolYearSubject.school_year_id, func.min(Chapter.program_version))
        .join(Chapter, Chapter.school_year_subject_id == SchoolYearSubject.id)
        .where(Chapter.program_version.is_not(None))
        .group_by(SchoolYearSubject.school_year_id)
    ).all()
    return {year_id: version for year_id, version in rows}


def year_out(year: SchoolYear, program_version: str | None) -> dict:
    # Sérialisation explicite : `mode` (déprécié, ADR-0009 §4) ne sort jamais d'ici.
    return {
        "id": year.id,
        "label": year.label,
        "level": year.level,
        "starts_on": year.starts_on,
        "ends_on": year.ends_on,
        "status": year.status,
        "program_version": program_version,
    }


def list_years(db: Session) -> list[dict]:
    years = list(db.scalars(select(SchoolYear).order_by(SchoolYear.id.desc())))
    versions = _versions_by_year(db)
    return [year_out(y, versions.get(y.id)) for y in years]


def create_year(db: Session, payload: SchoolYearCreate) -> dict:
    # MVP mono-élève : premier `StudentProfile` (même convention que capsules/eli5).
    student_id = db.scalar(select(StudentProfile.id).order_by(StudentProfile.id))
    if student_id is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Aucun profil élève configuré."
        )
    year = SchoolYear(
        student_id=student_id,
        label=payload.label,
        level=payload.level,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        status="draft",
    )
    db.add(year)
    db.commit()
    db.refresh(year)
    return year_out(year, None)


def update_year(db: Session, year_id: int, payload: SchoolYearPatch) -> dict:
    year = db.get(SchoolYear, year_id)
    if year is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Année scolaire introuvable."
        )
    fields = payload.model_fields_set
    if "label" in fields and payload.label is not None:
        year.label = payload.label
    if "starts_on" in fields:
        year.starts_on = payload.starts_on
    if "ends_on" in fields:
        year.ends_on = payload.ends_on
    if "status" in fields and payload.status is not None and payload.status != year.status:
        if payload.status == "active":
            # Une seule année active : l'ancienne passe `archived`, MÊME transaction
            # (le commit unique ci-dessous couvre les deux écritures).
            for other in db.scalars(
                select(SchoolYear).where(
                    SchoolYear.status == "active", SchoolYear.id != year.id
                )
            ):
                other.status = "archived"
        year.status = payload.status
    db.commit()
    db.refresh(year)
    return year_out(year, _versions_by_year(db).get(year.id))
