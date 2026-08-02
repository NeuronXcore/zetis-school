"""Routes HTTP mindmaps — Slice A (ADR-0016).

Deux routeurs :
- `router` (Papa, `require_parent`) : génère / édite / régénère / supprime / valide ;
- `student_router` (`/api/student`, tout authentifié — filtrage serveur) : deck matière (cartes
  `validated`), lecture d'une carte, **reconstruction** (attempt + evaluate), marquage « vu ».

Le gate `validated` vit dans le service (une carte `pending` n'existe pas dans ce que Massimo
reçoit). L'évaluation de la reconstruction est **serveur et déterministe** (ADR-0016) : aucun
score ni XP n'est calculé côté client.
"""

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.ai import get_embedder, get_provider
from app.modules.ai.provider import EmbeddingProvider, LLMProvider
from app.modules.auth.deps import get_current_user, require_parent
from app.modules.eli5.service import get_default_student
from app.modules.mindmaps import service
from app.modules.mindmaps.schemas import (
    MindmapAttemptResult,
    MindmapGenerateRequest,
    MindmapListItem,
    MindmapOut,
    MindmapPilotageTree,
    MindmapReconstructionRequest,
    MindmapReconstructionResult,
    MindmapsSummaryOut,
    MindmapUpdateRequest,
)

router = APIRouter(
    prefix="/api/mindmaps", tags=["mindmaps"], dependencies=[Depends(require_parent)]
)

student_router = APIRouter(
    prefix="/api/student", tags=["mindmaps-student"], dependencies=[Depends(get_current_user)]
)


# ── Papa ────────────────────────────────────────────────────────────────────────


@router.post("/generate", response_model=MindmapOut, status_code=status.HTTP_201_CREATED)
def generate(
    req: MindmapGenerateRequest,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> dict:
    """Papa : génère une carte à partir d'une leçon validée (statut `pending`)."""
    try:
        row = service.generate_mindmap(db, provider, embedder, lesson_id=req.lesson_id)
    except service.MindmapGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Génération échouée : {exc}"
        ) from exc
    return service.mindmap_out(db, row)


@router.get("/pilotage/{subject_id}", response_model=MindmapPilotageTree)
def pilotage_tree(subject_id: int, db: Session = Depends(get_db)) -> dict:
    """Pilotage : leçons validées d'une matière + leurs cartes (leçons sans carte incluses)."""
    return service.pilotage_tree(db, subject_id)


@router.get("/lessons/{lesson_id}", response_model=list[MindmapOut])
def list_by_lesson(lesson_id: int, db: Session = Depends(get_db)) -> list[dict]:
    return [service.mindmap_out(db, m) for m in service.list_mindmaps_for_lesson(db, lesson_id)]


@router.get("/{mindmap_id}", response_model=MindmapOut)
def get_one(mindmap_id: int, db: Session = Depends(get_db)) -> dict:
    return service.mindmap_out(db, service.get_mindmap(db, mindmap_id))


@router.put("/{mindmap_id}", response_model=MindmapOut)
def update(mindmap_id: int, req: MindmapUpdateRequest, db: Session = Depends(get_db)) -> dict:
    """Remplace le `mindmap_json` (revalidé par le schéma) ; la carte repasse en `pending`."""
    return service.mindmap_out(
        db, service.update_mindmap_json(db, mindmap_id=mindmap_id, spec=req.mindmap_json)
    )


@router.post("/{mindmap_id}/regenerate", response_model=MindmapOut)
def regenerate(
    mindmap_id: int,
    db: Session = Depends(get_db),
    provider: LLMProvider = Depends(get_provider),
    embedder: EmbeddingProvider = Depends(get_embedder),
) -> dict:
    try:
        row = service.regenerate_mindmap(db, provider, embedder, mindmap_id=mindmap_id)
    except service.MindmapGenerationError as exc:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY, detail=f"Régénération échouée : {exc}"
        ) from exc
    return service.mindmap_out(db, row)


