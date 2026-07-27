// Fiche de révision d'UNE leçon (ADR-0015). Dérivé LEÇON-centré du cours canonique validé :
// une fiche = 1 leçon = 1 page. Vocabulaire FERMÉ, sections à BUDGET (le budget structurel —
// et non une consigne de prompt — garantit le « 1 page ». Cf. miroir Pydantic strict côté backend,
// app/modules/fiches/schemas.py).

export type FicheValidationStatus = "pending" | "validated" | "rejected";

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
