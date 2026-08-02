// Couverture de production (page Papa « Couverture ») — contrat de `GET /api/production/*`.
// Décisions : addendum ADR-0011 §E (fraîcheur) et §F (provenance), ADR-0023.

/** État d'une cellule de la matrice, pour UN dérivé d'UNE leçon.
 * `stale` prime sur `validated` : un dérivé périmé EST validé, et c'est précisément
 * l'information que le ✓ ne doit pas masquer. */
export type CellState = "absent" | "pending" | "validated" | "stale" | "blocked";

/** Deux causes de blocage distinctes, parce que l'action à mener diffère :
 * `blocked_lesson` → agir dans Programme ; `blocked_no_course` → rédiger le cours ici. */
export type RowState = "blocked_lesson" | "blocked_no_course" | "ready" | "complete";

/** QUI a laissé passer le contenu (§F) — jamais totalisé, jamais transformé en relance.
 * `null` sur un objet validé = antérieur à la traçabilité (« provenance inconnue »).
 *
 * L'échelle `parent` → `parent_bulk` → `parent_rule` est celle du §G.1 : une décision humaine à
 * granularité d'attention décroissante (la pièce, le lot, la règle). `system` n'est pas dessus —
 * il dit « servi sans relecture PAR DOCTRINE », et reste réservé au quiz.
 *
 * ⚠️ `parent_rule` est **légale et non émise** (ADR-0032) : elle suppose un lot que personne n'a
 * demandé, ce qui n'existe pas encore. Le type l'accepte avant que la donnée la porte. */
export type ValidatedBy = "parent" | "parent_bulk" | "parent_rule" | "system";

export interface CoverageCell {
  state: CellState;
  derived_at: string | null;
  validated_by: ValidatedBy | null;
  /** Cible d'un « Régénérer » (la leçon pour la colonne Cours). `null` si `absent`/`blocked`. */
  object_id: number | null;
}

/** Colonne notion-centrée : une fraction, et **aucun état de fraîcheur** (§E.5). */
export interface CoverageFraction {
  covered: number;
  total: number;
}

/** Une notion de la leçon, et ce qu'elle porte de consommable.
 *  `skill_id` est la cible des générations lancées depuis la matrice. */
export interface CoverageNotionItem {
  skill_id: number;
  name: string;
  has_card: boolean;
  has_capsule: boolean;
}

export interface CoverageNotions {
  cards: CoverageFraction;
  capsules: CoverageFraction;
  items: CoverageNotionItem[];
}

export interface CoverageCells {
  cours: CoverageCell;
  quiz: CoverageCell;
  fiche: CoverageCell;
  mindmap: CoverageCell;
}

/** Les quatre colonnes leçon-centrées, dans l'ordre d'affichage de la matrice. */
export type CoverageCellKey = keyof CoverageCells;

export interface CoverageLesson {
  id: number;
  title: string;
  row_state: RowState;
  cells: CoverageCells;
  notions: CoverageNotions;
}

export interface CoverageChapter {
  id: number;
  title: string;
  lessons: CoverageLesson[];
}

export interface CoverageSubject {
  id: number;
  name: string;
  slug: string;
  chapters: CoverageChapter[];
}

export interface CoverageSchoolYear {
  id: number;
  label: string;
  level: string;
}

export interface CoverageTotals {
  lessons: number;
  lessons_validated: number;
  courses_written: number;
  /** Porte sur quiz · fiche · mindmap UNIQUEMENT — le cours en est la condition, pas un dérivé. */
  derivatives_percent: number;
  pending_count: number;
  stale_count: number;
  orphan_count: number;
}

export interface Coverage {
  school_year: CoverageSchoolYear | null;
  totals: CoverageTotals;
  subjects: CoverageSubject[];
}

export type OrphanType = "fiche" | "mindmap" | "quiz";

export interface ProductionOrphan {
  type: OrphanType;
  id: number;
  title: string;
  subject: string | null;
  archived_at: string | null;
  /** Vrai → suppression désactivée : on n'efface pas l'historique de Massimo pour faire propre. */
  has_history: boolean;
}

// --- Production en lot (ADR-0031) --------------------------------------------------------------

/** Une notion dans l'aperçu d'un lot. `reason` renseigné = bloquée par le gate du §7. */
export interface ProductionNotion {
  skill_id: number;
  name: string;
  reason?: string | null;
}

/** Ce qu'un lot ferait, SANS rien créer. Le gate doit être visible AVANT le clic : sans lui, un
 *  chapitre neuf rendrait « rien produit », que Papa lirait comme un échec. */
export interface ProductionPreview {
  chapter_id: number;
  eligible: ProductionNotion[];
  blocked: ProductionNotion[];
  pending_backlog: number;
  max_pending: number;
}

export type ProductionRunStatus = "queued" | "running" | "done" | "failed";

/** État d'un lot. Un ÉTAT, jamais du contenu. */
export interface ProductionRun {
  id: number;
  status: ProductionRunStatus;
  trigger: string;
  authorized_by: string;
  chapter_id: number | null;
  total_notions: number | null;
  done_notions: number | null;
  /** Avancement RÉEL (0-100), calculé serveur — jamais une estimation de durée côté client. */
  progress_pct: number;
  created_at: string;
  finished_at: string | null;
}
