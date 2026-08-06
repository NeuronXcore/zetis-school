"""Routes HTTP fiches — Slice A (ADR-0015).

Deux routeurs :
- `router` (Papa, `require_parent`) : génère / édite / régénère / supprime / valide ;
- `student_router` (`/api/student`, tout authentifié — filtrage serveur) : deck matière (fiches
  `validated`), lecture d'une fiche, marquage « vu ». Le gate `validated` vit dans le service
  (une fiche `pending` n'existe pas dans ce que Massimo reçoit).
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.activity.events import EVENT_FICHE_VIEWED, log_view_once_per_day
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student
from app.modules.fiches import service
from app.modules.fiches.schemas import (
    FicheGenerateRequest,
    FicheListItem,
    FicheOut,
    FichePilotageTree,
    FichesSummaryOut,
    FicheUpdateRequest,
)
from app.modules.ai import travaux
from app.modules.ai.schemas import TravailAccepteOut
from app.modules.subjects.resolver import subject_id_for_lesson

router = APIRouter(prefix="/api/fiches", tags=["fiches"], dependencies=[Depends(require_parent)])

student_router = APIRouter(
    prefix="/api/student", tags=["fiches-student"], dependencies=[Depends(get_current_user)]
)


# ── Papa ────────────────────────────────────────────────────────────────────────


@router.post(
    "/generate", response_model=TravailAccepteOut, status_code=status.HTTP_202_ACCEPTED
)
def generate(req: FicheGenerateRequest, db: Session = Depends(get_db)) -> dict:
    """Papa : demande une fiche. **202 — acceptée, pas exécutée** (ADR-0041 §4).

    Cette route tenait la requête HTTP pendant une génération LLM locale. La fiche se lit dans
    `output.fiche_id` quand le travail est `succeeded` ; l'avancement, dans `/production/activity`
    comme tout le reste.

    ⚠️ **Le `502` sur `FicheGenerationError` disparaît d'ici**, et ce n'est pas une perte : l'échec
    est désormais porté par le travail (`error`), donc il **survit à la fermeture de l'onglet** et
    reste affiché jusqu'à acquittement (§8). Un `502` ne durait que le temps d'un toast.

    ⚠️ **Le gate `validated` est rejoué ici, avant d'enfiler.** La file diffère le TRAVAIL, jamais
    le VERDICT sur la demande — une leçon non validée se refuse au clic (`409`), pas en silence
    deux minutes plus tard. Le service le refait de son côté : entre le clic et l'exécution, la
    leçon a pu être dévalidée.
    """
    service._validated_lesson_or_409(db, req.lesson_id)
    return travaux.enfiler(db, job_type="fiche_generate", payload={"lesson_id": req.lesson_id})


@router.get("/pilotage/{subject_id}", response_model=FichePilotageTree)
def pilotage_tree(subject_id: int, db: Session = Depends(get_db)) -> dict:
    """Pilotage : leçons validées d'une matière + leurs fiches (leçons sans fiche incluses)."""
    return service.pilotage_tree(db, subject_id)


@router.get("/lessons/{lesson_id}", response_model=list[FicheOut])
def list_by_lesson(lesson_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return [service.fiche_out(db, f) for f in service.list_fiches_for_lesson(db, lesson_id)]


@router.get("/{fiche_id}", response_model=FicheOut)
def get_one(fiche_id: int, db: Session = Depends(get_db)) -> dict:
    return service.fiche_out(db, service.get_fiche(db, fiche_id))


@router.put("/{fiche_id}", response_model=FicheOut)
def update(fiche_id: int, req: FicheUpdateRequest, db: Session = Depends(get_db)) -> dict:
    """Remplace le spec (revalidé par le schéma) ; la fiche repasse en `pending`."""
    return service.fiche_out(db, service.update_fiche_spec(db, fiche_id=fiche_id, spec=req.spec))


@router.post(
    "/{fiche_id}/regenerate",
    response_model=TravailAccepteOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def regenerate(fiche_id: int, db: Session = Depends(get_db)) -> dict:
    """202 — voir `generate`. La fiche régénérée garde son id.

    Le gate est rejoué ici aussi (404 sur la fiche, 409 sur sa leçon) — voir `generate`.
    """
    service._validated_lesson_or_409(db, service._fiche_or_404(db, fiche_id).lesson_id)
    return travaux.enfiler(db, job_type="fiche_regenerate", payload={"fiche_id": fiche_id})


@router.post("/{fiche_id}/validate", response_model=FicheOut)
def validate(fiche_id: int, db: Session = Depends(get_db)) -> dict:
    """Papa : `pending` → `validated` (la fiche devient visible côté Massimo)."""
    return service.fiche_out(db, service.validate_fiche(db, fiche_id))


@router.post("/{fiche_id}/reject", response_model=FicheOut)
def reject(fiche_id: int, db: Session = Depends(get_db)) -> dict:
    """Papa : `pending` → `rejected` (la fiche n'atteindra pas Massimo, sans être supprimée)."""
    return service.fiche_out(db, service.reject_fiche(db, fiche_id))


@router.delete("/{fiche_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(fiche_id: int, db: Session = Depends(get_db)) -> Response:
    service.delete_fiche(db, fiche_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Massimo (read-only, gate `validated` dans le service) ───────────────────────


@student_router.get("/fiches/summary", response_model=FichesSummaryOut)
def student_fiches_summary(db: Session = Depends(get_db)) -> dict:
    """Grille de decks : compteur de fiches validées + « Nouveau » par matière (année active)."""
    return service.fiches_summary(db)


@student_router.get("/subjects/{subject_slug}/fiches", response_model=list[FicheListItem])
def student_subject_fiches(subject_slug: str, db: Session = Depends(get_db)) -> list[dict]:
    """Deck : fiches validées d'une matière (leçons validées de l'année active). Route neutre."""
    return service.list_subject_fiches(db, subject_slug)


# Déclaré APRÈS `/fiches/summary` : sinon « summary » serait capté comme un {fiche_id} (→ 422).
@student_router.get("/fiches/{fiche_id}", response_model=FicheOut)
def student_fiche(fiche_id: int, db: Session = Depends(get_db)) -> dict:
    """La fiche (404 si non `validated`, sans fuite des brouillons)."""
    fiche = service.get_student_fiche(db, fiche_id)
    # Journal d'activité : au plus une fois par (élève, fiche, jour Paris). Après le service,
    # pour qu'une fiche non validée (404) n'entre jamais dans le journal.
    log_view_once_per_day(
        db,
        student_id=get_default_student(db).id,
        event_type=EVENT_FICHE_VIEWED,
        payload_key="fiche_id",
        payload_value=fiche_id,
        subject_id=subject_id_for_lesson(db, fiche["lesson_id"]),
        payload={"fiche_id": fiche_id},
    )
    db.commit()
    return fiche


@student_router.post("/fiches/{fiche_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def student_fiche_seen(fiche_id: int, db: Session = Depends(get_db)) -> Response:
    """Marque la fiche vue (idempotent) — retrait futur du badge « Nouveau »."""
    service.mark_seen(db, get_default_student(db).id, fiche_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
