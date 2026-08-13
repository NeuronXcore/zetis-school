from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Capsule(Base, TimestampMixin):
    __tablename__ = "capsules"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"))
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # Classement pédagogique : une capsule peut être rattachée à un chapitre (facultatif).
    # Sert au regroupement matière → chapitre dans les listes Papa et Massimo.
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id"), nullable=True)
    # Niveau de difficulté choisi par Papa (facile|moyen|difficile) : pilote la génération IA
    # et s'affiche via un badge côté Massimo. NULL pour les capsules d'avant cette option.
    difficulty: Mapped[str | None] = mapped_column(String(20), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    storyboard_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="draft")

    # --- Lot 1 (ADR-0007) : génération LLM → CapsuleSpec typé, validé par Papa. ---
    instruction: Mapped[str | None] = mapped_column(Text, nullable=True)
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected
    # Provenance de la validation (addendum ADR-0011 §F) : `validation_status` dit SI c'est
    # passé, ces deux colonnes disent QUI a laissé passer. NULL = non validé, ou antérieur à
    # la traçabilité (aucune rétro-attribution).
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    validated_by: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # parent | parent_bulk | system


class Fiche(Base, TimestampMixin):
    """Fiche de révision d'UNE leçon (ADR-0015) — **deux auteurs** (addendum ADR-0015 §1).

    Leçon-centré : une fiche = 1 leçon = 1 page (`lesson_id`). `spec_json` porte le `FicheSpec`
    typé (validé par Pydantic avant persistance — jamais de spec invalide en base). Conventions
    de colonnes reprises de `capsules` (`validation_status`, `source`, `program_version`).

    ⚠️ **`author` et `source` sont deux axes, pas un.** `source` (`generated|manual`) dit COMMENT
    la pièce a été produite ; `author` dit À QUI elle est. Une fiche personnelle partiellement
    assistée n'aurait aucune valeur de `source` juste.

    ⚠️ **Ne JAMAIS lire cette table sans dire de quelle population on parle.** Deux prédicats
    partagés existent, un par public — `fiches.service.readable_by_student()` pour le flux élève,
    `fiches.service.zetis_authored()` pour la production et le pilotage. Une clause recopiée à la
    main est le piège de l'agenda (trois lecteurs non filtrés de `learning_events`), et le
    read-before-code du 2026-08-13 a montré qu'il était déjà tendu ici : **huit** requêtes lisent
    `fiches`, dont quatre hors du module et sans aucun filtre de statut.
    """

    __tablename__ = "fiches"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), index=True)
    spec_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # ⚠️ `personal` est la 4ᵉ valeur, HORS cycle éditorial (addendum §2) : la fiche de Massimo
    # n'est ni validée ni rejetée, elle est à lui. C'est aussi une **sécurité par construction** —
    # un lecteur qui oublierait le filtre d'auteur garde son `== "validated"`, donc il exclut
    # naturellement la fiche de Massimo. Le mode d'échec devient « sa fiche ne s'affiche pas »
    # (visible, bénin) au lieu de « du contenu non validé fuit » (silencieux, grave).
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected | personal
    # Provenance de la validation (addendum ADR-0011 §F) — cf. `Capsule`.
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    validated_by: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # parent | parent_bulk | system
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated | manual
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020
    # Lot de production qui a produit cette pièce (ADR-0031 §4). `NULL` = produit hors lot,
    # ou antérieur au journal — **aucune rétro-attribution** (doctrine §F.4).
    production_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_runs.id"), nullable=True
    )
    # --- Addendum ADR-0015 : le second auteur. ---
    author: Mapped[str] = mapped_column(
        String(10), default="zetis", server_default="zetis"
    )  # zetis | massimo
    # NULL = fiche ZETIS (elle appartient à une leçon, pas à un enfant). Renseigné pour une fiche
    # personnelle — cohérent avec la trajectoire multi-enfant sans la précipiter.
    student_id: Mapped[int | None] = mapped_column(
        ForeignKey("student_profiles.id"), nullable=True
    )
    # Version dans le temps (§7) : rouvrir une fiche FINIE en crée une nouvelle, l'ancienne reste
    # lisible ; rouvrir un BROUILLON reprend en place. `lesson_id` étant indexé non unique,
    # plusieurs fiches par leçon étaient déjà supportées — il ne manquait qu'un numéro.
    version: Mapped[int] = mapped_column(default=1, server_default="1")


class Mindmap(Base, TimestampMixin):
    """Carte mentale d'UNE leçon (ADR-0016), dérivée du cours canonique validé — sœur des fiches.

    Leçon-centré : une mindmap = 1 leçon (`lesson_id`). `mindmap_json` porte un ARBRE STRICT
    (nœuds reliés par `parent`) **sans positions** — le layout est de la présentation, calculé
    côté client (Slice B). Conventions de colonnes reprises de `fiches`/`capsules`
    (`validation_status`, `source`, `program_version`).
    """

    __tablename__ = "mindmaps"

    id: Mapped[int] = mapped_column(primary_key=True)
    lesson_id: Mapped[int] = mapped_column(ForeignKey("lessons.id"), index=True)
    mindmap_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
    validation_status: Mapped[str] = mapped_column(
        String(20), default="pending"
    )  # pending | validated | rejected
    # Provenance de la validation (addendum ADR-0011 §F) — cf. `Capsule`.
    validated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    validated_by: Mapped[str | None] = mapped_column(
        String(20), nullable=True
    )  # parent | parent_bulk | system
    source: Mapped[str] = mapped_column(String(20), default="generated")  # generated | manual
    program_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # ex: 2020
    # Lot de production qui a produit cette pièce (ADR-0031 §4). `NULL` = produit hors lot,
    # ou antérieur au journal — **aucune rétro-attribution** (doctrine §F.4).
    production_run_id: Mapped[int | None] = mapped_column(
        ForeignKey("production_runs.id"), nullable=True
    )



class MindmapAttempt(Base, TimestampMixin):
    """Tentative de reconstruction d'une mindmap (mode `student_reconstruction`, ADR-0016).

    Le `score` (0–100) et le détail juste/faux par nœud (`details_json`) sont calculés **côté
    serveur** de façon déterministe (comparaison des nœuds placés à l'arbre de référence). Aucune
    position n'est stockée : seule la structure est notée.
    """

    __tablename__ = "mindmap_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"), index=True)
    mindmap_id: Mapped[int] = mapped_column(ForeignKey("mindmaps.id"), index=True)
    score: Mapped[int] = mapped_column(default=0)  # 0–100, sur les nœuds requis
    details_json: Mapped[dict | list | None] = mapped_column(JSON, nullable=True)
