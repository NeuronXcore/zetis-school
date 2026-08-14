"""Miroir Pydantic **strict** du type partagé `FicheSpec` (`packages/types/src/fiche.ts`) +
schémas d'E/S des routes (ADR-0015 §2).

Couche de garantie dure (patron ADR-0007) : `model_validate` rejette toute sortie LLM hors des
bornes ; rien d'invalide n'est jamais persisté ni renvoyé. `extra="forbid"` partout : aucun champ
en trop toléré. Les **bornes de listes** (`definitions` ≤ 4, `points_cles` ≤ 5, `erreurs_a_eviter`
≤ 3) et les **gardes de longueur** (`essentiel`, `mini_exemple`) SONT le budget structurel qui
garantit « 1 leçon = 1 page » — pas une consigne de prompt.
"""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

# --- Budget structurel (ADR-0015 §2). Modifier ces bornes = changer le contrat « 1 page ». ---
MAX_DEFINITIONS = 4
MAX_POINTS_CLES = 5
MAX_ERREURS = 3
MAX_ESSENTIEL_LEN = 600  # ~2-3 phrases
MAX_MINI_EXEMPLE_LEN = 400  # 0-1 court exemple
MAX_TERME = 80
_MAX_DEFINITION = 300
_MAX_LIGNE = 160  # une puce / une erreur : courte

# Une ligne courte non vide (puce clé, erreur à éviter).
_Ligne = Annotated[str, Field(min_length=1, max_length=_MAX_LIGNE)]
# La même, en brouillon : la borne MAX tient (la place sur la page est finie), la MIN saute —
# un emplacement encore vide est l'état normal d'une fiche qu'on est en train de fabriquer.
_LigneDraft = Annotated[str, Field(max_length=_MAX_LIGNE)]


class FicheDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    terme: str = Field(min_length=1, max_length=MAX_TERME)
    definition: str = Field(min_length=1, max_length=_MAX_DEFINITION)


class FicheSpec(BaseModel):
    """Fiche de révision d'UNE leçon — vocabulaire fermé, sections à budget (ADR-0015 §2)."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=160)
    subject: str = Field(min_length=1, max_length=80)
    level: str = Field(min_length=1, max_length=20)
    chapter: str | None = Field(default=None, max_length=160)
    essentiel: str = Field(min_length=1, max_length=MAX_ESSENTIEL_LEN)
    definitions: list[FicheDefinition] = Field(default_factory=list, max_length=MAX_DEFINITIONS)
    points_cles: list[_Ligne] = Field(default_factory=list, max_length=MAX_POINTS_CLES)
    erreurs_a_eviter: list[_Ligne] = Field(default_factory=list, max_length=MAX_ERREURS)
    mini_exemple: str | None = Field(default=None, max_length=MAX_MINI_EXEMPLE_LEN)


class FicheDraft(BaseModel):
    """État INTERMÉDIAIRE d'une fiche en cours de fabrication (addendum ADR-0015 §1 bis).

    Jamais servi comme une fiche, jamais imprimable, jamais dérivable. **Devient** un `FicheSpec`
    quand Massimo valide — et c'est ce passage-là qui fait exister la fiche.

    Pourquoi un SECOND schéma plutôt que des bornes relâchées : une sélection à 3 points-clés sur
    5, sans `essentiel`, ne passe aucune borne du `FicheSpec` (`essentiel` est `min_length=1`).
    Relâcher le strict aurait détruit le « 1 leçon = 1 page » garanti par construction, qui est la
    décision fondatrice de l'ADR-0015. Donc : **mêmes champs, tous optionnels, aucune borne
    minimale, mêmes bornes MAXIMALES** — la place sur la page reste bornée même en brouillon.

    ⚠️ `FicheSpec` reste **littéralement inchangé** : il part au modèle via
    `model_json_schema()`, et lui ajouter le moindre champ changerait la génération de TOUTES les
    fiches ZETIS, pas seulement des nouvelles.
    """

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, max_length=160)
    subject: str | None = Field(default=None, max_length=80)
    level: str | None = Field(default=None, max_length=20)
    chapter: str | None = Field(default=None, max_length=160)
    essentiel: str | None = Field(default=None, max_length=MAX_ESSENTIEL_LEN)
    definitions: list[FicheDefinition] = Field(default_factory=list, max_length=MAX_DEFINITIONS)
    points_cles: list[_LigneDraft] = Field(default_factory=list, max_length=MAX_POINTS_CLES)
    erreurs_a_eviter: list[_LigneDraft] = Field(default_factory=list, max_length=MAX_ERREURS)
    mini_exemple: str | None = Field(default=None, max_length=MAX_MINI_EXEMPLE_LEN)


# ---------------------------------------------------------------------------
# E/S des routes Papa + Massimo (fiches persistées).
# ---------------------------------------------------------------------------


class FicheGenerateRequest(BaseModel):
    """`POST /api/fiches/generate` : génère + persiste une fiche (statut `pending`)."""

    model_config = ConfigDict(extra="forbid")

    lesson_id: int


class FicheUpdateRequest(BaseModel):
    """`PUT /api/fiches/{id}` : remplace le spec (revalidé par le schéma → repasse `pending`)."""

    model_config = ConfigDict(extra="forbid")

    spec: FicheSpec


class FicheOut(BaseModel):
    """Fiche détaillée (éditeur Papa, viewer Massimo)."""

    id: int
    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""
    validation_status: str
    spec: FicheSpec
    seen: bool = False
    # Alimente la datation ABSOLUE de l'export A5 / impression (ADR-0054 §3). Toujours rendue —
    # cf. le commentaire de `fiche_out` : l'écran s'interdit de dater ZETIS, le papier non.
    updated_at: datetime | None = None


class FicheListItem(BaseModel):
    """Item de deck (grille matière) — sans le spec complet."""

    id: int
    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""
    seen: bool = False


class FichePilotageLesson(BaseModel):
    """Une leçon validée d'une matière + ses fiches (toutes statuts) — pilotage Papa."""

    lesson_id: int
    title: str
    chapter: str | None = None
    has_content: bool
    fiches: list[FicheOut]


