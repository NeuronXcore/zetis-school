"""Routes du Journal de production (ADR-0034 §5-§6) — `require_parent`, LECTURE + VETO.

**Troisième routeur du module, et c'est délibéré.** `production/router.py` est documenté
« LECTURE SEULE » avec un test qui le garantit ; `runs_router.py` porte le préfixe
`/api/production/runs`. Le veto ÉCRIT, et le Journal a son propre préfixe : le poser ailleurs
affaiblirait un invariant par simple voisinage de fichier — l'ADR-0031 avait déjà tranché ainsi
pour `runs_router`.

**Aucune route élève.** Le Journal est une surface Papa, entièrement. Le veto est invisible de
Massimo (invariant V1) : lui exposer la moindre route lui apprendrait qu'un contenu peut
disparaître.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import journal, veto
from app.modules.production.schemas import (
    JournalOut,
    VetoPreviewOut,
    VetoRemovalOut,
)

router = APIRouter(
    prefix="/api/production/journal", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.get("", response_model=JournalOut)
def get_journal(limit: int = 20, offset: int = 0, db: Session = Depends(get_db)) -> dict:
    """Le flux des lots, du plus récent au plus ancien, avec le détail par pièce.

    ⚠️ Portée v1 : ce qui vient d'un LOT. Le Conseil de classe et la composition champion équipent
    hors lot — leurs pièces n'apparaissent pas, et la page le dit.
    """
    return journal.list_journal(db, limit=min(limit, 50), offset=max(offset, 0))


@router.get("/pieces/{kind}/{piece_id}/removal", response_model=VetoPreviewOut)
def removal_preview(kind: str, piece_id: int, db: Session = Depends(get_db)) -> dict:
    """Ce que le retrait emporterait, sans rien supprimer — la modale l'annonce AVANT le geste."""
    return veto.preview_removal(db, kind=kind, piece_id=piece_id)


@router.delete("/pieces/{kind}/{piece_id}", response_model=VetoRemovalOut)
def remove_piece(kind: str, piece_id: int, db: Session = Depends(get_db)) -> dict:
    """Retire une pièce non consommée. 409 si Massimo l'a déjà ouverte, avec son motif.

    Suppression FRANCHE : aucune trace, aucun signal à Massimo (invariant V1).
    """
    return veto.remove(db, kind=kind, piece_id=piece_id)
