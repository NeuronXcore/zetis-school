// Dérivations client du dashboard Papa — PRÉSENTATION uniquement (ADR-0028 §3).
//
// Frontière à ne pas franchir : on somme des minutes, on empile des compteurs, on reconstruit des
// jours vides, on choisit un palier de couleur. On ne décide JAMAIS qu'une notion est consolidée
// ou fragile — ces statuts viennent du serveur, qui en est la source unique. **La première fois
// qu'une fonction de ce fichier calcule un statut pédagogique, l'ADR est violé.**
//
// C'est ce qui permet à « Toutes matières » d'exister sans que le serveur ait à la pré-agréger,
// et donc au filtrage de ne coûter aucune requête.
//
// Fonctions pures, sans React ni DOM : testables directement.
import type {
  DashboardFocus,
  DashboardNotions,
  DashboardPeriod,
  DashboardSeries,
  DashboardSubject,
} from "@zetis/types";
import type { ActivityHeatmapDay } from "@zetis/types";

/** Temps actif cumulé des matières visibles sur la fenêtre. */
export function sumMinutes(subjects: DashboardSubject[], period: DashboardPeriod): number {
  return subjects.reduce((total, s) => total + (s.minutes[period] ?? 0), 0);
}

/**
 * Calendrier fusionné, au format attendu par `buildHeatmapGrid`.
 *
 * `events` et `xp` sont mis à 0 : l'agrégat ne les sert plus, et la grille n'en a pas besoin —
 * son intensité encode les MINUTES ACTIVES. Les afficher à 0 serait faux, c'est pourquoi la
 * nouvelle carte n'en montre aucun.
 */
export function sumCalendar(subjects: DashboardSubject[]): ActivityHeatmapDay[] {
  const byDate = new Map<string, number>();
  for (const subject of subjects) {
    for (const day of subject.calendar) {
      byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.active_minutes);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, active_minutes]) => ({ date, active_minutes, events: 0, xp: 0 }));
}

/** Matrice 8 × 7 des créneaux, sommée sur les matières visibles. */
export function sumSlots(subjects: DashboardSubject[], period: DashboardPeriod): number[][] {
  const matrix = Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0));
  for (const subject of subjects) {
    const slots = subject.slots[period] ?? [];
    slots.forEach((row, slot) =>
      row.forEach((value, day) => {
        matrix[slot][day] += value;
      }),
    );
  }
  return matrix;
}

/** Minutes d'activité hors plage 8 h–24 h, cumulées. Affichées en note, jamais repliées. */
export function sumOutsideMinutes(
  subjects: DashboardSubject[],
  period: DashboardPeriod,
): number {
  return subjects.reduce((total, s) => total + (s.slots_outside_minutes[period] ?? 0), 0);
}

/** Les trois courbes de « Évolution de la mémoire », sommées point à point. */
export function sumSeries(
  subjects: DashboardSubject[],
  period: DashboardPeriod,
): DashboardSeries {
  const add = (key: keyof DashboardSeries): number[] => {
    const rows = subjects.map((s) => s.series[period]?.[key] ?? []);
    const length = Math.max(0, ...rows.map((r) => r.length));
    return Array.from({ length }, (_, i) => rows.reduce((total, r) => total + (r[i] ?? 0), 0));
  };
  return { covered: add("covered"), consolidated: add("consolidated"), fragile: add("fragile") };
}

/** Compteurs de notions empilés. Un empilement, pas une décision de statut. */
export function sumNotions(subjects: DashboardSubject[]): DashboardNotions {
  return subjects.reduce<DashboardNotions>(
    (total, s) => ({
      consolidated: total.consolidated + s.notions.consolidated,
      fragile: total.fragile + s.notions.fragile,
      in_progress: total.in_progress + s.notions.in_progress,
      total: total.total + s.notions.total,
    }),
    { consolidated: 0, fragile: 0, in_progress: 0, total: 0 },
  );
}

/** Charge de révision cumulée, J+0 → J+13. */
export function sumReviewLoad(subjects: DashboardSubject[]): number[] {
  return Array.from({ length: 14 }, (_, day) =>
    subjects.reduce((total, s) => total + (s.review_load[day] ?? 0), 0),
  );
}

/** Notions « non abordées » : le reste du programme. Soustraction, pas un statut. */
export function notAddressed(notions: DashboardNotions): number {
  return Math.max(
    0,
    notions.total - notions.consolidated - notions.fragile - notions.in_progress,
  );
}

/**
 * Carte de dépendance entre une mesure et ses preuves (ADR-0028 §5).
 *
 * Ce n'est pas un effet décoratif : cliquer un KPI ne « surligne » pas, il répond à *quelles
 * cartes justifient ce chiffre*. C'est aussi ce qui rend huit diagrammes praticables sur une
 * page — sans lui, il faudrait en retirer.
 */
export const CARD_SCOPES: Record<string, DashboardFocus[]> = {
  heatmap: ["active_minutes", "active_days"],
  repartition: ["active_minutes"],
  memoire: ["consolidated"],
  notions: ["consolidated", "open_gaps"],
  "ou-agir": ["active_minutes", "consolidated", "open_gaps"],
  charge: ["active_days", "consolidated"],
  chaine: ["open_gaps"],
  lecture: ["consolidated", "open_gaps"],
};

/** La carte répond-elle à la question posée par le focus courant ? */
export function matchesFocus(card: string, focus: DashboardFocus | null): boolean {
  if (!focus) return true;
  return (CARD_SCOPES[card] ?? []).includes(focus);
}

/** Seuil au-delà duquel une soirée de révision devient longue pour un soir de semaine (spec §6). */
export const REVIEW_LOAD_WARN = 15;

/** Seuil d'affichage du badge de décrochage — à la consultation seulement, jamais en push. */
export const DROPOUT_THRESHOLD = 4;

/** Libellés des quatre KPI, et l'ordre dans lequel ils se lisent. */
export const KPI_ORDER: DashboardFocus[] = [
  "active_minutes",
  "active_days",
  "consolidated",
  "open_gaps",
];

// ⚠️ « Lacunes ouvertes » et non « notions à renforcer » : ce KPI compte des lignes `Gap`
// (diagnostic, quiz raté), alors que le segment « à renforcer » des cartes voisines compte des
// notions au statut `weak`/`learning`. Ce sont DEUX mesures différentes — leur donner le même
// libellé affichait « 1 » à côté de « 9 » sur le même écran, constaté au premier rendu réel.
// « Lacune ouverte » est du vocabulaire figé côté Papa ; l'interdit porte sur l'interface de
// Massimo, pas sur l'instrument d'analyse de Papa.
export const KPI_LABELS: Record<DashboardFocus, string> = {
  active_minutes: "Temps actif",
  active_days: "Régularité",
  consolidated: "Notions consolidées",
  open_gaps: "Lacunes ouvertes",
};

/** Ce que chaque focus donne à voir — affiché sur la carte active, pour que le clic s'explique. */
export const KPI_FOCUS_HINTS: Record<DashboardFocus, string> = {
  active_minutes: "Filtre actif → quand & sur quoi",
  active_days: "Filtre actif → rythme",
  consolidated: "Filtre actif → mémoire",
  open_gaps: "Filtre actif → où agir",
};
