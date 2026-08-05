import { describe, expect, it } from "vitest";
import { type CoverageCell, type CoverageLesson, type CoverageSubject } from "@zetis/types";
import {
  filterCounts,
  filterCoverage,
  matchesFilter,
  matchesSearch,
  missesColumn,
  parseCoverageFilter,
  parseMissing,
  subjectAnomalies,
} from "./coverageFilters";

function cell(state: CoverageCell["state"]): CoverageCell {
  return { state, derived_at: null, validated_by: null, object_id: null };
}

function lesson(
  id: number,
  title: string,
  row_state: CoverageLesson["row_state"],
  states: Partial<Record<"cours" | "quiz" | "fiche" | "mindmap", CoverageCell["state"]>> = {},
): CoverageLesson {
  return {
    id,
    title,
    row_state,
    cells: {
      cours: cell(states.cours ?? "validated"),
      quiz: cell(states.quiz ?? "validated"),
      fiche: cell(states.fiche ?? "validated"),
      mindmap: cell(states.mindmap ?? "validated"),
    },
    notions: { cards: { covered: 0, total: 0 }, capsules: { covered: 0, total: 0 }, items: [] },
  };
}

// Jeu mixte : une de chaque situation, pour que la table de vérité ait du sens.
const COMPLETE = lesson(1, "Complète", "complete");
const READY = lesson(2, "Prête", "ready", { fiche: "absent" });
const PENDING = lesson(3, "À relire", "ready", { fiche: "pending" });
const STALE = lesson(4, "Périmée", "ready", { quiz: "stale" });
const BLOCKED_LESSON = lesson(5, "Brouillon", "blocked_lesson", { cours: "blocked" });
const BLOCKED_COURSE = lesson(6, "Sans cours", "blocked_no_course", { cours: "absent" });
const ALL = [COMPLETE, READY, PENDING, STALE, BLOCKED_LESSON, BLOCKED_COURSE];

describe("matchesFilter — table de vérité des pilules", () => {
  it("« Tout » ne filtre rien", () => {
    expect(ALL.every((l) => matchesFilter(l, "all"))).toBe(true);
  });

  it("les DEUX causes de blocage ont chacune leur pilule, et ne se recouvrent pas", () => {
    // Le verrou du câblage des KPI : « Leçons validées » ouvre `no_lesson`, et cet ensemble ne
    // doit JAMAIS contenir une leçon validée — or `blocked_no_course` n'est que des validées.
    expect(ALL.filter((l) => matchesFilter(l, "no_lesson"))).toEqual([BLOCKED_LESSON]);
    expect(ALL.filter((l) => matchesFilter(l, "no_course"))).toEqual([BLOCKED_COURSE]);
    expect(matchesFilter(BLOCKED_COURSE, "no_lesson")).toBe(false);
  });

  it("« Prêtes, incomplètes » ne retient que row_state=ready", () => {
    expect(ALL.filter((l) => matchesFilter(l, "ready"))).toEqual([READY, PENDING, STALE]);
    expect(matchesFilter(COMPLETE, "ready")).toBe(false);
  });

  it("« À relire » regarde les DÉRIVÉS, pas la ligne", () => {
    expect(ALL.filter((l) => matchesFilter(l, "pending"))).toEqual([PENDING]);
  });

  it("« Périmés » idem", () => {
    expect(ALL.filter((l) => matchesFilter(l, "stale"))).toEqual([STALE]);
  });

  it("le COURS n'entre dans aucun compte de dérivé — il est la condition, pas un dérivé", () => {
    const staleCourse = lesson(9, "Cours seul", "ready", { cours: "stale" });
    expect(matchesFilter(staleCourse, "stale")).toBe(false);
  });
});

describe("subjectAnomalies", () => {
  const subject: CoverageSubject = {
    id: 1,
    name: "Français",
    slug: "francais",
    chapters: [
      { id: 10, title: "Ch. 1", lessons: [COMPLETE, READY, PENDING] },
      { id: 11, title: "Ch. 2", lessons: [STALE, BLOCKED_LESSON, BLOCKED_COURSE] },
    ],
  };

  it("compte les quatre anomalies sur toute la matière, chapitres confondus", () => {
    expect(subjectAnomalies(subject)).toEqual({
      no_lesson: 1,
      no_course: 1,
      pending: 1,
      stale: 1,
    });
  });

  it("une matière saine ne porte AUCUN marqueur (et non des zéros)", () => {
    // L'en-tête n'affiche que les compteurs non nuls : c'est ce qui permet de repérer d'un coup
    // d'œil la matière qui demande du travail parmi huit.
    const healthy = { ...subject, chapters: [{ id: 10, title: "Ch. 1", lessons: [COMPLETE] }] };
    expect(Object.values(subjectAnomalies(healthy)).every((n) => n === 0)).toBe(true);
  });

  it("« prête, incomplète » n'est PAS une anomalie — c'est du travail normal qui reste", () => {
    const onlyReady = { ...subject, chapters: [{ id: 10, title: "Ch. 1", lessons: [READY] }] };
    expect(Object.values(subjectAnomalies(onlyReady)).every((n) => n === 0)).toBe(true);
  });
});

