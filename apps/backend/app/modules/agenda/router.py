"""Routes HTTP agenda (ADR-0025, Lot 1) — deux préfixes, deux schémas, jamais mélangés.

- `student_router` (`/api/student/agenda`, tout authentifié) : bande glissante, « ce qui
  arrive », coche et masquage. La saisie est derrière le verrou de phase (§10).
- `router` (`/api/agenda`, `require_parent`) : saisie en lot, correction, note privée,
  archivage. **Aucune route ne permet d'écrire `done_at`** — l'affordance n'existe pas, et le
  service refuse en 403 si on la cherche.
"""

from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.agenda import service
from app.modules.agenda.schemas import (
    AgendaItemParentCreate,
    AgendaItemParentPatch,
    AgendaItemPilotOut,
    AgendaItemStudentCreate,
    AgendaItemStudentOut,
    AgendaItemStudentPatch,
    AgendaItemsParentCreate,
    AgendaNoteRequest,
    AgendaSettingsOut,
    AgendaSettingsRequest,
    AgendaWeekOut,
    UpcomingItemOut,
)
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student

student_router = APIRouter(
    prefix="/api/student/agenda",
    tags=["agenda-student"],
    dependencies=[Depends(get_current_user)],
)

router = APIRouter(
    prefix="/api/agenda", tags=["agenda"], dependencies=[Depends(require_parent)]
)


# ── Massimo ─────────────────────────────────────────────────────────────────────


@student_router.get("/week", response_model=AgendaWeekOut)
def student_week(
    anchor: date | None = Query(default=None), db: Session = Depends(get_db)
) -> dict:
    """Bande glissante de 7 jours centrée sur l'ancre (défaut : aujourd'hui)."""
    return service.week(db, student_id=get_default_student(db).id, anchor=anchor)


@student_router.get("/upcoming", response_model=list[UpcomingItemOut])
def student_upcoming(db: Session = Depends(get_db)) -> list[dict]:
    """Contrôles et rendus à venir : liste bornée, jamais une jauge d'urgence."""
    return service.upcoming(db, student_id=get_default_student(db).id)


@student_router.get("/items", response_model=list[AgendaItemStudentOut])
def student_items(
    from_: date = Query(alias="from"),
    to: date = Query(...),
    db: Session = Depends(get_db),
) -> list[dict]:
    return service.list_student_items(
        db, student_id=get_default_student(db).id, first=from_, last=to
    )


@student_router.post(
    "/items", response_model=AgendaItemStudentOut, status_code=status.HTTP_201_CREATED
)
def student_create(
    req: AgendaItemStudentCreate, db: Session = Depends(get_db)
) -> dict:
    """Phase 1 seulement : 403 tant que `AGENDA_STUDENT_ENTRY_ENABLED` est fermé."""
    student = get_default_student(db)
    item = service.create_student_item(
        db, student_id=student.id, data=req.model_dump(exclude_unset=True)
    )
    return service.student_out_one(db, item, student_id=get_default_student(db).id)


@student_router.patch("/items/{item_id}", response_model=AgendaItemStudentOut)
def student_patch(
    item_id: int, req: AgendaItemStudentPatch, db: Session = Depends(get_db)
) -> dict:
    item = service.patch_student_item(
        db,
        student_id=get_default_student(db).id,
        item_id=item_id,
        data=req.model_dump(exclude_unset=True),
    )
    return service.student_out_one(db, item, student_id=get_default_student(db).id)


@student_router.post("/items/{item_id}/done", response_model=AgendaItemStudentOut)
def student_done(item_id: int, db: Session = Depends(get_db)) -> dict:
    """Massimo coche — y compris un item saisi par Papa. Aucun XP (§3)."""
    item = service.set_done(
        db, student_id=get_default_student(db).id, item_id=item_id, done=True
    )
    return service.student_out_one(db, item, student_id=get_default_student(db).id)


@student_router.post("/items/{item_id}/undone", response_model=AgendaItemStudentOut)
def student_undone(item_id: int, db: Session = Depends(get_db)) -> dict:
    item = service.set_done(
        db, student_id=get_default_student(db).id, item_id=item_id, done=False
    )
    return service.student_out_one(db, item, student_id=get_default_student(db).id)


@student_router.post("/items/{item_id}/dismiss", response_model=AgendaItemStudentOut)
def student_dismiss(item_id: int, db: Session = Depends(get_db)) -> dict:
    """Masque un item, y compris de Papa (le masquage reste visible côté pilotage)."""
    item = service.dismiss(db, student_id=get_default_student(db).id, item_id=item_id)
    return service.student_out_one(db, item, student_id=get_default_student(db).id)


