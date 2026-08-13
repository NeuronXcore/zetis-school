// Fiche de révision d'UNE leçon (ADR-0015). Dérivé LEÇON-centré du cours canonique validé :
// une fiche = 1 leçon = 1 page. Vocabulaire FERMÉ, sections à BUDGET (le budget structurel —
// et non une consigne de prompt — garantit le « 1 page ». Cf. miroir Pydantic strict côté backend,
// app/modules/fiches/schemas.py).

// `personal` et `personal_draft` sont HORS cycle éditorial (addendum ADR-0015 §2) : la fiche de
// Massimo n'est ni validée ni rejetée — elle est à lui. Elles servent aussi de sécurité par
// construction : un lecteur qui oublierait le filtre d'auteur garde son `=== "validated"`, donc
// il exclut naturellement la fiche personnelle.
export type FicheValidationStatus =
  | "pending"
  | "validated"
  | "rejected"
  | "personal"
  | "personal_draft";

// Le SECOND AXE. `source` (generated|manual) dit COMMENT la fiche a été produite ; `author` dit
// À QUI elle est. Ne jamais fondre les deux.
export type FicheAuthor = "zetis" | "massimo";

export interface FicheDefinition {
  terme: string;
  definition: string;
}

export interface FicheSpec {
  title: string;
  subject: string;
  level: string;
  chapter?: string;
  essentiel: string; // 2–3 phrases
  definitions: FicheDefinition[]; // 0–4
  points_cles: string[]; // 0–5
  erreurs_a_eviter: string[]; // 0–3
  mini_exemple?: string; // 0–1
}

// Item de deck (grille matière côté Massimo, liste Papa) — sans le spec complet.
export interface FicheListItem {
  id: number;
  lesson_id: number;
  title: string;
  chapter: string | null;
  subject_slug: string;
  seen: boolean;
}

// Une tuile par LEÇON — l'écran de fabrication (`page-fiches.md` écran 2).
//
// ⚠️ Leçon-centré, pas fiche-centré : la liste fiche-centrée ne peut montrer ni un travail
// COMMENCÉ (un brouillon n'est pas une fiche) ni une leçon À FABRIQUER (il n'y a pas d'objet).
// Une fiche interrompue était donc perdue de vue, alors que le serveur la gardait.
//
// **Aucun état n'est un reproche** : « commencée » ne dit jamais « inachevé », et rien ne
// décompte de jours.
export type FicheTileEtat = "commencee" | "ma_fiche" | "zetis" | "a_fabriquer";

export interface FicheTile {
  lesson_id: number;
  title: string;
  chapter: string | null;
  subject_slug: string;
  etat: FicheTileEtat;
  draft_id: number | null; // son brouillon à reprendre
  fiche_id: number | null; // sa fiche finie, ou à défaut celle de ZETIS
  zetis_fiche_id: number | null; // le corrigé, toujours à un clic
  seen: boolean;
  versions: number;
  etapes_remplies: number;
  points_choisis: number;
}

// Arbre de pilotage Papa d'une matière : leçons validées + leurs fiches (1 appel).
export interface FichePilotageLesson {
  lesson_id: number;
  title: string;
  chapter: string | null;
  has_content: boolean;
  fiches: FicheDetail[];
}

export interface FichePilotageTree {
  subject: { id: number; slug: string; name: string };
  lessons: FichePilotageLesson[];
}

// Résumé des decks (écran d'accueil Massimo) : une matière de l'année active + son compteur.
export interface FichesSummarySubject {
  slug: string;
  name: string;
  fiche_count: number;
  new_count: number; // fiches validées jamais ouvertes (badge « Nouveau »)
}

export interface FichesSummary {
  subjects: FichesSummarySubject[];
}

// Fiche détaillée (viewer Massimo, éditeur Papa) — le spec complet + son statut.
export interface FicheDetail {
  id: number;
  lesson_id: number;
  title: string;
  chapter: string | null;
  subject_slug: string;
  validation_status: FicheValidationStatus;
  spec: FicheSpec;
  seen: boolean;
}

// ---------------------------------------------------------------------------
// L'atelier — la fiche que Massimo fabrique lui-même (addendum ADR-0015).
// ---------------------------------------------------------------------------

