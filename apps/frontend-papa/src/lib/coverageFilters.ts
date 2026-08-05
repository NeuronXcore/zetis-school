// Filtrage CLIENT de la matrice de couverture — aucune re-requête, les données sont déjà là.
//
// Fonctions PURES, hors composants : c'est ce qui rend la table de vérité des pilules testable
// sans rendu. Aucun tri ici, et jamais : la page répond à « où j'en suis », elle ne produit pas
// un classement (« le plus incomplet d'abord » transformerait un outil de lecture en jeu de
// complétion, ce qui n'est pas un critère pédagogique).
import {
  type Coverage,
  type CoverageCellKey,
  type CoverageLesson,
  type CoverageSubject,
} from "@zetis/types";

// Les DEUX causes de blocage ont leur propre pilule (`no_lesson` / `no_course`) au lieu d'un
// « Bloquées » unique : le backend les distingue déjà parce que l'action à mener diffère (agir
// dans Programme vs rédiger le cours ici), et surtout deux KPI pointent maintenant l'un sur
// l'une, l'autre sur l'autre — « Leçons validées » ne peut pas ouvrir un ensemble qui contient
// des leçons validées (`no_course` en est plein).
export type CoverageFilter = "all" | "no_lesson" | "no_course" | "ready" | "pending" | "stale";

const COVERAGE_FILTERS: CoverageFilter[] = [
  "all",
  "no_lesson",
  "no_course",
  "ready",
  "pending",
  "stale",
];

/** Lit `?filter=` de l'URL. Source UNIQUE de la valeur courante depuis que la page est adressable
 *  (adr-0039 §9) : absent, vide ou inconnu → `"all"`.
 *
 *  Le repli n'est pas de la politesse : un lien partagé ou périmé qui blanchirait la matrice se
 *  lirait comme une panne, alors que la donnée est là. */
export function parseCoverageFilter(raw: string | null): CoverageFilter {
  return COVERAGE_FILTERS.includes(raw as CoverageFilter) ? (raw as CoverageFilter) : "all";
}

/** Les quatre colonnes leçon-centrées, dans l'ordre d'affichage. */
export const CELL_KEYS: CoverageCellKey[] = ["cours", "quiz", "fiche", "mindmap"];

/** Les trois dérivés — le cours en est EXCLU : il est la condition, pas un dérivé. */
const DERIVATIVE_KEYS: CoverageCellKey[] = ["quiz", "fiche", "mindmap"];

function hasDerivativeState(lesson: CoverageLesson, state: string): boolean {
  return DERIVATIVE_KEYS.some((key) => lesson.cells[key].state === state);
}

export function matchesFilter(lesson: CoverageLesson, filter: CoverageFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "no_lesson":
      return lesson.row_state === "blocked_lesson";
    case "no_course":
      return lesson.row_state === "blocked_no_course";
    case "ready":
      return lesson.row_state === "ready";
    case "pending":
      return hasDerivativeState(lesson, "pending");
    case "stale":
      return hasDerivativeState(lesson, "stale");
  }
}

/** Les trois colonnes qu'un lien « ↓ N à produire » peut viser. Le COURS n'en est pas : ce qui lui
 *  manque a déjà sa pilule (`no_course`), et il n'est pas un dérivé. */
export type MissingKey = "quiz" | "fiche" | "mindmap";

const MISSING_KEYS: MissingKey[] = ["quiz", "fiche", "mindmap"];

/** Lit `?manque=` sans faire confiance à ce qui arrive : `null` = pas de restriction de colonne.
 *
 *  Repli silencieux plutôt qu'erreur — un lien périmé doit rendre une matrice complète, jamais une
 *  page blanche qu'on croirait cassée. */
export function parseMissing(raw: string | null): MissingKey | null {
  return MISSING_KEYS.includes(raw as MissingKey) ? (raw as MissingKey) : null;
}