class FichePilotageSubject(BaseModel):
    id: int
    slug: str
    name: str


class FichePilotageTree(BaseModel):
    """Arbre de pilotage Papa d'une matière : ses leçons validées + leurs fiches (1 appel)."""

    subject: FichePilotageSubject
    lessons: list[FichePilotageLesson]


class FichesSummarySubject(BaseModel):
    """Une matière de l'année active + son compteur de fiches validées (grille de decks)."""

    slug: str
    name: str
    fiche_count: int
    new_count: int  # fiches validées jamais ouvertes (badge « Nouveau »)


class FichesSummaryOut(BaseModel):
    """Résumé des decks fiches (écran d'accueil Massimo) — matières de l'année active."""

    subjects: list[FichesSummarySubject]


# ---------------------------------------------------------------------------
# L'atelier — la fiche que Massimo fabrique (addendum ADR-0015).
# ---------------------------------------------------------------------------

# Vocabulaire FERMÉ des sections. La slice 1 n'en implémente qu'une (`points_cles`) ; les cinq
# autres existent au vocabulaire pour que le contrat n'ait pas à bouger en slice 2 et 3.
FicheSection = Literal[
    "essentiel", "definitions", "points_cles", "erreurs_a_eviter", "mini_exemple"
]

# `absent_du_cours` est HORS PÉRIMÈTRE v1 : seul type à faux positifs, et un faux positif ici est
# une injustice (ZETIS dirait à Massimo que sa phrase juste est douteuse). Il reste au vocabulaire
# — l'activer ne changera pas le contrat.
RemarqueType = Literal["recopie", "trop_long", "idee_manquante", "absent_du_cours"]


class FicheDraftOpenRequest(BaseModel):
    """`POST /api/student/fiches/draft` : ouvre — ou retrouve — le brouillon d'une leçon."""

    model_config = ConfigDict(extra="forbid")

    lesson_id: int


class FicheDraftPatchRequest(BaseModel):
    """`PATCH /api/student/fiches/draft/{id}` : sauvegarde PARTIELLE, appelée à chaque geste.

    C'est elle qui rend la reprise possible — et l'écran promet « tout est gardé au fur et à
    mesure, tu peux fermer et revenir demain ». Le contrat doit tenir cette promesse-là.
    """

    model_config = ConfigDict(extra="forbid")

    draft: FicheDraft


class FicheDraftOut(BaseModel):
    """Le brouillon tel que l'atelier le relit — jamais un `FicheOut` (ce n'est pas une fiche)."""

    id: int
    lesson_id: int
    subject_slug: str = ""
    lesson_title: str = ""
    chapter: str | None = None
    version: int
    draft: FicheDraft


class FicheCandidate(BaseModel):
    """Une phrase candidate, TIRÉE DU COURS — jamais écrite par le modèle (règle 7).

    ⚠️ Les candidates non retenues **ne sont pas fausses** : elles sont vraies mais secondaires.
    C'est ce qui rend le choix formateur, et ce qui interdit à ZETIS de dire « c'est faux ».
    """

    index: int
    texte: str
    # Pourquoi ZETIS propose CELLE-CI — renseigné pour `erreurs_a_eviter` seulement, et c'est
    # tout ce qui rend la proposition acceptable : ZETIS ne suggère pas une idée, il rappelle
    # **un fait de Massimo** (§8). Sans la raison, « Attention à : les fractions » serait un
    # conseil sorti de nulle part ; avec elle, c'est sa propre mesure qu'on lui rend.
    raison: str | None = None


