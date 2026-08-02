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
  /** Cartes dues jamais révisées (fraîchement générées) de cette matière — badge « nouveau ». */
  new_count: number;
  /** Ce que servirait le deck de cette matière : `min(REVIEW_SESSION_MAX_SUBJECT, due_count)`,
   *  calculé par le serveur (là où vit le plafond).
   *
   *  ⚠️ C'est CE nombre qu'une surface enfant affiche, jamais `due_count` — qui est l'arriéré,
   *  donc la pression quotidienne que `CLAUDE.md` interdit. La page Révision lit encore
   *  `due_count` pour son badge historique ; aucune nouvelle surface ne doit le faire. */
  session_size: number;
  /** `false` → aucune carte active générée : matière GRISÉE (« pas encore de cartes »), non lançable. */
  has_cards: boolean;
}

/** `GET /api/student/reviews/summary`. */
export interface ReviewsSummary {
  subjects: ReviewSubjectDue[];
  total_due: number;
  /** Nombre de cartes que servirait le « Mélange éclair » (= min(5, total_due)). */
  flash_size: number;
  /** Total de cartes dues jamais révisées (fraîchement générées) — pilote le badge « nouveau ». */
  new_count: number;
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

// --- Pilotage des cartes (page Papa « Cartes SRS », ADR-0013) ---
// Contenu généré EN LOCAL depuis le cours validé, piloté DEPUIS la page Papa (pas d'effet de
// bord de la validation). Types de PILOTAGE Papa, distincts des types élève ci-dessus.
// Endpoints : `/api/memory/cards/*` (rôle parent). Aucune donnée de planification exposée ici.

/** Type de carte généré (variété pédagogique, ADR-0013 §2). */
export type ReviewCardType = "definition" | "method" | "example" | "error_correction";

/** État d'une notion sur la page (chip). */
export type SrsNotionState = "ok" | "to_generate" | "failed" | "suspended";

/** Compte-rendu d'une génération unitaire de notion (upsert 3 branches, §3). */
export interface SrsSkillGenerateResult {
  created: number; // branche B — cartes créées (actives, dues immédiatement)
  updated: number; // branche A — contenu réécrit, planification préservée
  reactivated: number; // carte suspendue/pending réactivée en place
  pending: number; // cas dégradé — sans cours validé, non servie
}

/** Compte-rendu d'une réconciliation par matière : + orphelines suspendues + échecs partiels. */
export interface SrsSubjectGenerateResult extends SrsSkillGenerateResult {
  subject_id: number;
  suspended: number; // branche C — notions orphelines suspendues
  failed_skills: number[]; // notions dont la génération a échoué (le reste a réussi)
}

/** `GET /api/memory/cards/overview` — KPI + résumé par matière (léger). */
export interface SrsOverviewSubject {
  subject_id: number;
  name: string;
  active_cards: number;
  to_generate: number;
  suspended: number;
}
export interface SrsOverviewTotals {
  covered: number;
  active: number;
  to_generate: number;
  suspended: number;
}
export interface SrsCardsOverview {
  subjects: SrsOverviewSubject[];
  totals: SrsOverviewTotals;
}

/** `GET /api/memory/cards/subjects/{id}` — arbre chapitre → leçon → notion (jamais le contenu). */
export interface SrsNotion {
  skill_id: number;
  name: string;
  state: SrsNotionState;
  card_count: number;
}
export interface SrsTreeLesson {
  lesson_id: number;
  title: string;
  notions: SrsNotion[];
}
export interface SrsTreeChapter {
  chapter_id: number;
  name: string;
  lessons: SrsTreeLesson[];
}
export interface SrsSubjectTree {
  subject_id: number;
  name: string;
  chapters: SrsTreeChapter[];
  suspended: SrsNotion[];
}

/** `GET /api/memory/cards/skills/{id}/cards` — recto/verso, chargé à la demande (aperçu). */
export interface SrsCardContent {
  id: number;
  card_type: string;
  front_markdown: string;
  back_markdown: string;
  status: string;
}

/** `PATCH /api/memory/cards/{card_id}` — édition manuelle recto/verso (planification préservée). */
export interface SrsCardUpdate {
  front_markdown: string;
  back_markdown: string;
}

/** `DELETE /api/memory/cards/{card_id}` — suppression d'une carte unique (+ historique). */
export interface SrsCardDeleteResult {
  id: number;
  deleted: number;
}

export interface SrsReactivateResult {
  skill_id: number;
  reactivated: number;
}
export interface SrsDeleteResult {
  skill_id: number;
  deleted: number;
}