describe("matchesSearch", () => {
  it("vide → tout passe ; sinon insensible à la casse et aux espaces", () => {
    expect(matchesSearch(READY, "")).toBe(true);
    expect(matchesSearch(READY, "  ")).toBe(true);
    expect(matchesSearch(READY, "prÊt")).toBe(true);
    expect(matchesSearch(READY, "absente")).toBe(false);
  });
});

describe("filterCoverage", () => {
  const subjects: CoverageSubject[] = [
    {
      id: 1,
      name: "Français",
      slug: "francais",
      chapters: [
        { id: 10, title: "Ch. 1", lessons: [COMPLETE, PENDING] },
        { id: 11, title: "Ch. 2", lessons: [BLOCKED_LESSON] },
      ],
    },
  ];

  it("retire les chapitres vidés par le filtre mais GARDE la matière", () => {
    const filtered = filterCoverage(subjects, "pending", "");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toHaveLength(1);
    expect(filtered[0].chapters[0].lessons).toEqual([PENDING]);
  });

  it("une matière sans aucune leçon retenue reste PRÉSENTE, avec zéro chapitre", () => {
    // La masquer se lirait « rien à produire ici », ce qui serait faux.
    const filtered = filterCoverage(subjects, "stale", "");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].chapters).toEqual([]);
  });

  it("combine pilule et recherche", () => {
    expect(filterCoverage(subjects, "all", "complète")[0].chapters[0].lessons).toEqual([COMPLETE]);
  });
});

describe("filterCounts", () => {
  it("compte sur TOUTES les leçons, jamais sur le filtre courant", () => {
    const counts = filterCounts({
      school_year: { id: 1, label: "2026-2027", level: "4e" },
      totals: {
        lessons: 6,
        lessons_validated: 4,
        courses_written: 4,
        derivatives_percent: 50,
        pending_count: 1,
        stale_count: 1,
        orphan_count: 0,
      },
      subjects: [{ id: 1, name: "F", slug: "f", chapters: [{ id: 1, title: "C", lessons: ALL }] }],
    });
    expect(counts).toEqual({
      all: 6,
      no_lesson: 1,
      no_course: 1,
      ready: 3,
      pending: 1,
      stale: 1,
    });
  });

  it("sans couverture, tout est à zéro (pas de NaN affiché sur les pilules ni sur les KPI)", () => {
    expect(filterCounts(null)).toEqual({
      all: 0,
      no_lesson: 0,
      no_course: 0,
      ready: 0,
      pending: 0,
      stale: 0,
    });
  });
});

describe("parseCoverageFilter — un lien périmé ne blanchit pas la page", () => {
  it("reconnaît les six pilules", () => {
    for (const key of ["all", "no_lesson", "no_course", "ready", "pending", "stale"] as const) {
      expect(parseCoverageFilter(key)).toBe(key);
    }
  });

  it("retombe sur « all » sur absent, vide ou inconnu", () => {
    expect(parseCoverageFilter(null)).toBe("all");
    expect(parseCoverageFilter("")).toBe("all");
    expect(parseCoverageFilter("no_fiche")).toBe("all");
  });
});

describe("parseMissing / missesColumn — « à produire » n'est pas « à relire »", () => {
  it("ne reconnaît que les trois dérivés", () => {
    expect(parseMissing("fiche")).toBe("fiche");
    expect(parseMissing("quiz")).toBe("quiz");
    expect(parseMissing("mindmap")).toBe("mindmap");
    // Le cours n'est pas un dérivé : ce qui lui manque a déjà sa pilule (`no_course`).
    expect(parseMissing("cours")).toBeNull();
    expect(parseMissing(null)).toBeNull();
  });

  it("sans colonne visée, tout passe", () => {
    expect(missesColumn(PENDING, null)).toBe(true);
  });

  it("garde `absent`, écarte `pending`, `stale`, `validated` et `blocked`", () => {
    // ⚠️ La distinction qui porte tout le lien « ↓ N à produire » : une fiche `pending` EXISTE et
    // attend une relecture — la produire une seconde fois créerait un doublon. Seul `absent`
    // signifie « à produire ».
    expect(missesColumn(READY, "fiche")).toBe(true); // absent
    expect(missesColumn(PENDING, "fiche")).toBe(false); // pending
    expect(missesColumn(STALE, "quiz")).toBe(false); // stale
    expect(missesColumn(COMPLETE, "fiche")).toBe(false); // validated
    expect(missesColumn(BLOCKED_LESSON, "fiche")).toBe(false); // blocked
  });
});
