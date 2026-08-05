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

/** Étiquettes des sept colonnes, lundi d'abord. Source unique : la grille des créneaux et la
 *  semaine en cours doivent nommer les jours pareil, sinon passer de l'une à l'autre se relit. */
export const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Un jour de la semaine EN COURS — la vraie, datée, celle qui contient aujourd'hui. */
export interface WeekDay {
  /** ISO `AAAA-MM-JJ`. */
  date: string;
  label: string;
  dayOfMonth: number;
  isToday: boolean;
  /** Jour pas encore arrivé : il n'a pas zéro minute, il n'a pas encore eu lieu. La nuance est
   *  toute la différence entre « il n'a rien fait » et « on ne sait pas encore ». */
  isFuture: boolean;
  total: number;
  parts: SlotCell["parts"];
}

/** Les sept jours de la semaine calendaire contenant `generatedAt`, ventilés par matière.
 *
 *  Complète la semaine type sans la remplacer : l'une dit l'habitude (une fenêtre glissante
 *  repliée sur sept colonnes), l'autre dit ce qui s'est passé cette semaine-ci. Les confondre est
 *  exactement le malentendu qui a motivé cette vue.
 *
 *  Construit depuis `calendar`, qui porte les minutes par DATE — `slots` ne le permettrait pas,
 *  il est déjà replié par jour de semaine et a perdu les dates. C'est aussi pourquoi cette vue
 *  n'a pas de découpage horaire. */
export function buildCurrentWeek(subjects: DashboardSubject[], generatedAt: string): WeekDay[] {
  const [y, m, d] = generatedAt.slice(0, 10).split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  // `getUTCDay()` rend 0 pour dimanche ; on veut lundi en tête, comme partout dans le dépôt.
  const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;

  const parMatiere = new Map<string, SlotCell["parts"]>();
  for (const subject of subjects) {
    for (const day of subject.calendar) {
      if (day.active_minutes <= 0) continue;
      const parts = parMatiere.get(day.date) ?? [];
      parts.push({
        slug: subject.slug,
        name: subject.name,
        color: subject.color,
        minutes: day.active_minutes,
      });
      parMatiere.set(day.date, parts);
    }
  }

  return Array.from({ length: 7 }, (_, i) => {
    const at = new Date(today + (i - sinceMonday) * 86_400_000);
    const date = at.toISOString().slice(0, 10);
    const parts = (parMatiere.get(date) ?? []).sort((a, b) => b.minutes - a.minutes);
    return {
      date,
      label: WEEKDAY_LABELS[i],
      dayOfMonth: at.getUTCDate(),
      isToday: at.getTime() === today,
      isFuture: at.getTime() > today,
      total: parts.reduce((sum, p) => sum + p.minutes, 0),
      parts,
    };
  });
}

/** Une case de la semaine type : son total, et ce que chaque matière y a mis. */
export interface SlotCell {
  total: number;
  /** Matières ayant du temps dans cette case, la plus grosse d'abord. Les zéros sont écartés :
   *  ils produiraient des segments de largeur nulle, invisibles mais bien présents dans le DOM. */
  parts: { slug: string; name: string; color: string | null; minutes: number }[];
}

/** Matrice 8 × 7 des créneaux, VENTILÉE par matière.
 *
 *  Remplace une simple somme : la case doit pouvoir se peindre en plusieurs couleurs, donc le
 *  détail par matière doit survivre jusqu'au rendu. Le total reste porté par la case — c'est lui
 *  qui donne la longueur de la barre — mais il n'est plus la seule chose qu'on en sait. */
