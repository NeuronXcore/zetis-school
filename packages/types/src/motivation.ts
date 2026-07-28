/**
 * Auto-motivation de Massimo : régularité douce, engagement hebdomadaire, messages de ZETIS.
 *
 * Miroir de `apps/backend/app/modules/motivation/schemas.py`.
 *
 * Ces types sont ceux de l'ENFANT. Deux règles les gouvernent :
 * - le client **n'invente aucune phrase** — les textes viennent du serveur et s'affichent tels
 *   quels ; `code` sert à choisir une illustration, jamais à réinterpréter ;
 * - **rien ne peut se lire comme une punition** : aucun champ `missed`, `failed`, `remaining`,
 *   `streak` ou `best` n'existe, ici comme côté serveur.
 */

/** Une case de la semaine. Les 7 sont toujours servies, jours à venir compris. */
export interface MotivationDay {
  /** Jour Europe/Paris, `AAAA-MM-JJ`. */
  date: string;
  /** Massimo est venu ce jour-là (au moins un événement d'activité). */
  active: boolean;
  is_today: boolean;
}

/** `GET`/`PUT /api/student/motivation/week`. */
export interface MotivationWeek {
  /** Lundi de la semaine courante, `AAAA-MM-JJ`. */
  week_start: string;
  /** Toujours 7 entrées, dans l'ordre lundi → dimanche. Le client ne construit aucune grille. */
  days: MotivationDay[];
  /**
   * Nombre de jours venus cette semaine. C'est un COMPTE, pas une série : il ne peut pas casser,
   * et le lundi il repart de 0 avec 7 cases vides — un départ, pas une chute.
   */
  days_done: number;
  today_done: boolean;
  /** `null` = aucun engagement pris cette semaine (état qui invite à en choisir un). */
  goal_days: number | null;
  goal_met: boolean;
}

/** Codes du message d'accueil. Servent à choisir une illustration, jamais à recomposer le texte. */
export type WelcomeCode =
  | "first_visit"
  | "back_after_break"
  | "back_short_break"
  | "no_goal_yet"
  | "goal_reached_today"
  | "goal_reached"
  | "progress_visible"
  | "resume_notion"
  | "reviews_due"
  | "all_clear";

/** Codes du mot de fin de séance. */
export type WrapUpCode =
  | "week_goal_reached"
  | "mission_in_progress"
  | "reviews_left"
  | "day_done"
  | "all_clear";

export interface MotivationCta {
  label: string;
  /** Destination logique (« missions », « revision »…) — le client la mappe sur une route. */
  target: string;
}

/** Message composé SERVEUR. `title` et `subtitle` s'affichent VERBATIM. */
export interface MotivationMessage {
  code: string;
  title: string;
  subtitle?: string | null;
  /** `null` = aucune action proposée, donc aucun bouton. */
  cta?: MotivationCta | null;
}

/**
 * Ce qui a servi à choisir le message. Sert à l'illustration et à alimenter d'autres blocs —
 * **jamais** à fabriquer une phrase.
 */
export interface MotivationContext {
  first_name: string;
  last_notion?: string | null;
  /**
   * Jours écoulés depuis la dernière venue. Présent pour que l'UI choisisse une illustration ;
   * il ne doit JAMAIS être affiché — le nombre de jours d'absence n'est pas lu par l'enfant.
   */
  days_since_last_visit?: number | null;
  consolidated_this_week: number;
  gaps_closed_this_week: number;
  reviews_due: number;
  regularity: MotivationWeek;
}

/** `GET /api/student/motivation/welcome`. */
export interface MotivationWelcome extends MotivationMessage {
  context: MotivationContext;
}

/** Body de `PUT /api/student/motivation/week` — la semaine est déduite serveur. */
export interface MotivationGoalRequest {
  /** 1 à 7. « 0 jour » n'est pas un engagement et n'existe pas. */
  target_days: number;
}
