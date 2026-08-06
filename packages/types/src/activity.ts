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
  /** Une mission `planned|active` (tous types) couvre-t-elle déjà cette notion ? Sépare ce qui
   *  attend une décision de Papa de ce qui est déjà en route. Calculé serveur. */
  has_active_mission?: boolean;
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

// --- Page « Progression » : l'avancement du programme, matière par matière (ADR-0038) -----------
//
// ⚠️ `engaged` et `notions.consolidated` sont DEUX mesures, jamais fondues, jamais additionnées.
// La première dit ce qui a été ABORDÉ, la seconde ce qui est ACQUIS. Sur les données réelles il y
// a 1 notion consolidée sur 280 : une barre bâtie sur la seconde afficherait zéro partout pendant
// des mois. Le vocabulaire de « consolidée » ne bouge pas — on mesure autre chose, et on le nomme
// autrement.

/** Répartition des notions d'une matière — la MÊME que `DashboardSubject.notions`. */
export interface ProgressionNotions {
  consolidated: number;
  fragile: number;
  in_progress: number;
  /** Notions AU PROGRAMME. ⚠️ `total === 0` n'est PAS « pas de référentiel » : une matière peut
   *  avoir ses chapitres sans qu'aucune notion y soit rattachée. Voir `has_referentiel`. */
  total: number;
}

/** Une ligne de la page Progression (`GET /api/parent/progress/overview`). */
export interface ProgressionSubject {
  subject_id: number;
  slug: string;
  name: string;
  color?: string | null;
  icon?: string | null;
  notions: ProgressionNotions;
  /** Notions portant une ligne de maîtrise = consolidées ∪ fragiles ∪ en cours. NUMÉRATEUR de la
   *  barre d'avancement — jamais un taux d'acquisition. */
  engaged: number;
  /** Cumul sur toute l'histoire, sans fenêtre. Cette page est la seule maison du XP côté Papa. */
  xp: number;
  /** ⚠️ **La colonne « À renforcer » affiche `notions.fragile`, PAS ce champ.** Les deux
   *  populations sont disjointes : sur la base réelle, Français porte 8 notions fragiles et 1
   *  seule lacune ouverte, et le constat du dashboard qui pointe ici annonce 8. Ce compte-ci est
   *  celui de la page `/lacunes` ; il ne se substitue jamais à `notions.fragile`. */
  gaps_open: number;
  /** « Au moins un chapitre dans l'année active » — la définition du dashboard, donc celle du
   *  constat qui pointe ici. `false` → la ligne RESTE affichée, avec son état écrit. */
  has_referentiel: boolean;
}

/** `GET /api/parent/progress/overview` — une seule requête au montage, aucun état de période. */
export interface ProgressionOverview {
  generated_at: string;
  school_year?: { label: string; level: string } | null;
  subjects: ProgressionSubject[];
}

// --- Index des notions (`GET /api/parent/progress/skills`, adr-0040 §11) -------------------------

/** Palier d'une notion — dérivé serveur du regroupement canonique, jamais recalculé au front. */
export type NotionPalier = "acquise" | "a_renforcer" | "en_cours" | "non_abordee";

/**
 * Depuis combien de temps la notion n'a pas bougé.
 *
 * ⚠️ **Ce n'est PAS un `number | null`**, et c'est la décision du §7 : un `null` unique dirait à la
 * fois « jamais abordée », « bascule antérieure à la trace » et « date perdue à la migration ».
 * Trois causes, dont **une seule se comblera d'elle-même** — les fondre rendrait l'écran incapable
 * de dire laquelle.
 *
 * - `{ days }` — dernière bascule datée ;
 * - `{ unknown: "before_history" }` — abordée, mais sa dernière bascule précède `history_since`.
 *   Se comblera à la prochaine bascule ;
 * - `{ unknown: "before_migration" }` — consolidée avant que `mastered_at` n'existe. **Perdue** ;
 * - `null` — **non abordée**, aucune ligne de maîtrise. Et lui seul.
 */
export type NotionSince =
  | { days: number }
  | { unknown: "before_history" | "before_migration" }
  | null;

/** Une notion dans l'index. */
export interface SkillIndexRow {
  skill_id: number;
  skill_name: string;
  subject_id: number;
  subject_name: string;
  subject_slug?: string | null;
  palier: NotionPalier;
  mastery_score?: number | null;
  /** ⚠️ **Axe INDÉPENDANT du palier** (§4), jamais une colonne à trois valeurs : une notion peut
   *  être « à renforcer » sans lacune, et porter une lacune ouverte en étant « en cours ». Sur la
   *  base réelle : 13 « à renforcer » pour 1 seule lacune ouverte. */
  has_open_gap: boolean;
  gap_severity?: string | null;
  has_active_mission: boolean;
  since: NotionSince;
}

export interface SkillIndexSubject {
  subject_id: number;
  name: string;
  slug?: string | null;
}

/** Les cinq natures de fait servies par la vue période (§2). **Ni XP ni production** : l'XP
 *  porterait le même mot que la colonne « depuis toujours » et serait le seul compteur que le
 *  journal ne pourrait pas recomposer ; la production mesure le stock de contenu, sa maison est
 *  Couverture. */
export type DatedFactKind =
  | "mastery_transition"
  | "gap_opened"
  | "gap_resolved"
  | "mission_done"
  | "quiz_scored"
  | "review_scored";

/** Un fait daté. Les champs de détail sont renseignés selon la nature, jamais tous ensemble. */
export interface DatedFact {
  kind: DatedFactKind;
  at: string;
  skill_id?: number | null;
  skill_name?: string | null;
  subject_id?: number | null;
  from_status?: string | null;
  to_status?: string | null;
  severity?: string | null;
  verdict?: string | null;
  score?: number | null;
  rating?: string | null;
}

/** `GET /api/parent/progress/skills` — une passe agrégée, aucun paramètre de période. */
export interface SkillIndex {
  notions: SkillIndexRow[];
  /** Dans l'ORDRE DE L'ANNÉE (`sort_order`), jamais alphabétique : un tri divergent ferait se
   *  contredire deux vues du même écran (§4 bis). */
  subjects: SkillIndexSubject[];
  /** Débuts de trace, déclarés à l'écran (§6) : un compteur bas dit « pas de trace », jamais
   *  « pas de mouvement ». `null` = aucune trace du tout. */
  history_since: string | null;
  reviews_since: string | null;
  /** Journal servi sur la fenêtre la PLUS LARGE (365 j) ; le client filtre à 7/30/90 **sans
   *  requête**. Ce n'est pas de la commodité : le §6 exige que les compteurs se DÉRIVENT du
   *  journal affiché, donc le client doit posséder le journal. */
  facts: DatedFact[];
  facts_since: string | null;
}

/** Une bascule de palier dans la frise d'une notion. */
export interface TimelineTransition {
  /** `null` sur la plus ancienne bascule tracée : la trace ne porte pas son palier de départ. */
  from_status: string | null;
  to_status: string;
  mastery_score: number;
  changed_at: string;
}

/** `GET /api/parent/progress/skills/{id}/timeline` — paresseuse, chargée au dépliage. */
export interface SkillTimeline {
  skill_id: number;
  skill_name: string;
  transitions: TimelineTransition[];
  history_since: string | null;
}