// État INTERMÉDIAIRE : mêmes champs, tous optionnels, mêmes bornes MAX, aucune borne MIN.
// Un brouillon n'est PAS un FicheSpec — il n'est ni servi, ni imprimable, ni dérivable ; il
// DEVIENT une fiche le jour où il valide le schéma strict.
export interface FicheDraft {
  title?: string | null;
  subject?: string | null;
  level?: string | null;
  chapter?: string | null;
  essentiel?: string | null;
  definitions: FicheDefinition[];
  points_cles: string[];
  erreurs_a_eviter: string[];
  mini_exemple?: string | null;
}

export interface FicheDraftDetail {
  id: number;
  lesson_id: number;
  subject_slug: string;
  lesson_title: string;
  chapter: string | null;
  version: number;
  draft: FicheDraft;
}

// Vocabulaire FERMÉ. La slice 1 n'implémente que `points_cles` — la seule section qui se
// CHOISIT. `essentiel` est une synthèse : par définition absente du cours, donc rien à choisir.
export type FicheSection =
  | "essentiel"
  | "definitions"
  | "points_cles"
  | "erreurs_a_eviter"
  | "mini_exemple";

// Une phrase tirée du cours, jamais écrite par ZETIS (règle 7 du §5).
// ⚠️ Les candidates non retenues NE SONT PAS FAUSSES : vraies mais secondaires.
export interface FicheCandidate {
  index: number;
  texte: string;
  // Pourquoi ZETIS propose CELLE-CI — renseigné pour `erreurs_a_eviter` seulement, et c'est
  // tout ce qui rend la proposition acceptable : il ne suggère pas une idée, il rappelle un
  // FAIT de Massimo (« tu t'es trompé 2 fois là-dessus »). Sans la raison, « Attention à : les
  // fractions » serait un conseil sorti de nulle part.
  raison?: string | null;
}

// Ce qu'une section offre pour DÉMARRER — et chaque section démarre autrement :
//   points_cles → 12 phrases du cours, il CHOISIT
//   definitions → jusqu'à 4 TERMES, ZETIS donne le mot, il ÉCRIT la définition
//   essentiel   → aucune candidate, une AMORCE : c'est une synthèse, absente du cours
export interface FicheCandidates {
  section: FicheSection;
  candidates: FicheCandidate[];
  slots: number; // emplacements offerts par la section (5 pour points_cles)
  // Début de phrase posé dans le champ. Règle 1 des champs libres : jamais de zone vide —
  // la page blanche est ce qui fait recopier le cours.
  amorce?: string | null;
}

// Ce que la dictée rend : du TEXTE, jamais un brouillon modifié. La règle 7 vaut aussi pour sa
// propre voix — ZETIS n'écrit jamais dans la fiche à la place de Massimo.
export interface FicheTranscript {
  transcript: string;
  duration_seconds: number;
}

// `absent_du_cours` est hors périmètre v1 : seul type à faux positifs, et un faux positif ici
// est une injustice. Il reste au vocabulaire pour que le contrat ne bouge pas en l'activant.
export type FicheRemarqueType =
  | "recopie"
  | "trop_long"
  | "idee_manquante"
  | "absent_du_cours";

export interface FicheRemarque {
  section: FicheSection;
  index: number;
  type: FicheRemarqueType;
  message: string;
  piste?: string | null; // une QUESTION, jamais la phrase corrigée
}

// Objet fermé à budget : 1–2 réussites (jamais vide), 0–2 remarques MAXIMUM.
// Sept remarques ne sont pas de l'aide, c'est un bulletin — et un enfant abandonne.
export interface FicheFeedback {
  reussites: string[];
  remarques: FicheRemarque[];
}

// Budgets structurels de la fiche (« 1 leçon = 1 page ») — MIROIR du schéma Pydantic
// (apps/backend/app/modules/fiches/schemas.py). L'enforcement DUR reste côté serveur ;
// ces valeurs pilotent l'UX de l'éditeur Papa (caps de listes, longueurs, compteurs).
export const FICHE_BUDGETS = {
  title: 160,
  chapter: 160,
  essentiel: 600,
  miniExemple: 400,
  definitions: 4,
  pointsCles: 5,
  erreurs: 3,
  terme: 80,
  definition: 300,
  ligne: 160,
} as const;
