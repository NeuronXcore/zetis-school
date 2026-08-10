"""Agenda scolaire — première source EXOGÈNE du produit (ADR-0025).

Objet volontairement distinct de `Mission` : une mission est *composée depuis des preuves
mesurées* et sa complétion est **vérifiée serveur** (ADR-0017 §5) ; un devoir tombe du ciel et sa
complétion est **déclarative, invérifiable**. Les fusionner ferait entrer du déclaratif dans le
moteur de verdict — ce que tout l'édifice existe pour empêcher.

Conséquence directe : cette table n'alimente **ni** `skill_mastery`, **ni** le SRS, **ni**
`evidence/service.py`, **ni** l'XP. Cocher ne prouve rien, ne pas cocher ne prouve rien.
"""

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Index, Integer, String, Text
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


# Types d'étape d'un plan de préparation (ADR-0050 Décision 2 bis). **Trois, et un seul de
# chaque par plan** — le plan parle en TYPES, jamais en notions : sur un chapitre à six notions
# testables, Massimo ne verra pas six « petit quiz ». Il dit **par où commencer**, pas tout ce
# qu'on pourrait faire.
#
# ⚠️ Vocabulaire repris de la PANOPLIE (`galaxy.resolve_panoply`), jamais réinventé : deux
# vocabulaires pour la même chose divergent au premier ajout.
#
# ⚠️ `cours` et `eli5` en sont ABSENTS et c'est délibéré — l'échéance offre déjà « lire le cours »
# (addendum ADR-0025 §15), et une troisième surface pour la même chose est le motif que
# l'`adr-0047` a corrigé ailleurs.
PLAN_STEP_KINDS = ("fiche", "revision", "quiz")


class AgendaPlanStep(Base):
    """Une étape du plan de préparation d'une échéance (ADR-0050, ADR-0025 §8 rôle 1).

    **Pourquoi une table et pas un `MissionStep`** : une mission porte un verdict, un scoring, de
    l'XP et un `skill_id` obligatoire, et elle est **par notion** ; un plan est **par échéance** et
    ne mesure rien. Réutiliser aurait fait entrer tout le moteur de missions dans l'agenda —
    exactement ce que l'en-tête de ce fichier refuse pour `AgendaItem` lui-même.

    **Le plan est FIGÉ** (§8 rôle 1) : composé à la première lecture, il ne se recompose jamais —
    *« un plan qui se recalcule à chaque ouverture est un plan auquel on ne fait pas confiance »*.
    Une fiche validée après coup n'y entre pas.

    🔴 **Sauf si la date bouge** : le service SUPPRIME le plan quand `due_on` change, coches
    comprises. Un rétro-planning est une fonction de la date ; le garder afficherait des jours qui
    ne veulent plus rien dire. La perte des coches est assumée — elles portaient ces jours-là.

    ⚠️ **`done_at` ne prouve RIEN** (ADR-0050 Décision 5, option A) : c'est une **déclaration** de
    Massimo, comme la coche d'un item. Aucun XP, aucune célébration — sinon il apprend à cocher.
    Jouer l'activité ne pose pas ce champ, et le poser n'exige pas d'avoir joué l'activité. La
    variante « prouvée par la trace » est **reportée**, pas écartée.
    """

    __tablename__ = "agenda_plan_steps"
    # Toutes les lectures partent de l'échéance et rendent ses étapes dans l'ordre.
    __table_args__ = (Index("ix_agenda_plan_steps_item", "agenda_item_id", "sort_order"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # CASCADE : le plan n'a aucune existence hors de son échéance. C'est le seul DELETE physique
    # de ce fichier — `AgendaItem` s'archive (`dismissed_at`), une étape se supprime.
    agenda_item_id: Mapped[int] = mapped_column(
        ForeignKey("agenda_items.id", ondelete="CASCADE"), index=True
    )
    # Jours AVANT l'échéance : 1 = la veille, 2 = l'avant-veille… Stocké en offset et non en date
    # pour que le plan reste lisible tel quel — et parce qu'une date stockée survivrait au
    # déplacement qui, lui, révoque le plan.
    day_offset: Mapped[int] = mapped_column(Integer)
    kind: Mapped[str] = mapped_column(String(15))  # fiche|revision|quiz
    # La notion visée, quand l'étape en a une. `revision` n'en a pas : son grain est le CHAPITRE
    # (deck de l'adr-0049), et son identifiant est le `chapter_id` de l'échéance.
    skill_id: Mapped[int | None] = mapped_column(ForeignKey("skills.id"), nullable=True)
    # ⚠️ La panoplie ne nomme PAS uniformément cet identifiant (`fiche_id`, `quiz_id`, `lesson_id`…)
    # et n'en fournit aucun pour `revision` : l'extraction est faite PAR TYPE côté service.
    resource_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    # Déclaration de Massimo, écrite uniquement par une route élève. Voir la docstring.
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
