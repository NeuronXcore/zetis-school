"""Schémas agenda — frontière serveur stricte (ADR-0025 §2, patron `MissionStudentOut`/`Pilot`).

Deux schémas, deux routers : `AgendaItemStudentOut` (Massimo, SANS `parent_note`) et
`AgendaItemPilotOut` (Papa, sur-ensemble). Jamais un schéma unique filtré en aval : un champ
présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI. Un test-verrou
l'assert sur le JSON sérialisé, pas sur la définition du schéma.
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.db.models.agenda import AGENDA_KINDS

_KIND_PATTERN = "^(" + "|".join(AGENDA_KINDS) + ")$"


class SubjectRef(BaseModel):
    """Matière d'un item, telle qu'affichée. `None` sur un item saisi sans matière."""

    id: int
    slug: str
    name: str
    color: str | None = None


class TraceRef(BaseModel):
    """Matière d'une TRACE d'activité — trois champs, et surtout **pas d'`id`**.

    `SubjectRef` en porte un parce qu'une échéance se filtre et se saisit. Une trace n'ouvre rien
    et ne se filtre pas : servir son identifiant serait un champ exposé de plus, pour rien.

    ⚠️ **Aucune quantité ne doit jamais entrer ici** — ni compte d'événements, ni durée. Ce type
    dit *quelles matières*, pas *combien*.

    🔴 `slug` et `name` sont **nullables** : une activité peut n'avoir aucune matière (le chat,
    surtout). La trace existe quand même, sous une identité neutre — la jeter faisait disparaître
    **1 jour travaillé sur 20** sur la base de dev, soit le défaut même que l'Amendement 8
    corrige. Côté client : segment gris muet dans la grille, ligne sans nom de matière dans le
    panneau. Jamais une couleur de repli par hachage, qui inventerait une matière.
    """

    slug: str | None = None
    name: str | None = None
    color: str | None = None


# --- Frontière STUDENT (Massimo) ---------------------------------------------------------------


class AgendaItemStudentOut(BaseModel):
    id: int
    label: str
    subject: SubjectRef | None
    due_on: date
    kind: str
    done: bool
    created_by: str
    # Marqueur « complété par papa » (§2a) : booléen DÉRIVÉ de `edited_by_parent_at`. L'instant
    # exact reste pilot-only — Massimo a besoin de savoir QUE l'item a bougé, pas QUAND.
    edited_by_parent: bool
    # Où mène l'échéance (addendum §15). Deux clés de référentiel, servies dans cet ordre de
    # précision : la leçon, sinon le chapitre, sinon rien — et le lien tombe alors sur la matière.
    #
    # ⚠️ Ce sont les DEUX SEULS champs pilot-only à avoir été ouverts à Massimo depuis l'origine,
    # et c'est délibéré : ce ne sont pas des données SUR lui, ce sont des adresses de contenu
    # qu'il peut déjà atteindre à la main. Le test de non-fuite porte sur `parent_note`,
    # `dismissed_at` et les horodatages — ceux-là restent interdits, sans exception.
    lesson_id: int | None
    chapter_id: int | None
    # Combien de cartes le deck de révision de ce chapitre servirait, PLAFOND COMPRIS (ADR-0049).
    # `0` ⇒ la surface ne rend AUCUNE porte — ni bouton grisé, ni bouton qui explique, RIEN
    # (« un bouton mort se lit comme une panne », addendum ADR-0025 §14.6).
    #
    # ⚠️ Ce champ DOIT être déclaré ici : `response_model` filtre en silence tout ce qui n'est pas
    # au schéma. L'ADR-0045 puis l'ADR-0047 s'y sont fait prendre sur `open_gaps` — les clés
    # étaient produites par le service et disparaissaient à la sérialisation, sans erreur.
    #
    # Ce n'est pas une donnée SUR Massimo : c'est la disponibilité d'un contenu, au même titre que
    # `lesson_id` / `chapter_id` ci-dessus.
    revisable_cards: int = 0
    # AUCUN `parent_note`, AUCUN `dismissed_at`, AUCUN horodatage. Jamais.


class PlanStepOut(BaseModel):
    """Une étape du plan de préparation, vue de Massimo (ADR-0050).

    ⚠️ **Aucun champ de mécanique** — `sort_order` reste dehors, c'est un rouage.

    🔴 **Mais `agenda_item_id` EN EST UN, et il y est** (Décision 2 ter) : ce n'est pas de la
    mécanique, c'est le **sujet** de l'étape — ce qu'elle prépare. Sans lui, le plan ne peut se
    rendre que sous le JOUR, et sur une semaine à deux contrôles une étape y flotte sans dire de
    quel chapitre elle parle. Le refuser avait aussi rendu la maquette inconstructible.
    """

    id: int
    # Ce que l'étape prépare (Décision 2 ter). Le plan se rend SOUS cette échéance ; le jour, lui,
    # garde `plan_steps` pour allumer son `✦` dans la bande. Un seul payload, deux surfaces.
    agenda_item_id: int
    kind: str  # fiche|revision|quiz — vocabulaire de la panoplie, jamais réinventé
    # Jours AVANT l'échéance : 1 = la veille. Jamais 0 : on ne planifie pas le jour du contrôle.
    day_offset: int
    skill_id: int | None
    # ⚠️ Sa signification dépend du `kind` : `fiche_id`, `quiz_id`… et le `chapter_id` de
    # l'échéance pour `revision`, dont le grain est le chapitre.
    resource_id: int | None
    # « coché », JAMAIS « fait » (§14.7) : le serveur ne sait rien d'autre qu'un `done_at` posé
    # par une route élève. Cocher ne prouve rien (ADR-0050 Décision 5, option A).
    done: bool


class AgendaDayOut(BaseModel):
    """Un jour de la bande glissante. L'asymétrie passé/futur est calculée SERVEUR (§6)."""

    date: date
    # Décalage en jours par rapport à l'ancre. Le client n'a aucun calcul de date à faire.
    offset: int
    # Jours PASSÉS (et aujourd'hui) uniquement, `null` sinon — jamais `[]` sur un jour à venir :
    # un jour qui n'est pas encore arrivé n'a pas de case vide (§7, ADR-0024 §5).
    # `traces = []` et « journée sans donnée » sont LE MÊME état côté contrat.
    #
    # 🔴 Était `int | None` jusqu'à l'Amendement 8 : le nombre produisait « tu as travaillé
    # 3 fois », une phrase qui ne dit rien de ce qui a été fait. REMPLACÉ, jamais complété — le
    # laisser vivre à côté garantissait qu'une session le réécrirait.
    traces: list[TraceRef] | None
    # 🔴 Jours passés COMPRIS depuis l'Amendement 8 (§R3) : l'asymétrie est révoquée, un jour
    # passé annonce ce que l'école demandait.
    #
    # ⚠️ `done` voyage toujours ici, et c'est nécessaire (le panneau du jour s'en sert) — mais la
    # GRILLE ne doit jamais le rendre. Règle de rendu, pas de contrat.
    fixed_items: list[AgendaItemStudentOut]
    # Le plan de préparation (ADR-0050), enfin rempli — le champ était au contrat et mort depuis
    # le Lot 1. Les étapes d'un jour, toutes échéances confondues.
    #
    # ⚠️ Typé `PlanStepOut` et non `dict` : `response_model` FILTRE EN SILENCE tout ce qui n'est
    # pas au schéma. Les ADR-0045 et 0047 s'y sont fait prendre sur `open_gaps` — les clés étaient
    # produites par le service et disparaissaient à la sérialisation, sans erreur.
    plan_steps: list["PlanStepOut"] = []