@student_router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
def student_mark_seen(db: Session = Depends(get_db)) -> None:
    """Massimo a regardé ce qui est arrivé — pose le high-water mark (addendum §12.3).

    Appelée depuis l'ouverture de `/agenda` ET depuis le rendu du bandeau d'Accueil : les deux
    surfaces où Massimo lit ce qui vient du collège.

    Ne renvoie RIEN — pas même l'horodatage écrit. Le client n'a aucun usage du watermark, et le
    servir en ferait une donnée lisible, donc traçable ; le témoin sort en NOMBRE (via
    `/api/student/news/summary`), jamais en date.

    Route élève uniquement : aucune route Papa n'écrit ce watermark.
    """
    service.mark_agenda_seen(db, student_id=get_default_student(db).id)


# ── Papa ────────────────────────────────────────────────────────────────────────


# Déclaré AVANT `/items/{item_id}` n'est pas nécessaire (préfixe distinct), mais garder les
# réglages en tête de section évite qu'ils se perdent au milieu du CRUD.
@router.get("/settings", response_model=AgendaSettingsOut)
def pilot_settings(db: Session = Depends(get_db)) -> dict:
    return {"student_entry_enabled": service.student_entry_enabled(db)}


@router.put("/settings", response_model=AgendaSettingsOut)
def pilot_set_settings(req: AgendaSettingsRequest, db: Session = Depends(get_db)) -> dict:
    """Ouverture (ou fermeture) de la saisie élève — **geste explicite de Papa** (ADR-0025 §10).

    Aucune bascule automatique n'existe côté serveur : faire dépendre ce droit d'un seuil de
    coches observé transformerait la page en surveillance."""
    enabled = service.set_student_entry_enabled(db, enabled=req.student_entry_enabled)
    return {"student_entry_enabled": enabled}


@router.get("/items", response_model=list[AgendaItemPilotOut])
def pilot_items(
    from_: date = Query(alias="from"),
    to: date = Query(...),
    db: Session = Depends(get_db),
) -> list[dict]:
    """Grille de pilotage : archivés inclus (marqués par `dismissed_at`)."""
    return service.list_pilot_items(
        db, student_id=get_default_student(db).id, first=from_, last=to
    )


@router.post(
    "/items", response_model=list[AgendaItemPilotOut], status_code=status.HTTP_201_CREATED
)
def pilot_create(req: AgendaItemsParentCreate, db: Session = Depends(get_db)) -> list[dict]:
    """Saisie en lot : Papa relève l'ENT du dimanche soir en une requête."""
    items = service.create_parent_items(
        db,
        student_id=get_default_student(db).id,
        items=[item.model_dump(exclude_unset=True) for item in req.items],
    )
    subjects = service.subjects_index(db)
    return [service.pilot_out(item, subjects) for item in items]


@router.post(
    "/items/single", response_model=AgendaItemPilotOut, status_code=status.HTTP_201_CREATED
)
def pilot_create_single(req: AgendaItemParentCreate, db: Session = Depends(get_db)) -> dict:
    """Confort : un item unique, sans envelopper dans `{items: [...]}`."""
    items = service.create_parent_items(
        db,
        student_id=get_default_student(db).id,
        items=[req.model_dump(exclude_unset=True)],
    )
    return service.pilot_out(items[0], service.subjects_index(db))


@router.patch("/items/{item_id}", response_model=AgendaItemPilotOut)
def pilot_patch(
    item_id: int, req: AgendaItemParentPatch, db: Session = Depends(get_db)
) -> dict:
    """Correction par Papa. `edited_by_parent_at` est posé par le service, pas par le client."""
    item = service.patch_parent_item(
        db,
        student_id=get_default_student(db).id,
        item_id=item_id,
        data=req.model_dump(exclude_unset=True),
    )
    return service.pilot_out(item, service.subjects_index(db))


@router.put("/items/{item_id}/note", response_model=AgendaItemPilotOut)
def pilot_note(item_id: int, req: AgendaNoteRequest, db: Session = Depends(get_db)) -> dict:
    item = service.set_note(
        db, student_id=get_default_student(db).id, item_id=item_id, note=req.parent_note
    )
    return service.pilot_out(item, service.subjects_index(db))


@router.delete("/items/{item_id}", response_model=AgendaItemPilotOut)
def pilot_delete(item_id: int, db: Session = Depends(get_db)) -> dict:
    """ARCHIVAGE, pas suppression : la ligne reste en base (§2c). D'où un 200 avec l'item
    archivé, et non un 204 — la réponse dit ce qui s'est réellement passé."""
    item = service.archive(db, student_id=get_default_student(db).id, item_id=item_id)
    return service.pilot_out(item, service.subjects_index(db))