/** Cette leçon a-t-elle un trou dans LA colonne visée ?
 *
 *  `absent` est le prédicat exact de « à produire » : `cell_state` le sert quand la ligne n'existe
 *  pas (`coverage.py`). ⚠️ Ni `pending` (l'objet existe, il attend une relecture — c'est la file
 *  de relecture qui le traite), ni `blocked` (rien n'est générable tant que le cours manque).
 */
export function missesColumn(lesson: CoverageLesson, missing: MissingKey | null): boolean {
  return missing === null || lesson.cells[missing].state === "absent";
}

export function matchesSearch(lesson: CoverageLesson, search: string): boolean {
  const needle = search.trim().toLowerCase();
  return needle === "" || lesson.title.toLowerCase().includes(needle);
}

/** Applique pilule + recherche, en conservant l'arborescence.
 *
 * Une matière dont plus aucune leçon ne passe le filtre reste PRÉSENTE, avec zéro leçon : la
 * masquer se lirait « rien à produire ici », ce qui est faux. C'est à l'affichage de dire
 * « aucune leçon ne correspond », jamais au filtre de faire disparaître la matière. */
export function filterCoverage(
  subjects: CoverageSubject[],
  filter: CoverageFilter,
  search: string,
  missing: MissingKey | null = null,
): CoverageSubject[] {
  return subjects.map((subject) => ({
    ...subject,
    chapters: subject.chapters
      .map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.filter(
          (lesson) =>
            matchesFilter(lesson, filter) &&
            matchesSearch(lesson, search) &&
            missesColumn(lesson, missing),
        ),
      }))
      .filter((chapter) => chapter.lessons.length > 0),
  }));
}

/** Compteurs des pilules, calculés sur TOUTES les leçons (jamais sur le filtre courant). */
export function filterCounts(coverage: Coverage | null): Record<CoverageFilter, number> {
  const counts: Record<CoverageFilter, number> = {
    all: 0,
    no_lesson: 0,
    no_course: 0,
    ready: 0,
    pending: 0,
    stale: 0,
  };
  if (!coverage) return counts;
  for (const subject of coverage.subjects) {
    for (const chapter of subject.chapters) {
      for (const lesson of chapter.lessons) {
        for (const filter of Object.keys(counts) as CoverageFilter[]) {
          if (matchesFilter(lesson, filter)) counts[filter] += 1;
        }
      }
    }
  }
  return counts;
}

/** Les quatre anomalies rappelées dans l'en-tête d'une matière repliée. `ready` en est exclu :
 *  une leçon prête et incomplète n'est pas une anomalie, c'est du travail normal qui reste. */
export type AnomalyKey = Exclude<CoverageFilter, "all" | "ready">;

export const ANOMALY_KEYS: AnomalyKey[] = ["no_lesson", "no_course", "pending", "stale"];

/** Compteurs d'anomalies d'UNE matière.
 *
 * À appeler sur la matière ENTIÈRE, jamais sur la matrice déjà filtrée : sous filtre
 * « ⚠ Périmés », toutes les autres anomalies tomberaient à zéro et l'en-tête affirmerait
 * « aucune leçon bloquée ici », ce qui serait faux. Ce sont des COMPTES et rien d'autre — pas de
 * pourcentage, pas de barre : la page s'interdit un score par matière (un classement des matières
 * les plus incomplètes n'est pas un critère pédagogique). */
export function subjectAnomalies(subject: CoverageSubject): Record<AnomalyKey, number> {
  const counts: Record<AnomalyKey, number> = {
    no_lesson: 0,
    no_course: 0,
    pending: 0,
    stale: 0,
  };
  for (const chapter of subject.chapters) {
    for (const lesson of chapter.lessons) {
      for (const key of ANOMALY_KEYS) {
        if (matchesFilter(lesson, key)) counts[key] += 1;
      }
    }
  }
  return counts;
}

export function lessonCount(subject: CoverageSubject): number {
  return subject.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
}