class AgendaWeekOut(BaseModel):
    anchor: date
    days: list[AgendaDayOut]


class AgendaMonthOut(BaseModel):
    """La grille mois (Amdt 8 §D1) — même forme de jour que la bande, une seule primitive.

    `days` ne contient QUE les jours du mois : les cellules de complément qui alignent la grille
    sur lundi sont fabriquées côté client et rendues **totalement vides, sans numéral**.
    """

    anchor: str  # "AAAA-MM"
    days: list[AgendaDayOut]
    # 🔴 `None` ⇒ le chevron DISPARAÎT côté client, il n'est jamais grisé (§14.6 :
    # « un bouton mort se lit comme une panne »).
    prev_anchor: str | None
    next_anchor: str | None


class NotionRefOut(BaseModel):
    """Une notion travaillée — son `id` autant que son nom (Amdt 8 §D10).

    🔴 **L'`id` n'est pas décoratif : c'est lui qui rend la notion cliquable.** Le schéma ne
    servait que le nom, et le bloc « Ce que tu as travaillé » racontait donc à Massimo ce qu'il
    avait fait **sans lui laisser aucun moyen d'y revenir**. Le client s'en sert pour ouvrir la
    panoplie réelle de la notion (`GET /api/student/galaxy/notion/{skill_id}`), qui n'annonce
    que ce qui est disponible — donc jamais un bouton mort (§14.6).
    """

    id: int
    name: str


