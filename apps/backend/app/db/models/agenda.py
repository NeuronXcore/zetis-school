"""Agenda scolaire — première source EXOGÈNE du produit (ADR-0025).

Objet volontairement distinct de `Mission` : une mission est *composée depuis des preuves
mesurées* et sa complétion est **vérifiée serveur** (ADR-0017 §5) ; un devoir tombe du ciel et sa
complétion est **déclarative, invérifiable**. Les fusionner ferait entrer du déclaratif dans le
moteur de verdict — ce que tout l'édifice existe pour empêcher.

Conséquence directe : cette table n'alimente **ni** `skill_mastery`, **ni** le SRS, **ni**
`evidence/service.py`, **ni** l'XP. Cocher ne prouve rien, ne pas cocher ne prouve rien.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin

# Vocabulaire fermé, validé côté schéma Pydantic (pas d'Enum SQL : une valeur nouvelle ne doit
# pas coûter une migration sur une table aussi jeune).
#
# `lecon` ajouté le 2026-08-10 (addendum §14) — et la promesse ci-dessus a tenu : zéro migration.
# Il manquait le travail le PLUS accompagnable par ZETIS : des exercices se font sans lui, une
# leçon s'apprend avec ce qu'il produit (fiche, quiz, cartes). ⚠️ Toute valeur ajoutée ici doit
# être arbitrée dans les DEUX constantes de `production/triggers.py` — voir le piège du
# `.get(kind, 9)` qui y est documenté.
AGENDA_KINDS = ("devoir", "lecon", "controle", "rendu")
AGENDA_CREATORS = ("student", "parent")


class AgendaItem(Base, TimestampMixin):
    """Une échéance scolaire réelle, co-éditée par Massimo et Papa (ADR-0025 §2).

    Quatre règles portées par les colonnes ci-dessous :
    a) personne ne réécrit silencieusement l'autre (`edited_by_parent_at`) ;
    b) seul Massimo coche (`done_at`, écrit uniquement par une route élève — 403 côté Papa) ;
    c) suppression = archivage (`dismissed_at`), jamais de DELETE physique ;
    d) doublons tolérés (aucune contrainte d'unicité : une fusion erronée coûte plus cher).
    """

    __tablename__ = "agenda_items"
    # Toutes les lectures balaient une fenêtre de dates POUR UN ÉLÈVE (bande glissante,
    # « ce qui arrive », grille Papa) : l'index composite sert exactement ce motif.
    __table_args__ = (Index("ix_agenda_items_student_due", "student_id", "due_on"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("student_profiles.id"))
    # Nullable : saisir sans matière doit rester possible (la friction de saisie est le premier
    # risque produit — cf. ADR-0025 §Conséquences).
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), nullable=True)
    # ADR-0025 §11 : scope pédagogique de l'échéance, SÉLECTIONNÉ par Papa dans le référentiel
    # (zéro parsing, zéro embedding). `{chapter_id, due_on}` est l'entrée exacte de la porte
    # « échéance » du Commander (ADR-0018 §1). Posée dès maintenant, exploitée au Lot 3 :
    # colonne nullable sans logique, plutôt qu'une seconde migration sur une table neuve.
    chapter_id: Mapped[int | None] = mapped_column(ForeignKey("chapters.id"), nullable=True)
    # Addendum §15 — **RÉVOQUE le §13.3**, qui avait écarté cette colonne au motif qu'elle
    # « n'alimenterait aujourd'hui aucun moteur ». Le motif était exact ; le consommateur qui
    # manquait existe : le lien de l'agenda de Massimo vers SON cours. Le §13 fait déjà choisir
    # la leçon à Papa dans une liste — l'information était produite puis jetée.
    #
    # ⚠️ Ce n'est PAS un scope de production : le déclencheur et le Commander restent scopés par
    # `chapter_id` (`resolve_chapter_notions`). Cette colonne ne sert qu'à POINTER.
    lesson_id: Mapped[int | None] = mapped_column(ForeignKey("lessons.id"), nullable=True)
    # `Date` et non `DateTime` : une échéance est un JOUR.
    # NOMMAGE VOLONTAIRE : surtout pas `due_date`. Sur les missions (ADR-0018 §1) ce nom porte la
    # sémantique INVERSE — informationnelle, Papa-only, jamais exposée à l'élève. Ici la date est
    # affichée à Massimo : elle existe déjà dans son monde, la masquer ne supprimerait pas la
    # pression, seulement son moyen de s'organiser.
    due_on: Mapped[date] = mapped_column(Date)
    # Texte BRUT, tel que saisi — jamais réécrit par le serveur (ADR-0025 §8).
    label: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(15), default="devoir")  # devoir|controle|rendu
    # IMMUABLE après création : le service ne l'expose dans aucun schéma de mise à jour.
    created_by: Mapped[str] = mapped_column(String(10))  # student|parent
    # Renseigné AUTOMATIQUEMENT par le service quand Papa touche un item de Massimo, jamais par
    # le client. Sans ce marqueur, Massimo découvre un agenda qui bouge tout seul : la
    # surveillance rentrerait par la porte de service (§2a).
    edited_by_parent_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Écrit UNIQUEMENT par une route élève (§2b). Aucune colonne « validé par Papa » n'existe.
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Archivage (§2c). Massimo peut masquer un item de Papa ; le masquage reste visible côté
    # pilotage — asymétrie assumée : le parent voit tout, l'enfant voit ce qui le concerne.
    dismissed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # JAMAIS servie à Massimo : l'étanchéité est tenue par des schémas SÉPARÉS, pas par un filtre
    # d'affichage (test-verrou sur le JSON sérialisé).
    parent_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Pas de colonne d'« item manqué », sous aucune forme. Même jurisprudence que
    # `StudentWeeklyGoal`, qui n'a délibérément aucune colonne d'atteinte : rien de punitif ne
    # doit être persistable. L'écart déclaré/fait se LIT par requête côté Papa ; il ne se
    # DIFFUSE pas.
