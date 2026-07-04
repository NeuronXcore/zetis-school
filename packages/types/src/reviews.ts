/**
 * Contrats API de la révision espacée (page Massimo « Révision », /revision).
 * Miroir des schémas Pydantic `app/modules/memory/schemas.py` (règle CLAUDE.md n°8).
 *
 * La mécanique SRS est INVISIBLE côté Massimo : aucun champ de planification
 * (`due_at`, `interval_days`, `ease_factor`) n'est jamais servi à l'élève.
 */

/** Notes de révision (mapping code inchangé ; l'UI les habille 🔄🤔🙂⚡). */
export type ReviewRating = "again" | "hard" | "good" | "easy";

/** Deck demandé à `POST /api/student/reviews/session`. */
export type ReviewDeck = "mix_day" | "mix_flash" | { subject: string };

/** Une matière et son nombre EXACT de cartes dues (le « 15+ » est de la présentation). */
export interface ReviewSubjectDue {
  slug: string;
  name: string;
  due_count: number;
}

/** `GET /api/student/reviews/summary`. */
export interface ReviewsSummary {
  subjects: ReviewSubjectDue[];
  total_due: number;
  /** Nombre de cartes que servirait le « Mélange éclair » (= min(5, total_due)). */
  flash_size: number;
}

/** Carte servie en session — jamais de champ de planification. */
export interface ReviewCard {
  card_id: number;
  subject_slug: string;
  front_markdown: string;
  back_markdown: string;
}

/** `POST /api/student/reviews/session`. */
export interface ReviewSessionRequest {
  deck: ReviewDeck;
}

/** `POST /api/student/reviews/cards/{card_id}/attempt`. */
export interface ReviewAttemptRequest {
  rating: ReviewRating;
}

/** Réponse d'un attempt. La consolidation (re-tour) est détectée CÔTÉ SERVEUR. */
export interface ReviewAttemptResult {
  /** ISO 8601 — prochaine échéance de la carte (inchangée en cas de consolidation). */
  next_due_at: string | null;
  xp_awarded: number;
  is_consolidation: boolean;
}

// --- Génération de cartes (ADR-0013) ---
// Les cartes sont générées EN LOCAL à partir du cours validé d'une leçon. Elles HÉRITENT de
// la validation de leur leçon source (pas de file de relecture par carte) : le déclencheur
// est la validation d'une leçon (auto) + un endpoint manuel Papa de secours/régénération.

/** Type de carte généré (variété pédagogique, ADR-0013 §2). */
export type ReviewCardType = "definition" | "method" | "example" | "error_correction";

/**
 * Compte-rendu de `POST /api/lessons/{id}/generate-cards` — upsert 3 branches (ADR-0013 §3).
 * La régénération préserve la planification acquise (jamais de réinitialisation).
 */
export interface CardGenerationResult {
  /** Branche B — cartes créées (actives, dues immédiatement). */
  created: number;
  /** Branche A — contenu réécrit, planification (`due_at`/intervalle) préservée. */
  updated: number;
  /** Carte suspendue/pending réactivée en place. */
  reactivated: number;
  /** Cas dégradé — générée sans cours validé, non servie tant qu'un cours ne l'adosse pas. */
  pending: number;
}
