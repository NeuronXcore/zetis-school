// Carte mentale d'UNE leçon (ADR-0016). Dérivé LEÇON-centré du cours canonique validé, sœur des
// fiches (ADR-0015) : une mindmap = 1 leçon. Le backend produit un `mindmap_json` **sans
// positions** — le placement des nœuds (radial / horizontal / …) est de la PRÉSENTATION, calculé
// côté client (Slice B). Ici : la structure (arbre strict) et le statut de validation.
//
// ARBRE STRICT (décision ADR-0016) : les nœuds sont reliés par `parent` (null = racine, accrochée
// au centre). `edges` reste optionnel/dérivable de `parent`. Pas de liens transverses (graphe) —
// c'est un follow-up. Cf. miroir Pydantic strict côté backend, app/modules/mindmaps/schemas.py.

export type MindmapValidationStatus = "pending" | "validated" | "rejected";

// Un nœud de l'arbre. `parent = null` → racine (branche de premier niveau, accrochée au centre).
export interface MindmapNode {
  id: string;
  label: string;
  parent: string | null;
}

// Arête explicite (optionnelle) — dérivable de `parent`. Présente pour la Slice B si utile.
export interface MindmapEdge {
  from: string;
  to: string;
}

// La donnée de carte, SANS positions (le layout est client, Slice B).
export interface MindmapJson {
  center: string;
  nodes: MindmapNode[];
  edges?: MindmapEdge[];
  required_nodes?: string[]; // pilotent le masquage en training + le barème de reconstruction
  optional_nodes?: string[];
}

// Item de deck (grille matière côté Massimo, liste Papa) — sans le `mindmap_json` complet.
export interface MindmapListItem {
  id: number;
  lesson_id: number;
  title: string; // = `mindmap_json.center`
  chapter: string | null;
  subject_slug: string;
}

// Carte détaillée (viewer Massimo, éditeur Papa) — la structure complète + son statut.
export interface MindmapDetail {
  id: number;
  lesson_id: number;
  title: string;
  chapter: string | null;
  subject_slug: string;
  validation_status: MindmapValidationStatus;
  mindmap_json: MindmapJson;
}

// Arbre de pilotage Papa d'une matière : leçons validées + leurs mindmaps (1 appel).
export interface MindmapPilotageLesson {
  lesson_id: number;
  title: string;
  chapter: string | null;
  has_content: boolean;
  mindmaps: MindmapDetail[];
}

export interface MindmapPilotageTree {
  subject: { id: number; slug: string; name: string };
  lessons: MindmapPilotageLesson[];
}

// --- Reconstruction (mode `student_reconstruction`) : évaluation SERVEUR, déterministe. ---

// Un nœud placé par l'élève : « le nœud de référence `node_id` est accroché sous `parent_id` »
// (`parent_id = null` → accroché au centre). Aucune position ici — la structure seule est notée.
export interface MindmapNodePlacement {
  node_id: string;
  parent_id: string | null;
}

export interface MindmapReconstructionRequest {
  placements: MindmapNodePlacement[];
}

// Détail juste/faux d'UN nœud attendu (renvoyé par l'évaluation serveur).
export interface MindmapNodeEval {
  node_id: string;
  label: string;
  expected_parent: string | null;
  placed_parent: string | null;
  placed: boolean; // l'élève a-t-il placé ce nœud ?
  correct: boolean; // placé ET sous le bon parent
  optional: boolean; // nœud optionnel (hors barème) vs requis
}

// Résultat pur d'une évaluation (POST /mindmaps/{id}/evaluate — sans persistance ni XP).
export interface MindmapReconstructionResult {
  score: number; // 0–100, sur les nœuds requis
  correct_count: number;
  expected_count: number;
  details: MindmapNodeEval[];
}

// Résultat d'une tentative persistée (POST /mindmaps/{id}/attempts — score + XP serveur).
export interface MindmapAttemptResult extends MindmapReconstructionResult {
  attempt_id: number;
  xp_awarded: number;
}
