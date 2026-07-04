import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type SrsCardsOverview, type SrsSubjectTree } from "@zetis/types";
import { subjectGenerateLabel, useSrsCards } from "./useSrsCards";

vi.mock("../lib/srsCards", () => ({
  fetchCardsOverview: vi.fn(),
  fetchSubjectTree: vi.fn(),
  generateSubjectCards: vi.fn(),
  generateSkillCards: vi.fn(),
  fetchSkillCards: vi.fn(),
  reactivateSkill: vi.fn(),
  deleteSkillCards: vi.fn(),
}));

import {
  fetchCardsOverview,
  fetchSkillCards,
  fetchSubjectTree,
  generateSubjectCards,
} from "../lib/srsCards";

const OVERVIEW: SrsCardsOverview = {
  subjects: [{ subject_id: 1, name: "Français", active_cards: 2, to_generate: 1, suspended: 0 }],
  totals: { covered: 1, active: 2, to_generate: 1, suspended: 0 },
};
const TREE: SrsSubjectTree = {
  subject_id: 1,
  name: "Français",
  chapters: [
    {
      chapter_id: 1,
      name: "Ch",
      lessons: [
        { lesson_id: 1, title: "L", notions: [{ skill_id: 10, name: "N1", state: "to_generate", card_count: 0 }] },
      ],
    },
  ],
  suspended: [],
};

beforeEach(() => {
  vi.mocked(fetchCardsOverview).mockReset().mockResolvedValue(OVERVIEW);
  vi.mocked(fetchSubjectTree).mockReset().mockResolvedValue(TREE);
  vi.mocked(generateSubjectCards).mockReset().mockResolvedValue({
    subject_id: 1,
    created: 1,
    updated: 0,
    reactivated: 0,
    pending: 0,
    suspended: 0,
    failed_skills: [],
  });
  vi.mocked(fetchSkillCards)
    .mockReset()
    .mockResolvedValue([
      { id: 5, card_type: "definition", front_markdown: "Q", back_markdown: "R", status: "scheduled" },
    ]);
});

describe("subjectGenerateLabel (pure)", () => {
  it("pilote l'affichage du bouton : rien à générer → pas de bouton", () => {
    expect(subjectGenerateLabel(0)).toBeNull();
    expect(subjectGenerateLabel(-3)).toBeNull();
  });
  it("libellé pluralisé", () => {
    expect(subjectGenerateLabel(1)).toBe("Générer la notion");
    expect(subjectGenerateLabel(3)).toBe("Générer les 3");
  });
});

describe("useSrsCards", () => {
  it("charge l'overview au montage", async () => {
    const { result } = renderHook(() => useSrsCards());
    await waitFor(() => expect(result.current.overview).toEqual(OVERVIEW));
    expect(fetchCardsOverview).toHaveBeenCalledTimes(1);
    expect(fetchSubjectTree).not.toHaveBeenCalled(); // arbre chargé seulement au dépliage
  });

  it("déplie une matière → charge l'arbre À LA DEMANDE (une fois, caché)", async () => {
    const { result } = renderHook(() => useSrsCards());
    await waitFor(() => expect(result.current.overview).not.toBeNull());

    act(() => result.current.toggleSubject(1));
    await waitFor(() => expect(result.current.trees[1]).toEqual(TREE));
    expect(fetchSubjectTree).toHaveBeenCalledTimes(1);

    act(() => result.current.toggleSubject(1)); // replie
    act(() => result.current.toggleSubject(1)); // redéplie → cache, pas de re-fetch
    expect(fetchSubjectTree).toHaveBeenCalledTimes(1);
  });

  it("générer une matière → invalide le cache (re-fetch arbre + overview)", async () => {
    const { result } = renderHook(() => useSrsCards());
    await waitFor(() => expect(result.current.overview).not.toBeNull());
    act(() => result.current.toggleSubject(1));
    await waitFor(() => expect(result.current.trees[1]).toBeDefined());

    await act(async () => {
      await result.current.generateSubject(1);
    });
    expect(generateSubjectCards).toHaveBeenCalledWith(1);
    expect(fetchSubjectTree).toHaveBeenCalledTimes(2); // dépliage + refresh
    expect(fetchCardsOverview).toHaveBeenCalledTimes(2); // montage + refresh
  });

  it("aperçu chargé à la demande (togglePreview)", async () => {
    const { result } = renderHook(() => useSrsCards());
    await waitFor(() => expect(result.current.overview).not.toBeNull());
    expect(fetchSkillCards).not.toHaveBeenCalled();

    act(() => result.current.togglePreview(10));
    await waitFor(() => expect(result.current.previews[10]).toHaveLength(1));
    expect(fetchSkillCards).toHaveBeenCalledWith(10);
  });
});
