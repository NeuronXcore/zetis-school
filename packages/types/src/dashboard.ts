// Contrat de `GET /api/parent/dashboard` — agrégat unique du dashboard Papa (ADR-0028).
//
// Types DÉRIVÉS de la réponse réelle du backend, pas devinés : les clés de période sont les
// CHAÎNES "7" | "30" | "90" | "365" (JSON n'a pas de clé entière), et `payload.periods[7]` ne
// compilerait pas — ce qui est exactement le piège qu'on veut fermer à la compilation.
//
// Tout le payload arrive en UNE requête, non filtré : période et matière sont des projections
// que le client applique sur ces tableaux, jamais des query params.

/** Les quatre fenêtres préchargées. Clé d'objet, donc chaîne.
 *
 *  Élargir cette union est VOLONTAIREMENT cassant : chaque `Record<DashboardPeriod, …>` du dépôt
 *  devient incomplet et `tsc` les désigne un par un. C'est le filet qui a évité d'oublier les
 *  libellés d'axe de la courbe mémoire en ajoutant « Année ». */
export type DashboardPeriod = "7" | "30" | "90" | "365";

export interface KpiValue {
  value: number;
  delta: number;
}

/** KPI portant son dénominateur : « 5 / 7 jours », « 12 / 46 notions ». */
export interface KpiOutOf extends KpiValue {
  of: number;
}

export interface KpiGaps extends KpiValue {
  /** Le sous-compte qui rend le KPI actionnable : une lacune sans mission est la seule qui
   *  demande un geste. Calculé serveur — le client ne recroise rien. */
  without_mission: number;
}

export interface DashboardKpis {
  active_minutes: KpiValue;
  active_days: KpiOutOf;
  consolidated: KpiOutOf;
  /** Notions `weak` + `learning` — le seul signal de RÉGRESSION du bandeau (addendum ADR-0028
   *  §5 bis). Volontairement SANS dénominateur : « 13 / 280 » rapporterait les fragiles au
   *  programme entier, non abordées comprises, et suggérerait une proportion qui n'existe pas. */
  fragile: KpiValue;
  open_gaps: KpiGaps;
}

/** 12 points par fenêtre, alignés sur les mêmes bornes que les séries des matières. */
export interface DashboardSparks {
  active_minutes: number[];
  active_days: number[];
  consolidated: number[];
  fragile: number[];
  open_gaps: number[];
}

export interface DashboardPeriodData {
  kpis: DashboardKpis;
  sparks: DashboardSparks;
}

export interface DashboardSchoolYear {
  level: string;
  label: string;
  program_version: string | null;
}

/** Familles d'items en attente d'une décision de Papa. Ordre FIXE côté serveur : il encode la
 *  priorité pédagogique, pas la chronologie. */
export type InboxKind = "validation" | "gap" | "demande" | "referentiel" | "source";

/** Les cinq familles d'objets qui attendent une relecture (adr-0039). Les quiz n'en sont pas :
 *  `quizzes` n'a pas de `validation_status`, il est servi sans gate par doctrine (adr-0014 §2). */
export type ReviewKind = "lesson" | "fiche" | "mindmap" | "capsule" | "chapter";

/** Une part cliquable du détail d'une ligne de la file. Le `href` vient du SERVEUR, comme celui de
 *  la ligne : une règle d'adressage n'a rien à faire dans un composant de présentation
 *  (adr-0028-addendum §6). */
export interface InboxSegment {
  kind: ReviewKind;
  count: number;
  label: string;
  href: string;
}

export interface InboxItem {
  kind: InboxKind;
  count: number;
  label: string;
  detail: string | null;
  href: string;
  /** Vide pour toute famille autre que `validation` — le front garde son repli sur `detail`. */
  breakdown: InboxSegment[];
}

export interface DashboardCalendarDay {
  date: string;
  active_minutes: number;
}

export interface DashboardNotions {
  consolidated: number;
  fragile: number;
  in_progress: number;
  total: number;
}

export interface DashboardSeries {
  covered: number[];
  consolidated: number[];
  fragile: number[];
}

