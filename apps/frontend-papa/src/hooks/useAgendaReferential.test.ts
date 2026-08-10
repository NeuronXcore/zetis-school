// Le référentiel de l'agenda — addendum ADR-0025 §13.
//
// Ce fichier ne teste qu'une chose, et c'est la seule règle du chantier qui ne soit PAS visible à
// l'écran : les intitulés proposés sont ceux des cours **validés**, et rien d'autre.
//
// Le motif n'est pas la cohérence d'affichage avec la page Matières, c'est la frontière
// ADR-0009 §9 : `label` est la seule chaîne de l'agenda que Massimo lit. Un titre rédigé par le
// modèle et non relu l'atteindrait par cette porte, sans jamais passer par la validation Papa que
// tout le reste du référentiel exige.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type CurriculumLesson } from "@zetis/types";
import { fetchActiveSchoolYear, fetchChapters, fetchLessons } from "../lib/curriculum";
import { useAgendaReferential } from "./useAgenda";

vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
  fetchChapters: vi.fn(),
  fetchLessons: vi.fn(),
}));

const lesson = (id: number, title: string, status: string): CurriculumLesson =>
  ({ id, chapter_id: 3, title, status, sort_order: id }) as CurriculumLesson;

beforeEach(() => {
  vi.mocked(fetchActiveSchoolYear).mockResolvedValue({
    id: 1,
    label: "2026",
    subjects: [],
  } as never);
  vi.mocked(fetchChapters).mockResolvedValue([]);
});

describe("useAgendaReferential — les intitulés proposés", () => {
  it("VERROU §13.2 — ne retient que les cours VALIDÉS", async () => {
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson(1, "Additionner des fractions", "validated"),
      lesson(2, "Brouillon écrit par le modèle", "draft"),
      lesson(3, "Comparer deux fractions", "validated"),
      lesson(4, "Chapitre retiré du programme", "archived"),
    ]);

    const { result } = renderHook(() => useAgendaReferential());
    act(() => result.current.loadLessons(3));

    await waitFor(() =>
      expect(result.current.lessonsByChapter[3]).toEqual([
        { id: 1, title: "Additionner des fractions" },
        { id: 3, title: "Comparer deux fractions" },
      ]),
    );
    // Dit à l'endroit du sabotage : ce n'est pas « deux cours sur quatre », c'est « celui-ci,
    // jamais ». Un test qui ne compterait que la longueur passerait sur le mauvais filtre.
    expect(result.current.lessonsByChapter[3].map((l) => l.title)).not.toContain(
      "Brouillon écrit par le modèle",
    );
  });

  it("un référentiel injoignable rend une liste vide, il ne casse rien", async () => {
    // L'intitulé retombe alors en texte libre : une saisie n'est jamais bloquée par une donnée
    // facultative (même doctrine que `loadChapters`).
    vi.mocked(fetchLessons).mockRejectedValue(new Error("503"));

    const { result } = renderHook(() => useAgendaReferential());
    act(() => result.current.loadLessons(9));

    await waitFor(() => expect(result.current.lessonsByChapter[9]).toEqual([]));
    expect(result.current.lessonsLoading.has(9)).toBe(false);
  });

  it("suit PLUSIEURS chapitres en cours de chargement à la fois", async () => {
    // La grille de saisie a plusieurs lignes sur des chapitres différents. `useSubjects` suit un
    // id unique (`chapterLessonsLoadingId`) : suffisant pour un accordéon, faux ici — la ligne 2
    // afficherait « chargement… » parce que la ligne 1 charge.
    let resolveFirst: (v: CurriculumLesson[]) => void = () => {};
    vi.mocked(fetchLessons)
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([lesson(5, "Théorème de Thalès", "validated")]);

    const { result } = renderHook(() => useAgendaReferential());
    act(() => result.current.loadLessons(3));
    act(() => result.current.loadLessons(4));

    await waitFor(() =>
      expect(result.current.lessonsByChapter[4]).toEqual([{ id: 5, title: "Théorème de Thalès" }]),
    );
    // Le chapitre 4 est arrivé ; le 3 charge toujours, et les deux états coexistent.
    expect(result.current.lessonsLoading.has(3)).toBe(true);
    expect(result.current.lessonsLoading.has(4)).toBe(false);

    await act(async () => {
      resolveFirst([lesson(6, "Fractions décimales", "validated")]);
    });
    await waitFor(() => expect(result.current.lessonsLoading.has(3)).toBe(false));
  });
});