class TraceDetailOut(TraceRef):
    """Une matière travaillée, avec ses notions et ses formes de travail (Amdt 8 §D2)."""

    # ⚠️ **Notion et non chapitre**, et c'est un CONSTAT : `LearningEvent` porte `skill_id`,
    # et `Skill` n'a aucun `chapter_id` — aucun chemin ne mène au chapitre.
    # `[]` quand l'événement n'a pas de notion : la ligne saute dans l'UI, et la matière seule
    # reste une réponse.
    notions: list[NotionRefOut] = []
    # « Cours lu », « Quiz », « Révision SRS »… produits par `label_for()`, dans un ORDRE
    # DOCTRINAL FIXE côté service — jamais par fréquence, trier par fréquence c'est mesurer.
    forms: list[str] = []


class AgendaDayTracesOut(BaseModel):
    """Ce que Massimo a travaillé un jour donné — **schéma DÉDIÉ** (Amdt 8 §D5).

    🔴 **Jamais dérivé du `DayDetailOut` de Papa**, qui transporte `time`, `minutes`, `xp` et
    `score_percent`. Le filtrer côté client est précisément la faute que l'en-tête de ce fichier
    interdit : un champ présent dans la réponse réseau est un champ exposé, quoi qu'en fasse l'UI.

    ⚠️ **AUCUN champ de quantité ne doit jamais être ajouté ici** : pas de `minutes`, pas de `xp`,
    pas de `time`, pas de `score_percent`, pas de `count`. Un test-verrou l'assert sur le JSON
    sérialisé — et il le fait sur la RÉPONSE, pas sur cette classe.
    """

    date: date
    # Ordre CHRONOLOGIQUE de première touche : le récit de sa journée, pas un classement.
    subjects: list[TraceDetailOut]


class UpcomingItemOut(BaseModel):
    """« Ce qui arrive » : contrôles et rendus SEULEMENT (§6).

    `days_left` est un décompte SUBI, pas fabriqué (§1) — il porte une échéance qui existe déjà
    dans le monde de Massimo. Aucune jauge, aucune couleur d'approche : le seul signal
    d'approche est l'apparition du plan de préparation.
    """

    id: int
    label: str
    subject: SubjectRef | None
    due_on: date
    days_left: int
    # ADR-0050 : vrai SI ET SEULEMENT SI le plan a au moins une étape. Un `has_plan` optimiste
    # ferait apparaître un « ✦ » qui n'ouvre rien — le bouton mort du §14.6.
    has_plan: bool


class LateAlertOut(BaseModel):
    """L'échéance signalée à l'ouverture de la page, ou rien (Amdt 9 §D12).

    🔴 **UNE échéance, aucun nombre.** Le compteur d'arriéré du §7 est le seul interdit qui n'a
    pas bougé de la journée : pas de `total`, pas de `count`, pas de `days_late`.
    ⚠️ Pas de `days_late` non plus : le toast NOMME le jour, il ne mesure pas l'écart. Un « depuis
    4 jours » est un reproche chiffré.
    """

    item_id: int
    label: str
    kind: str
    due_on: date
    subject: SubjectRef | None


class LateAlertSeenRequest(BaseModel):
    """Quelle échéance le toast a réellement montrée (Amdt 9 §D12, corrigé le 2026-08-17).

    🔴 **Sans elle, le plancher ne peut avancer que jusqu'à aujourd'hui**, ce qui brûle la fenêtre
    entière alors qu'une seule échéance en est sortie. L'`id` est **revalidé côté serveur** —
    appartenance à l'élève — jamais pris pour argent comptant.

    Optionnel : un accusé sans corps applique seulement la règle « pas deux fois le même jour ».
    """

    item_id: int | None = None


class AheadGesteOut(BaseModel):
    """Un geste pour prendre de l'avance (Amdt 9 §D6).

    🔴 **Aucune quantité, aucun libellé, aucune route.**
    - *Quantité* : ni compte de cartes, ni score, ni durée — un test-verrou l'assert sur le JSON.
    - *Libellé* : la copie de cette page vit côté client, avec le vocabulaire du `CLAUDE.md`.
      `detail` est une **donnée** (nom de notion, titre de mindmap), pas une phrase.
    - *Route* : la table de routage est `notionRoutes.ts`, et elle n'existe qu'une fois — la
      recopier ici en ferait un second jeu, qui divergerait au premier correctif.
    """

    kind: Literal["plan", "mindmap", "revision", "mission", "renforcer"]
    detail: str | None = None
    mindmap_id: int | None = None
    skill_id: int | None = None


class AheadAnchorOut(BaseModel):
    """L'échéance que le bloc prépare.

    🔴 **Pas de `days_left`.** L'ancre NOMME son jour (le client rend « vendredi 21 ») ; elle ne
    le décompte pas. §D8 avait retiré « Ce qui arrive » entre autres parce que `days_left` était
    *« le dernier décompte chiffré de la page »* — le réintroduire ici viderait ce motif tout en
    gardant la révocation.
    """

    item_id: int
    label: str
    kind: str
    due_on: date
    subject: SubjectRef | None
    chapter_id: int | None
    lesson_id: int | None