class FicheCandidatesOut(BaseModel):
    """Ce qu'une section offre pour DÉMARRER — et chaque section démarre autrement.

    | Section | `candidates` | `amorce` | Mode d'auteur |
    |---|---|---|---|
    | `points_cles` | 12 phrases du cours | — | il **choisit** |
    | `definitions` | jusqu'à 4 **termes** | — | ZETIS donne le mot, il **écrit** la définition |
    | `essentiel` | aucune | le début de phrase | il **écrit**, seul |

    ⚠️ `essentiel` n'a **aucune** candidate, et ce n'est pas un manque : c'est une **synthèse**,
    par définition absente du cours. Aucune phrase existante ne peut la porter (§8).
    """

    section: FicheSection
    candidates: list[FicheCandidate]
    # Combien d'emplacements la section offre (5 pour `points_cles`) : l'écran affiche « n / 5 ».
    slots: int
    # Début de phrase posé dans le champ. Règle 1 des champs libres (§9) : **jamais de zone
    # vide** — la page blanche est ce qui fait recopier le cours.
    amorce: str | None = None


FicheTileEtat = Literal["commencee", "ma_fiche", "zetis", "a_fabriquer"]


class FicheTile(BaseModel):
    """Une tuile par LEÇON — l'écran 2 de `page-fiches.md`.

    ⚠️ **Leçon-centré, pas fiche-centré**, et c'est tout l'intérêt : la liste fiche-centrée ne
    pouvait pas montrer un travail **commencé** (un brouillon n'est pas une fiche) ni une leçon
    **à fabriquer** (il n'y a pas encore d'objet). Une fiche interrompue était donc perdue de vue,
    alors que le serveur la gardait parfaitement — constaté à l'usage le 2026-08-13.

    **Aucun état n'est un reproche** : « commencée » ne dit jamais « inachevé » ni « abandonné »,
    et rien ne décompte de jours.
    """

    lesson_id: int
    title: str
    chapter: str | None = None
    subject_slug: str = ""
    etat: FicheTileEtat
    # Ce qu'il faut ouvrir au clic, selon l'état.
    draft_id: int | None = None  # son brouillon à reprendre
    fiche_id: int | None = None  # sa fiche finie, ou à défaut la fiche ZETIS
    zetis_fiche_id: int | None = None  # le corrigé, toujours à un clic (§3 révisé)
    seen: bool = False
    versions: int = 0  # ses versions à lui
    etapes_remplies: int = 0  # sur un brouillon : combien de sections ont quelque chose
    points_choisis: int = 0  # « tu en as choisi 3 »
    # Quand SA dernière version finie a été touchée (ADR-0054 §3). `None` s'il n'a pas de fiche :
    # la fiche de ZETIS n'est **jamais** datée côté enfant — « il y a 4 mois » ne peut que saper
    # la confiance dans un contenu juste, et c'est une information de Papa.
    #
    # ⚠️ Aucune migration : `Fiche` porte `TimestampMixin`, la donnée est déjà en base. Ajouter un
    # champ à un schéma de réponse existant est explicitement PERMIS par le §2 précisé — la
    # contrainte « aucun état neuf » vise les routes, colonnes et migrations.
    updated_at: datetime | None = None


class FicheCartesOut(BaseModel):
    """Ce que le pont a VRAIMENT fait — deux nombres, jamais un seul (addendum ADR-0015 §13).

    ⚠️ Une carte exige une **notion** (`skill_id` NOT NULL), or ZETIS propose les termes en deux
    temps : les notions de la leçon **puis le gras du cours**. Un terme venu du gras ne peut pas
    donner de carte. Annoncer « 4 cartes » pour en créer 2 serait le défaut que l'`adr-0039` a
    payé sur la file de relecture — l'écran doit pouvoir dire la vérité.
    """

    cartes: int
    termes_sans_notion: list[str] = []


class FicheTranscriptOut(BaseModel):
    """Ce que la dictée rend : du TEXTE, jamais un brouillon modifié (règle 7)."""

    transcript: str
    duration_seconds: float


class FicheRemarque(BaseModel):
    section: FicheSection
    index: int
    type: RemarqueType
    message: str
    # Une QUESTION, jamais la phrase corrigée : ZETIS rend le défaut visible, il ne fournit pas
    # la formulation. C'est la frontière entre aider et faire à la place.
    piste: str | None = None


class FicheFeedback(BaseModel):
    """Retour d'analyse — objet FERMÉ à budget, comme le reste du dépôt (addendum §6).

    Sept remarques ne sont pas de l'aide, c'est un bulletin — et un enfant abandonne. D'où les
    deux bornes dures : **1 à 2 réussites, jamais vide**, et **0 à 2 remarques, pas plus**.
    """

    model_config = ConfigDict(extra="forbid")

    reussites: list[str] = Field(min_length=1, max_length=2)
    remarques: list[FicheRemarque] = Field(default_factory=list, max_length=2)
