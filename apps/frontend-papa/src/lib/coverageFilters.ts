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

export type CoverageFilter = "all" | "blocked" | "ready" | "pending" | "stale";

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
    case "blocked":
      return lesson.row_state === "blocked_lesson" || lesson.row_state === "blocked_no_course";
    case "ready":
      return lesson.row_state === "ready";
    case "pending":
      return hasDerivativeState(lesson, "pending");
    case "stale":
      return hasDerivativeState(lesson, "stale");
  }
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
): CoverageSubject[] {
  return subjects.map((subject) => ({
    ...subject,
    chapters: subject.chapters
      .map((chapter) => ({
        ...chapter,
        lessons: chapter.lessons.filter(
          (lesson) => matchesFilter(lesson, filter) && matchesSearch(lesson, search),
        ),
      }))
      .filter((chapter) => chapter.lessons.length > 0),
  }));
}

/** Compteurs des pilules, calculés sur TOUTES les leçons (jamais sur le filtre courant). */
export function filterCounts(coverage: Coverage | null): Record<CoverageFilter, number> {
  const counts: Record<CoverageFilter, number> = {
    all: 0,
    blocked: 0,
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

export function lessonCount(subject: CoverageSubject): number {
  return subject.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0);
}