class AheadOut(BaseModel):
    """« Prendre de l'avance » — un seul appel pour cinq sources (Amdt 9 §D6).

    `anchor` à `None` n'est PAS une réponse vide : les gestes qui tiennent debout sans échéance
    (réviser, une mission, une mindmap) sont servis quand même. Un bloc qui disparaît se lit
    comme une panne.
    """

    anchor: AheadAnchorOut | None
    gestes: list[AheadGesteOut]


class AgendaItemStudentCreate(BaseModel):
    """Saisie élève (phase 1 seulement — 403 tant que le verrou est fermé).

    `created_by` n'est PAS un champ : il est forcé côté serveur, jamais lu du corps.
    """

    label: str = Field(min_length=1, max_length=300)
    due_on: date
    subject_id: int | None = None
    kind: str = Field(default="devoir", pattern=_KIND_PATTERN)


class AgendaItemStudentPatch(BaseModel):
    """Édition par Massimo de SES propres items (403 sur un item de Papa)."""

    label: str | None = Field(default=None, min_length=1, max_length=300)
    due_on: date | None = None
    subject_id: int | None = None
    kind: str | None = Field(default=None, pattern=_KIND_PATTERN)


# --- Frontière PILOT (Papa) --------------------------------------------------------------------


class AgendaItemPilotOut(BaseModel):
    id: int
    label: str
    subject: SubjectRef | None
    subject_id: int | None
    chapter_id: int | None
    lesson_id: int | None
    due_on: date
    kind: str
    created_by: str
    parent_note: str | None
    done_at: datetime | None
    dismissed_at: datetime | None
    edited_by_parent_at: datetime | None
    created_at: datetime | None
    updated_at: datetime | None
    # Le plan de préparation, EN LECTURE (ADR-0050 Décision 7). Papa constate, il ne pilote pas :
    # aucune route de génération, aucune édition, aucune coche — le plan est un service rendu à
    # Massimo.
    #
    # 🔴 **Deux entiers et rien d'autre.** Servir les étapes ici en ferait un objet de pilotage :
    # Papa lirait ce que ZETIS a proposé, puis voudrait le corriger. `0/0` = pas de plan.
    #
    # ⚠️ « cochées », JAMAIS « faites » (§14.7) : le serveur ne sait rien d'autre qu'un `done_at`
    # posé par une route élève (Décision 5, option A).
    plan_steps_total: int = 0
    plan_steps_done: int = 0


class AgendaItemParentCreate(BaseModel):
    label: str = Field(min_length=1, max_length=300)
    due_on: date
    subject_id: int | None = None
    chapter_id: int | None = None
    # Renseigné quand Papa choisit l'intitulé dans la liste des cours du chapitre (§13.1).
    # Le service refuse en 422 une leçon qui n'appartient pas au `chapter_id` donné.
    lesson_id: int | None = None
    kind: str = Field(default="devoir", pattern=_KIND_PATTERN)
    parent_note: str | None = None


class AgendaItemsParentCreate(BaseModel):
    """Saisie EN LOT (§9) : le mode d'usage réel est « je relève l'ENT du dimanche soir », pas
    « j'ajoute un devoir »."""

    items: list[AgendaItemParentCreate] = Field(min_length=1)


class AgendaItemParentPatch(BaseModel):
    """Champs éditables par Papa.

    `done_at` est déclaré ICI **exprès**, alors qu'il n'est pas éditable : sans lui, Pydantic
    l'écarterait en silence et Papa croirait avoir coché. Le service refuse explicitement en
    **403** — un refus d'AUTORITÉ, pas de validation (§2b). Une règle qui se contente d'ignorer
    n'enseigne rien à celui qui la franchit.
    """

    label: str | None = Field(default=None, min_length=1, max_length=300)
    due_on: date | None = None
    subject_id: int | None = None
    chapter_id: int | None = None
    lesson_id: int | None = None
    kind: str | None = Field(default=None, pattern=_KIND_PATTERN)
    done_at: datetime | None = None  # piège volontaire → 403, cf. docstring.


class AgendaNoteRequest(BaseModel):
    """Note privée de Papa — jamais servie à Massimo."""

    parent_note: str | None = None


class AgendaSettingsOut(BaseModel):
    """Réglages de l'agenda, Papa-only. Un seul aujourd'hui : le verrou de phase (§10)."""

    student_entry_enabled: bool


class AgendaSettingsRequest(BaseModel):
    student_entry_enabled: bool
