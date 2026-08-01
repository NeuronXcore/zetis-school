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
    SubjectPanoplyOut,
)

student_router = APIRouter(
    prefix="/api/student/galaxy",
    tags=["galaxy-student"],
    dependencies=[Depends(get_current_user)],
)

# L'index de notions n'est pas servi sous `/galaxy` : il vit à côté de
# `/api/student/subjects/{slug}/notions` (module `curriculum`), là où le client va chercher ce
# qui concerne une matière. Le CALCUL, lui, reste dans `galaxy` — c'est là qu'habite le prédicat
# de disponibilité, et il ne doit exister qu'une fois (addendum ADR-0024).
subjects_router = APIRouter(
    prefix="/api/student/subjects",
    tags=["galaxy-student"],
    dependencies=[Depends(get_current_user)],
)


@subjects_router.get("/{subject_slug}/panoply", response_model=SubjectPanoplyOut)
def subject_panoply(subject_slug: str, db: Session = Depends(get_db)) -> dict:
    """Index des notions d'une matière : chapitres validés → notions, chacune avec sa panoplie.

    404 si la matière est inconnue ou hors année active ; `chapters: []` si rien n'est validé.
    """
    return service.subject_panoply(db, subject_slug)


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


@student_router.get(
    "/timeline",
    response_model=GalaxyTimelineOut,
    # `skills` DISPARAÎT de la réponse quand il n'est pas demandé, au lieu d'y figurer à `null` :
    # l'ADR-0029 promet que les consommateurs actuels de la frise ne voient aucun changement de
    # charge utile, et un test existant vérifie l'objet exact.
    response_model_exclude_none=True,
)
def galaxy_timeline(with_skills: bool = False, db: Session = Depends(get_db)) -> dict:
    """Frise de progression, MONOTONE : les notions comptées au jour de leur première fois.

    `with_skills=true` (ADR-0029) ajoute `skills` — quelle notion s'est allumée quel jour, pour
    le rejeu animé. C'est le MÊME calcul : la requête produisait déjà le `skill_id`, on cessait
    simplement de le renvoyer. Opt-in, pour ne pas alourdir la frise qui n'en a pas besoin.
    """
    return service.timeline(db, with_skills=with_skills)


@student_router.get("/notion/{skill_id}", response_model=GalaxyNotionOut)
def galaxy_notion(skill_id: int, db: Session = Depends(get_db)) -> dict:
    """Panneau d'actions d'une notion — toute la panoplie, avec sa disponibilité."""
    return service.notion_panel(db, skill_id)


@student_router.get("/{subject_slug}", response_model=GalaxyConstellationOut)
def galaxy_constellation(subject_slug: str, db: Session = Depends(get_db)) -> dict:
    """Constellation d'une matière : amas (chapitres), étoiles (notions), arêtes de structure."""
    return service.constellation(db, subject_slug)
