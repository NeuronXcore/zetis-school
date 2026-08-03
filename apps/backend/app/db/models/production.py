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

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

# --- Vocabulaires fermés -----------------------------------------------------------------------

TRIGGERS = ("manual", "request", "agenda", "evidence", "derived", "council")
AUTHORIZED_BY = ("parent_direct", "parent_rule")
RUN_STATUSES = ("queued", "running", "done", "failed")

# Ce qui est réellement ÉMIS. Le reste est modélisé et interdit d'écriture (test-verrou).
#
# `agenda` ouvert le 2026-08-03 (ADR-0035 §1) : un CONTRÔLE, avec un chapitre rattaché et une
# échéance proche, déclenche la production de ce chapitre. `devoir` et `rendu` restent légaux et
# non émis — un devoir reviendrait tous les jours et noierait le régulateur.
#
# ⚠️ `evidence` est écarté EN CONNAISSANCE DE CAUSE, pas par manque de temps : l'agenda est la
# seule source EXOGÈNE du produit, sa légitimité se lit sans modèle (« quelqu'un du monde réel a
# écrit qu'il y avait un contrôle jeudi »). Un déclencheur `evidence` ferait décider ZETIS sur SA
# PROPRE mesure — la boucle se refermerait sur elle-même, et une mesure fausse produirait du
# contenu que rien d'extérieur ne viendrait contredire.
EMITTED_TRIGGERS = ("manual", "agenda")

# `parent_rule` s'émet enfin (ADR-0035 §6) : un lot né du scan satisfait la définition littérale du
# §G.1 — **aucun humain n'a ouvert la pièce, NI CLIQUÉ POUR CE LOT**. Elle est restée légale et non
# émise depuis le 2026-07-28, précisément parce que tout lot partait d'un clic.
EMITTED_AUTHORIZED_BY = ("parent_direct", "parent_rule")

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


# --- Vocabulaire du JOURNAL (ADR-0034 §1) ------------------------------------------------------

# Les cinq pièces d'un kit, dans l'ordre où `equip_notion` les produit.
PIECES = ("cours", "fiche", "srs", "quiz", "mindmap")

# --- La demande et le lot ne parlent pas la même langue (ADR-0036 §2) ---------------------------
#
# `content_requests.CONTENT_KINDS` en compte six, `PIECES` cinq — et ce n'est pas un décalage de
# version : ce sont deux vocabulaires nés de deux besoins. Deux écarts, tous deux réels :
#
# - **`card` et `srs` désignent la même chose** sous deux noms (la demande parle comme Massimo,
#   le lot comme les tables) ;
# - **`capsule` n'a aucun producteur** dans l'équipement. Son générateur exige une INSTRUCTION en
#   texte libre — l'intention pédagogique de Papa — qu'une demande `(skill_id, content_kind)` ne
#   porte pas. Constaté au read-before-code du 2026-08-03 ; l'ADR-0036 §3 en a tiré la conséquence :
#   la capsule reste un geste de Papa.
#
# La correspondance est écrite ICI, une fois. Une demande absente de cette table ne se produit pas,
# et l'écran doit le dire plutôt que d'offrir un bouton qui échouerait.
REQUEST_KIND_TO_PIECE = {
    "cours": "cours",
    "fiche": "fiche",
    "mindmap": "mindmap",
    "quiz": "quiz",
    "card": "srs",
}

