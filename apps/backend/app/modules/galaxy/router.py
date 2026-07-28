"""Routes ZETIS Galaxy (ADR-0024) — surface ÉLÈVE uniquement.

Lecture seule, tout utilisateur authentifié (le rôle `child` passe) : le service ne sert
que du validé. Ces routes ne sont PAS servies à Papa et ne réutilisent ni le module
`progress` ni le module `production`, tous deux `require_parent` (ADR-0002).
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import get_current_user
from app.modules.galaxy import service
from app.modules.galaxy.schemas import (
    GalaxyConstellationOut,
    GalaxyFullGraphOut,
    GalaxyNotionOut,
    GalaxyOverviewOut,
    GalaxyTimelineOut,
)

student_router = APIRouter(
    prefix="/api/student/galaxy",
    tags=["galaxy-student"],
    dependencies=[Depends(get_current_user)],
)


@student_router.get("", response_model=GalaxyOverviewOut)
def galaxy_overview(db: Session = Depends(get_db)) -> dict:
    """Vue d'ensemble : une constellation par matière, avec son COMPTE d'étoiles allumées."""
    return service.overview(db)


# ⚠️ Les routes littérales sont déclarées AVANT `/{subject_slug}` : sans cela, « notion »,
# « all » et « timeline » seraient capturés comme des slugs de matière et ne seraient
# jamais atteints.
@student_router.get("/all", response_model=GalaxyFullGraphOut)
def galaxy_full(db: Session = Depends(get_db)) -> dict:
    """Toutes les matières dans un seul graphe (Accueil) — `root` → matières → chapitres → notions."""
    return service.full_graph(db)


@student_router.get("/timeline", response_model=GalaxyTimelineOut)
def galaxy_timeline(db: Session = Depends(get_db)) -> dict:
    """Frise de progression, MONOTONE : les notions comptées au jour de leur première fois."""
    return service.timeline(db)


@student_router.get("/notion/{skill_id}", response_model=GalaxyNotionOut)
def galaxy_notion(skill_id: int, db: Session = Depends(get_db)) -> dict:
    """Panneau d'actions d'une notion — toute la panoplie, avec sa disponibilité."""
    return service.notion_panel(db, skill_id)


@student_router.get("/{subject_slug}", response_model=GalaxyConstellationOut)
def galaxy_constellation(subject_slug: str, db: Session = Depends(get_db)) -> dict:
    """Constellation d'une matière : amas (chapitres), étoiles (notions), arêtes de structure."""
    return service.constellation(db, subject_slug)
