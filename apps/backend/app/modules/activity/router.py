"""Routes de l'activité : télémétrie (Massimo) et lectures de pilotage (Papa).

Séparation stricte des domaines (CLAUDE.md) : `telemetry_router` est la SEULE écriture cliente
du journal, réservée à l'espace de Massimo ; tout le reste est en lecture, réservé à Papa. Rien
de ce tracking ne remonte dans l'interface de Massimo — un enfant chronométré travaille pour le
chronomètre.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import get_db
from app.modules.activity import service
from app.modules.activity.events import (
    EVENT_PAGE_VIEWED,
    last_event_of_type,
    log_learning_event,
)
from app.modules.activity.schemas import (
    DashboardKpisOut,
    DayDetailOut,
    HeatmapOut,
    PageViewRequest,
    SessionsOut,
)
from app.modules.activity.timeutils import today_local
from app.modules.auth.deps import require_child, require_parent
from app.modules.eli5.service import get_default_student

telemetry_router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])

parent_router = APIRouter(
    prefix="/api/parent", tags=["activity"], dependencies=[Depends(require_parent)]
)


# --- Télémétrie de navigation (Massimo) --------------------------------------------------------


@telemetry_router.post("/pageview", status_code=status.HTTP_204_NO_CONTENT)
def pageview(
    body: PageViewRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_child),
) -> Response:
    """Enregistre un changement de page. Le SERVEUR horodate — aucun timestamp client accepté.

    Une route identique à la précédente est ignorée silencieusement (204 quand même) : un
    remontage de composant ne doit pas gonfler le journal. Le frontend dédupe aussi de son côté,
    ceinture et bretelles."""
    student = get_default_student(db)
    previous = last_event_of_type(db, student_id=student.id, event_type=EVENT_PAGE_VIEWED)
    if previous is not None and (previous.payload_json or {}).get("route") == body.route:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    log_learning_event(
        db,
        student_id=student.id,
        event_type=EVENT_PAGE_VIEWED,
        payload={"route": body.route},
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Lectures de pilotage (Papa) ---------------------------------------------------------------


@parent_router.get("/activity/heatmap", response_model=HeatmapOut)
def activity_heatmap(
    weeks: int = Query(default=26, ge=1, le=settings.activity_max_weeks),
    subject_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Minutes actives par jour (intensité de la heatmap) + décrochage.

    L'intensité est le TEMPS ACTIF, pas le nombre d'événements : une lecture de cours de 20 min
    vaut plus qu'un clic, et compter les événements biaiserait en faveur des révisions SRS."""
    return service.heatmap(
        db, student_id=get_default_student(db).id, weeks=weeks, subject_id=subject_id
    )


@parent_router.get("/activity/days/{day}", response_model=DayDetailOut)
def activity_day(
    day: str,
    subject_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Journal chronologique d'un jour (révisions déjà agrégées, minutes par événement)."""
    try:
        parsed = date.fromisoformat(day)
    except ValueError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Date invalide (format attendu : AAAA-MM-JJ)."
        ) from None
    return service.day_detail(
        db, student_id=get_default_student(db).id, day=parsed, subject_id=subject_id
    )


@parent_router.get("/activity/sessions", response_model=SessionsOut)
def activity_sessions(
    from_: str | None = Query(default=None, alias="from"),
    to: str | None = Query(default=None),
    subject_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    """Sessions reconstruites (seuil 15 min) sur une période BORNÉE SERVEUR.

    Le client choisit une fenêtre, pas l'ampleur du scan : une période inversée ou plus longue
    que `ACTIVITY_MAX_RANGE_DAYS` est ramenée dans les bornes au lieu d'être servie telle quelle."""
    today = today_local()
    try:
        date_to = date.fromisoformat(to) if to else today
        date_from = date.fromisoformat(from_) if from_ else date_to - timedelta(days=6)
    except ValueError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Période invalide (format attendu : AAAA-MM-JJ)."
        ) from None
    if date_from > date_to:
        date_from = date_to
    span = (date_to - date_from).days
    if span > settings.activity_max_range_days:
        date_from = date_to - timedelta(days=settings.activity_max_range_days)

    return service.sessions_range(
        db,
        student_id=get_default_student(db).id,
        date_from=date_from,
        date_to=date_to,
        subject_id=subject_id,
    )


@parent_router.get("/dashboard", response_model=DashboardKpisOut)
def dashboard(db: Session = Depends(get_db)) -> dict:
    """KPI de régularité en `{value, delta}` (semaine lun→dim Europe/Paris vs précédente).

    Surface NEUVE : la page Dashboard n'avait pas encore d'endpoint côté backend. Elle porte
    pour l'instant les 4 KPI de régularité du chantier « Activité » ; les KPI pédagogiques de la
    spec (lacunes ouvertes, notions consolidées, prochaine révision) restent servis par leurs
    routes existantes (`/gaps`, `/progress/summary`) et pourront rejoindre ce payload."""
    return service.dashboard_kpis(db, student_id=get_default_student(db).id)