export interface DashboardSubject {
  id: number;
  slug: string;
  name: string;
  /** `null` n'est pas une erreur : `Subject.color` est nullable en base et le repli est une
   *  palette déterministe côté client (présentation, ADR-0028 §3). */
  color: string | null;
  minutes: Record<DashboardPeriod, number>;
  /** 26 semaines, INDÉPENDANT de la période — la grille sert la tendance longue. Jours vides
   *  omis par le serveur, reconstruits par `buildHeatmapGrid`. */
  calendar: DashboardCalendarDay[];
  /** Matrice 8 créneaux × 7 jours, 8 h → 24 h, Europe/Paris. */
  slots: Record<DashboardPeriod, number[][]>;
  /** Activité de 0 h à 8 h, servie à part plutôt que repliée dans un créneau qui la daterait
   *  faussement (ADR-0028 §6). */
  slots_outside_minutes: Record<DashboardPeriod, number>;
  notions: DashboardNotions;
  series: Record<DashboardPeriod, DashboardSeries>;
  /** 14 entiers, J+0 → J+13. */
  review_load: number[];
  gaps_open: number;
  /** `false` = matière SANS AUCUN CHAPITRE dans l'année active.
   *
   *  ⚠️ À ne pas confondre avec `notions.total === 0` : les deux états existent et diffèrent.
   *  Une matière peut avoir ses chapitres sans qu'aucune notion y soit rattachée. C'est
   *  `notions.total === 0` qui commande la barre vide et le libellé « référentiel non généré ». */
  has_referentiel: boolean;
}

/** Une marche de l'entonnoir de production. `missing_href` mène là où se produit ce qui manque
 *  À CETTE marche — servi par le serveur, comme les `href` de la file (adr-0039 §9). */
export interface DashboardContentStage {
  stage: string;
  label: string;
  value: number;
  target: number;
  missing_href: string | null;
  /** Ce que `missing_href` ouvre RÉELLEMENT — et non `target - value`, qui compte aussi ce qui
   *  n'est pas encore produisible (une leçon validée sans cours rédigé). Le nombre et le lien
   *  tiennent ensemble ou n'existent pas. */
  missing_count: number | null;
}

export interface DashboardEvidence {
  count: number;
  kind: string;
  href: string;
}

export type ReadingTrend = "up" | "flat" | "watch";

export interface DashboardReadingItem {
  trend: ReadingTrend;
  text: string;
  /** OBLIGATOIRE : un constat sans preuve adressable n'est pas émis par le serveur. */
  evidence: DashboardEvidence;
}

export interface DashboardPayload {
  school_year: DashboardSchoolYear | null;
  generated_at: string;
  last_activity_at: string | null;
  days_inactive: number;
  inbox: InboxItem[];
  /** Temps actif NON imputable à une matière : connexion, navigation, chat, étapes de mission.
   *  Servi à part pour que la somme des parts du donut égale le KPI « temps actif » — sans lui,
   *  les deux chiffres se contredisaient sur le même écran. */
  unattributed_minutes: Record<DashboardPeriod, number>;
  periods: Record<DashboardPeriod, DashboardPeriodData>;
  /** Plus ancienne bascule connue de `skill_mastery_history` (`null` si la table est vide).
   *
   *  Sert UNIQUEMENT à faire expirer l'avertissement sur la jeunesse de la courbe ambre : ne
   *  l'afficher que si la fenêtre regardée commence AVANT cette date. Une phrase figée aurait été
   *  juste six mois puis fausse pour toujours (addendum ADR-0028 §5 octies). */
  history_since: string | null;
  subjects: DashboardSubject[];
  content_chain: DashboardContentStage[];
  reading: DashboardReadingItem[];
  /** `null` = aucune lacune découverte. La carte ne propose alors rien, plutôt que d'inventer
   *  un travail à faire. */
  proposed_mission: ProposedMission | null;
}

export type ProposedStepType = "eli5" | "vocal_explain" | "mindmap" | "quiz" | "lesson";

export interface ProposedStep {
  step_type: ProposedStepType;
  instruction: string;
}

/**
 * Mission composée EN LECTURE par le moteur de missions (patron preview/confirm, ADR-0010).
 *
 * Le GET qui la sert n'écrit rien : la mission n'existe qu'après confirmation explicite de Papa,
 * sur la surface Missions. Proposition et création voient exactement les mêmes lacunes — sinon la
 * carte proposerait une notion que le bouton ne créerait pas.
 */
export interface ProposedMission {
  skill_id: number | null;
  skill_name: string;
  title: string;
  steps: ProposedStep[];
  estimated_minutes: number;
  mission_type: string;
  /** Où Papa va confirmer. La création reste un geste explicite, jamais un effet d'affichage. */
  confirm_href: string;
}

/** Les quatre KPI, qui sont aussi les quatre focus possibles de la page (ADR-0028 §5). */
export type DashboardFocus = keyof DashboardKpis;
