"""Journal de production (ADR-0031 §4) — un LOT, pas une pièce.

`trigger` vit ici et nulle part ailleurs : un même déclencheur (« contrôle jeudi sur le chapitre
4 ») engendre un cours, trois fiches, deux quiz et huit cartes. Le poser sur chaque ligne de
contenu, c'est le recopier sur cinq tables et le voir diverger au premier correctif.

**Le modèle anticipe, le code n'anticipe pas.** Toutes les valeurs de `trigger` et de
`authorized_by` sont légales ; seules `manual` et `parent_direct` sont **émises** aujourd'hui. Un
test-verrou interdit les autres tant que leur ADR n'existe pas — patron `content_kind` (six valeurs
au modèle, quatre émises) et `parent_rule` (addendum ADR-0011 §G).
"""

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# --- Vocabulaires fermés -----------------------------------------------------------------------

TRIGGERS = ("manual", "request", "agenda", "evidence", "derived", "council")
AUTHORIZED_BY = ("parent_direct", "parent_rule")
RUN_STATUSES = ("queued", "running", "done", "failed")

# Ce que la v1 ÉMET réellement. Le reste est modélisé et interdit d'écriture (test-verrou).
EMITTED_TRIGGERS = ("manual",)
EMITTED_AUTHORIZED_BY = ("parent_direct",)

# `trigger` → la FK de référence qu'il DOIT renseigner, et elle seule. `manual` n'en a aucune :
# c'est un geste de Papa, il ne référence rien d'autre que lui-même.
TRIGGER_REFERENCE = {
    "manual": None,
    "request": "content_request_id",
    "agenda": "agenda_item_id",
    "evidence": "skill_id",
    "council": "council_report_id",
    "derived": "skill_id",
}


class ProductionRun(Base):
    """Un lot de production : ce qui l'a déclenché, qui l'a autorisé, et où il en est."""

    __tablename__ = "production_runs"
    __table_args__ = (
        # Garde-fou de cohérence, au plus près de la donnée. La contrainte complète
        # (« exactement une FK, cohérente avec `trigger` ») est portée par le service et son
        # test-verrou : l'exprimer entièrement en SQL la rendrait illisible et fragile à chaque
        # nouveau déclencheur. Ici on tient le cas le plus facile à violer par erreur.
        CheckConstraint(
            "(trigger <> 'manual') OR ("
            "agenda_item_id IS NULL AND content_request_id IS NULL "
            "AND council_report_id IS NULL AND skill_id IS NULL)",
            name="ck_production_runs_manual_has_no_reference",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)

    trigger: Mapped[str] = mapped_column(String(20))
    authorized_by: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(15), default="queued", index=True)

    # --- Le SCOPE : sur quoi ce lot a produit ---------------------------------------------------
    # ⚠️ Absent du schéma de l'ADR-0031 §4, et pourtant indispensable : ses colonnes disent
    # POURQUOI on a produit (le déclencheur), jamais SUR QUOI. Un run manuel sur un chapitre
    # n'aurait rien porté de son propre périmètre — donc rien à réafficher, rien à rejouer.
    # v1 : le scope est un chapitre (ADR-0031, « v1 = un chapitre »).
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id"), nullable=True)

    # --- Les RÉFÉRENCES DE DÉCLENCHEUR : typées, jamais polymorphes ------------------------------
    # Un `trigger_ref_id` générique reproduirait l'ambiguïté qui a fait rejeter `notion_requests`
    # pour les demandes de contenu (« un `skill_id` optionnel qui vaut tantôt inconnu tantôt connu
    # serait ambigu »). Une colonne par origine, nullable, et `TRIGGER_REFERENCE` dit laquelle.
    agenda_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("agenda_items.id"), nullable=True
    )
    content_request_id: Mapped[int | None] = mapped_column(
        ForeignKey("content_requests.id"), nullable=True
    )
    council_report_id: Mapped[int | None] = mapped_column(
        ForeignKey("council_reports.id"), nullable=True
    )
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)

    # --- Avancement : où en est le lot ----------------------------------------------------------
    # Le journal doit savoir où il en est, pas seulement s'il tourne. Deux compteurs plutôt qu'une
    # table d'étapes : l'ORDRE de `scope.plan` est déterministe et testé, donc « les N premières
    # notions sont faites » suffit à reconstituer le détail sans le persister.
    total_notions: Mapped[int | None] = mapped_column(Integer, nullable=True)
    done_notions: Mapped[int | None] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