@router.post("/{mindmap_id}/evaluate-preview", response_model=MindmapReconstructionResult)
def evaluate_preview(
    mindmap_id: int, req: MindmapReconstructionRequest, db: Session = Depends(get_db)
) -> dict:
    """Aperçu Papa : même barème que `/evaluate`, **sans persistance ni XP** (addendum §C).

    Sert les cartes de **tous** statuts (Papa prévisualise du `pending`, que les routes élève
    cachent). `failed_attempts` du payload est ignoré : il ne sert qu'au calcul d'XP, absent ici.
    """
    return service.evaluate_preview(db, mindmap_id, req.placements)


@router.post("/{mindmap_id}/validate", response_model=MindmapOut)
def validate(mindmap_id: int, db: Session = Depends(get_db)) -> dict:
    """Papa : `pending` → `validated` (la carte devient visible côté Massimo)."""
    return service.mindmap_out(db, service.validate_mindmap(db, mindmap_id))


@router.delete("/{mindmap_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete(mindmap_id: int, db: Session = Depends(get_db)) -> Response:
    service.delete_mindmap(db, mindmap_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ── Massimo (read-only + reconstruction, gate `validated` dans le service) ───────


@student_router.get("/mindmaps/summary", response_model=MindmapsSummaryOut)
def student_mindmaps_summary(db: Session = Depends(get_db)) -> dict:
    """Grille de decks : compteur de cartes validées par matière (année active). Sans « Nouveau »."""
    return service.mindmaps_summary(db)


@student_router.get("/subjects/{subject_slug}/mindmaps", response_model=list[MindmapListItem])
def student_subject_mindmaps(subject_slug: str, db: Session = Depends(get_db)) -> list[dict]:
    """Deck : cartes validées d'une matière (leçons validées de l'année active). Route neutre."""
    return service.list_subject_mindmaps(db, subject_slug)


# Déclaré APRÈS `/mindmaps/summary` : sinon « summary » serait capté comme un {mindmap_id} (→ 422).
@student_router.get("/mindmaps/{mindmap_id}", response_model=MindmapOut)
def student_mindmap(mindmap_id: int, db: Session = Depends(get_db)) -> dict:
    """La carte (404 si non `validated`, sans fuite des brouillons)."""
    return service.get_student_mindmap(db, mindmap_id)


@student_router.post("/mindmaps/{mindmap_id}/evaluate", response_model=MindmapReconstructionResult)
def student_evaluate(
    mindmap_id: int, req: MindmapReconstructionRequest, db: Session = Depends(get_db)
) -> dict:
    """Évaluation SERVEUR déterministe (sans persistance ni XP) — « vérifie ma carte »."""
    return service.evaluate_reconstruction(db, mindmap_id, req.placements)


@student_router.post("/mindmaps/{mindmap_id}/attempts", response_model=MindmapAttemptResult)
def student_attempt(
    mindmap_id: int, req: MindmapReconstructionRequest, db: Session = Depends(get_db)
) -> dict:
    """Tentative de reconstruction : score SERVEUR + XP serveur (réduit par les échecs), persistée."""
    return service.record_attempt(
        db, get_default_student(db), mindmap_id, req.placements, failed_attempts=req.failed_attempts
    )


@student_router.post("/mindmaps/{mindmap_id}/seen", status_code=status.HTTP_204_NO_CONTENT)
def student_mindmap_seen(mindmap_id: int, db: Session = Depends(get_db)) -> Response:
    """Marque la carte vue — PERSISTÉ (`mindmap_views`) depuis l'ADR-0030 §4.

    Ce commentaire disait « placeholder Slice A — vues non persistées » **quatre mois après** que
    la table existe. Il a coûté une décision : le cadrage d'autonomisation en a conclu que les
    mindmaps n'émettaient rien à la consultation, et a inventé une dette qui n'existait pas.
    Un commentaire périmé n'est pas neutre — il est cru.
    """
    service.mark_seen(db, get_default_student(db).id, mindmap_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