export function buildSlotCells(
  subjects: DashboardSubject[],
  period: DashboardPeriod,
): SlotCell[][] {
  const cells: SlotCell[][] = Array.from({ length: 8 }, () =>
    Array.from({ length: 7 }, () => ({ total: 0, parts: [] as SlotCell["parts"] })),
  );

  for (const subject of subjects) {
    const slots = subject.slots[period] ?? [];
    slots.forEach((row, slot) =>
      row.forEach((minutes, day) => {
        if (minutes <= 0) return;
        const cell = cells[slot][day];
        cell.total += minutes;
        cell.parts.push({
          slug: subject.slug,
          name: subject.name,
          color: subject.color,
          minutes,
        });
      }),
    );
  }

  // Tri décroissant : sans lui, l'ordre des segments suivrait l'ordre d'arrivée des matières,
  // qui n'est stable ni d'une case à l'autre ni d'un chargement à l'autre. La grille se lirait
  // comme un damier aléatoire au lieu d'une semaine type.
  for (const row of cells) for (const cell of row) cell.parts.sort((a, b) => b.minutes - a.minutes);

  return cells;
}

/** Fenêtre glissante des créneaux, en clair : « du 30 juil. au 5 août ».
 *
 *  Mêmes bornes que le serveur (`period_window` : `period` jours, bornes INCLUSES, se terminant au
 *  jour de `generated_at`). Dater la fenêtre n'est pas cosmétique : sans elle, des en-têtes
 *  `Lun…Dim` se lisent comme la semaine EN COURS, et une case remplie un jeudi passe pour une
 *  prédiction. Constaté à l'écran le 2026-08-05, un mercredi.
 *
 *  Calcul sur la partie DATE de l'horodatage, en UTC : `new Date(iso).getDate()` répondrait dans le
 *  fuseau du navigateur et pourrait décaler la fenêtre d'un jour — y compris en test, où le fuseau
 *  du runner déciderait du résultat. */
export function formatSlotWindow(generatedAt: string, period: DashboardPeriod): string {
  const [y, m, d] = generatedAt.slice(0, 10).split("-").map(Number);
  const last = new Date(Date.UTC(y, m - 1, d));
  const first = new Date(Date.UTC(y, m - 1, d - (Number(period) - 1)));

  // L'année n'apparaît que si la fenêtre en enjambe deux — sur « Année », taire l'année ferait
  // lire « du 6 août au 5 août ».
  const memeAnnee = first.getUTCFullYear() === last.getUTCFullYear();
  const jour = (date: Date) =>
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
      ...(memeAnnee ? {} : { year: "numeric" }),
    }).format(date);

  return `du ${jour(first)} au ${jour(last)}`;
}

/** Plus grosse case de la grille — l'échelle des barres. 0 si la semaine est vide. */
export function maxSlotCell(cells: SlotCell[][]): number {
  return cells.reduce((max, row) => row.reduce((m, cell) => Math.max(m, cell.total), max), 0);
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

/** Libellé de la fenêtre transmise au Conseil de classe par le lien profond du dashboard.
 *
 *  ⚠️ `Record<DashboardPeriod, string>` et NON `Record<string, string>` — et c'est TOUT l'objet de
 *  cette table. La page Conseil portait sa propre copie typée en `Record<string, string>`, qui
 *  accepte n'importe quelle clé : élargir `DashboardPeriod` pour la fenêtre « Année » n'a donc rien
 *  pu y casser, et `365` est tombé dans le repli « Trimestre 1 ». Le Conseil racontait un trimestre
 *  pendant que Papa regardait l'année — exactement ce que le transport de la période était censé
 *  empêcher (ADR-0028 §7), sans qu'aucun type ni aucun test ne bronche.
 *
 *  Le filet n'est pas dans l'union : il est dans le `Record` typé PAR l'union.
 *
 *  Jumelle de `PERIOD_LABELS` (`pages/DashboardPage.tsx`), qui nomme la même union pour les boutons.
 *  Les deux tombent ensemble à la compilation si une fenêtre s'ajoute. */
export const COUNCIL_PERIOD_LABEL: Record<DashboardPeriod, string> = {
  "7": "7 derniers jours",
  "30": "30 derniers jours",
  "90": "Trimestre",
  "365": "Année scolaire",
};

/** Un `?period=` d'URL désigne-t-il une fenêtre connue ?
 *
 *  Source unique : `useDashboard` en avait une copie privée et la page Conseil n'en avait aucune —
 *  d'où le repli silencieux ci-dessus. */
export function isDashboardPeriod(value: string | null): value is DashboardPeriod {
  return value !== null && value in COUNCIL_PERIOD_LABEL;
}