# `blocked` porte sur la NOTION, pas sur une pièce : le gate du §7 l'a écartée avant tout
# équipement. Sa ligne a `piece = NULL` — une notion silencieusement omise se lirait comme un échec
# de production, alors que c'est un gate qui fonctionne (addendum ADR-0031).
OUTCOMES = ("generated", "skipped", "error", "blocked")


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
        # « Exactement un scope » (ADR-0036 §2) — un chapitre, OU une pièce sur une notion.
        # Celle-ci, contrairement à la règle des références ci-dessus, s'exprime entièrement en SQL
        # sans devenir illisible : elle ne dépend d'aucun vocabulaire ouvert. Un lot sans scope
        # produirait dans le vide ; un lot à deux scopes ferait diverger l'exécution de l'affichage.
        CheckConstraint(
            "(chapter_id IS NOT NULL AND scope_skill_id IS NULL AND scope_kind IS NULL) "
            "OR (chapter_id IS NULL AND scope_skill_id IS NOT NULL AND scope_kind IS NOT NULL)",
            name="ck_production_runs_exactly_one_scope",
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

    # v2 : le scope peut aussi être UNE PIÈCE sur UNE NOTION (ADR-0036 §2). Une fiche demandée
    # produit une fiche — pas le kit, pas le chapitre.
    #
    # ⚠️ **Deux colonnes neuves, et c'est une décision, pas une facilité.** On aurait pu dériver le
    # scope de `content_request_id`, qui porte déjà la notion et le type. L'ADR-0031 §4 a tranché
    # l'inverse et son motif tient : « ses colonnes disent POURQUOI on a produit, jamais SUR QUOI ».
    # Un lot ne doit pas avoir besoin de son déclencheur pour savoir ce qu'il doit faire.
    #
    # ⚠️ Et **`skill_id` n'est pas réutilisé** : c'est la référence de déclencheur d'`evidence` et
    # `derived` (voir `TRIGGER_REFERENCE`). Une colonne qui vaudrait tantôt « pourquoi » tantôt
    # « sur quoi » serait exactement l'ambiguïté qui a fait rejeter `notion_requests` comme support
    # des demandes de contenu.
    scope_skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # Une valeur de `PIECES`, jamais de `CONTENT_KINDS` : le lot parle la langue des tables.
    scope_kind: Mapped[str | None] = mapped_column(String(10), nullable=True)

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
    # Où il en est MAINTENANT — ce que `done_notions` ne dit pas (ADR-0034 §2).
    current_skill_id: Mapped[int | None] = mapped_column(
        ForeignKey("skills.id"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    # ⚠️ `created_at` n'est PAS l'heure de démarrage : le job attend en file (concurrence 1, un
    # seul GPU). Sans cette colonne, la durée d'un lot inclut son attente et ne mesure rien.
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Battement de cœur, écrit à chaque notion (il y a déjà un commit par notion : coût nul).
    # Un lot `running` dont le battement a expiré est rendu `stale` PAR LA LECTURE — aucun
    # balayage périodique, aucun ordonnanceur (ADR-0034 §2, doctrine §G.3).
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ProductionEvent(Base):
    """Ce que le lot a fait, pièce par pièce (ADR-0034 §1).

    **La donnée existait déjà et partait à la poubelle** : `equip_notion` renvoie
    `generated` / `skipped` / `errors` par pièce, `runner.execute` assemblait le tout dans un
    `results` retourné au job RQ — dont personne ne lit le retour. Seul `done_notions` survivait.
    Cette table retient ce qui était déjà calculé ; elle n'instrumente aucun générateur.

    ⚠️ **Écrite dans la MÊME transaction que l'acte qu'elle trace** — patron `log_learning_event`.
    Un lot interrompu garde le détail de ce qu'il avait fait : le journal d'un crash est
    exactement ce pour quoi on l'écrit.
    """

    __tablename__ = "production_events"
    # Toutes les lectures partent d'un lot et suivent l'ordre de production.
    __table_args__ = (Index("ix_production_events_run_created", "run_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("production_runs.id"), index=True)
    # Nullable : un lot peut échouer avant d'avoir touché la moindre notion.
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # NULL quand l'événement porte sur la notion entière (`outcome='blocked'`).
    piece: Mapped[str | None] = mapped_column(String(10), nullable=True)
    outcome: Mapped[str] = mapped_column(String(10))
    # Message d'erreur, motif de saut, ou motif de blocage rendu par `select_notions`.
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
