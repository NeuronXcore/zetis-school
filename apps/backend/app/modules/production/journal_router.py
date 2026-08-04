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

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.base import get_db
from app.modules.auth.deps import require_parent
from app.modules.production import journal, journal_filters, veto
from app.modules.production.schemas import (
    JournalOut,
    VetoPreviewOut,
    VetoRemovalOut,
)

router = APIRouter(
    prefix="/api/production/journal", tags=["production"], dependencies=[Depends(require_parent)]
)


@router.get("", response_model=JournalOut)
def get_journal(
    limit: int = 20,
    offset: int = 0,
    subject_id: Annotated[list[int] | None, Query()] = None,
    chapter_id: Annotated[list[int] | None, Query()] = None,
    depuis: date | None = None,
    jusqu_a: date | None = None,
    statut: Annotated[list[str] | None, Query()] = None,
    mode: Annotated[list[str] | None, Query()] = None,
    piece: Annotated[list[str] | None, Query()] = None,
    tri: str = "date",
    sens: str = "desc",
    db: Session = Depends(get_db),
) -> dict:
    """Le flux des lots, filtré et trié sur TOUTE l'histoire, puis paginé.

    ⚠️ Portée v1 : ce qui vient d'un LOT. Le Conseil de classe et la composition champion équipent
    hors lot — leurs pièces n'apparaissent pas, et la page le dit.

    ⚠️ **Aucun filtre par défaut.** Sans paramètre, la réponse est exactement celle d'avant : un
    journal qui s'ouvrirait déjà filtré cacherait son contenu à celui qui a oublié qu'il l'avait
    filtré, et c'est le mode d'échec nommé par l'addendum.

    Les valeurs inconnues sont **ignorées**, jamais rejetées : un 422 sur un vocabulaire d'écran
    ferait tomber la page entière pour une pilule mal orthographiée dans une URL partagée.
    """
    filtre = journal_filters.JournalFiltre(
        subject_ids=tuple(subject_id or ()),
        chapter_ids=tuple(chapter_id or ()),
        depuis=depuis,
        jusqu_a=jusqu_a,
        statuts=tuple(s for s in (statut or ()) if s in journal_filters.STATUTS),
        modes=tuple(m for m in (mode or ()) if m in journal_filters.MODES),
        pieces=tuple(p for p in (piece or ()) if p in journal.KINDS),
        tri=tri if tri in journal_filters.TRIS else "date",
        descendant=sens != "asc",
    )
    return journal.list_journal(
        db, limit=min(limit, 50), offset=max(offset, 0), filtre=filtre
    )


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
