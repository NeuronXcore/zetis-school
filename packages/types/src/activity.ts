/**
 * Activité de Massimo vue par Papa : heatmap de régularité, détail d'un jour, sessions.
 *
 * Miroir des schémas Pydantic `apps/backend/app/modules/activity/schemas.py` (règle CLAUDE.md
 * n°8). Ces types sont STRICTEMENT côté Papa : rien de ce tracking ne remonte dans l'interface
 * de Massimo.
 *
 * Le client n'invente aucun chiffre — minutes actives, sessions, deltas et décrochage arrivent
 * calculés du serveur. Seuls les paliers de couleur de la heatmap sont de la présentation.
 */

/** Un jour de la heatmap. Les jours SANS activité sont omis du payload et reconstruits côté client. */
export interface ActivityHeatmapDay {
  /** Jour Europe/Paris, `AAAA-MM-JJ`. */
  date: string;
  /**
   * Intensité de la case : temps actif, PAS le nombre d'événements (une lecture de cours de
   * 20 min vaut plus qu'un clic). Indicateur de présence, pas mesure d'attention.
   */
  active_minutes: number;
  /** Nombre d'événements du jour (information secondaire, jamais l'intensité). */
  events: number;
  /** XP du jour, sommé depuis `xp_events` — métrique séparée du journal d'activité. */
  xp: number;
}

export interface ActivityHeatmap {
  days: ActivityHeatmapDay[];
  /**
   * Jours consécutifs sans activité en fin de série, TOUTES matières confondues (un filtre
   * matière actif ne fausse pas le signal). Badge de décrochage Papa à partir de 4.
   */
  days_inactive: number;
}

/** Une ligne du journal, servie prête à afficher (le client ne recalcule rien). */
export interface ActivityEntry {
  /** Heure locale « HH:MM » (Europe/Paris). */
  time: string;
  /** Type brut — sert au mapping vers une icône Lucide. */
  event_type: string;
  /** Libellé humain déjà formulé côté serveur (« Cours lu », « Révision SRS · 8 cartes »). */
  label: string;
  subject_slug?: string | null;
  skill_name?: string | null;
  xp: number;
  /** Minutes attribuées à cet événement (écart plafonné jusqu'au suivant). */
  minutes: number;
  /** Complément court : titre de leçon, score du quiz, route visitée… */
  detail?: string | null;
  /** Présent uniquement sur une ligne de révisions agrégée : nombre de cartes. */
  count?: number | null;
}

export interface ActivityDayDetail {
  date: string;
  /** Journal trié, `review_attempted` consécutifs déjà agrégés par le serveur. */
  events: ActivityEntry[];
}

/** Une session reconstruite (coupure à 15 min d'inactivité) — jamais stockée en base. */
export interface ActivitySession {
  /** Instant ISO 8601 (UTC) du premier événement — pour calculer, pas pour afficher. */
  started_at: string;
  /** Instant ISO 8601 (UTC) du dernier événement — pour calculer, pas pour afficher. */
  ended_at: string;
  /**
   * Bornes « HH:MM » déjà en Europe/Paris : à AFFICHER telles quelles. Ne pas reformater
   * `started_at` côté client — la conversion suivrait le fuseau du navigateur et pourrait
   * contredire le `time` des événements de la même carte, calculé serveur.
   */
  started_time: string;
  ended_time: string;
  active_minutes: number;
  events: ActivityEntry[];
}

/** Un jour de la vue Sessions. `sessions: []` = aucune session — l'absence est une information. */
export interface ActivitySessionDay {
  date: string;
  sessions: ActivitySession[];
}

export interface ActivitySessions {
  /** Jours de la période, du plus RÉCENT au plus ancien. */
  days: ActivitySessionDay[];
}

// `KpiValue`, `KpiCount` et `DashboardKpis` ont quitté ce fichier avec le contrat qu'ils
// décrivaient (ADR-0028 §1). `GET /api/parent/dashboard` sert désormais un agrégat complet, typé
// dans `./dashboard` : `sessions`, `xp` et `missions_completed` ne sont plus des KPI de pilotage,
// et les deux stocks portent enfin un delta — les horodatages de bascule dont leur absence de
// delta dépendait ont été ajoutés depuis (`mastered_at`, `resolved_at`, `skill_mastery_history`).

/** Une lacune ouverte (`GET /api/parent/progress/gaps`). Formulation bienveillante côté UI :
 *  « notion à renforcer », jamais « échec » (CLAUDE.md §pédagogie). */
export interface OpenGap {
  skill_id: number;
  skill_name: string;
  subject_slug?: string | null;
  subject_name?: string | null;
  severity: "low" | "medium" | "high";
  status: "open" | "in_progress";
  first_detected_at?: string | null;
}

/** Une notion consolidée (`GET /api/parent/progress/consolidated`) — `mastered`, score ≥ 90. */
export interface ConsolidatedSkill {
  skill_id: number;
  skill_name: string;
  subject_slug?: string | null;
  subject_name?: string | null;
  mastery_score: number;
  last_seen_at?: string | null;
}

/** Body de `POST /api/telemetry/pageview` — le SERVEUR horodate, jamais le client. */
export interface PageViewRequest {
  route: string;
}
