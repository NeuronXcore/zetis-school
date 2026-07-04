import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import {
  type PapaQuizDetail,
  type QuizPilotageOverview,
  type QuizPilotageTree,
} from "@zetis/types";
import { useQuizPilotage } from "./useQuizPilotage";

vi.mock("../lib/quizPilotage", async (importOriginal) => ({
  // On garde formatLabel/QUIZ_FORMAT_LABELS réels ; on ne mocke que les appels réseau.
  ...(await importOriginal<typeof import("../lib/quizPilotage")>()),
  fetchOverview: vi.fn(),
  fetchSubjectTree: vi.fn(),
  fetchQuizDetail: vi.fn(),
  generateQuiz: vi.fn(),
  regenerateQuiz: vi.fn(),
  patchQuestion: vi.fn(),
  addManualQuestion: vi.fn(),
  retireQuestion: vi.fn(),
  deleteQuiz: vi.fn(),
}));

import {
  fetchOverview,
  fetchQuizDetail,
  fetchSubjectTree,
  formatLabel,
  generateQuiz,
} from "../lib/quizPilotage";

const OVERVIEW: QuizPilotageOverview = {
  kpis: { active_quizzes: 1, served_questions: 6, retired_questions: 0, avg_discard_rate: 0.1 },
  subjects: [
    {
      subject_id: 1,
      name: "Mathématiques",
      slug: "mathematiques",
      validated_lessons: 2,
      lessons_without_quiz: 1,
      quiz_count: 1,
      discarded: 1,
      generated_total: 7,
      discard_rate: 0.143,
    },
  ],
};
const TREE: QuizPilotageTree = {
  subject_id: 1,
  name: "Mathématiques",
  slug: "mathematiques",
  lessons: [
    { lesson_id: 10, title: "Sans quiz", chapter_name: "Ch", quizzes: [] },
    {
      lesson_id: 11,
      title: "Avec quiz",
      chapter_name: "Ch",
      quizzes: [
        {
          quiz_id: 99,
          title: "Quiz — Avec quiz",
          quiz_type: "mission",
          status: "ready",
          questions_count: 6,
          retired_count: 0,
          manual_count: 0,
          formats: ["mcq", "cloze"],
          discard_rate: 0.143,
          created_at: null,
        },
      ],
    },
  ],
};
const DETAIL: PapaQuizDetail = {
  quiz_id: 99,
  title: "Quiz — Avec quiz",
  lesson_id: 11,
  subject_id: 1,
  status: "ready",
  questions: [],
};

beforeEach(() => {
  vi.mocked(fetchOverview).mockReset().mockResolvedValue(OVERVIEW);
  vi.mocked(fetchSubjectTree).mockReset().mockResolvedValue(TREE);
  vi.mocked(fetchQuizDetail).mockReset().mockResolvedValue(DETAIL);
  vi.mocked(generateQuiz).mockReset().mockResolvedValue({
    quiz_id: 99,
    lesson_id: 10,
    questions_generated: 6,
    questions_discarded: 1,
  });
});

describe("formatLabel", () => {
  it("mappe les formats connus et laisse passer l'inconnu", () => {
    expect(formatLabel("mcq_multi")).toBe("QCM multi");
    expect(formatLabel("matching")).toBe("Association");
    expect(formatLabel("wat")).toBe("wat");
  });
});

describe("useQuizPilotage", () => {
  it("charge l'overview au montage", async () => {
    const { result } = renderHook(() => useQuizPilotage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.overview?.kpis.served_questions).toBe(6);
  });

  it("charge l'arbre matière au dépliage (paresseux)", async () => {
    const { result } = renderHook(() => useQuizPilotage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.toggleSubject(1));
    await waitFor(() => expect(result.current.trees[1]).toBeDefined());
    expect(fetchSubjectTree).toHaveBeenCalledWith(1);
    expect(result.current.trees[1].lessons).toHaveLength(2);
  });

  it("génère un quiz pour une leçon puis rafraîchit la matière", async () => {
    const { result } = renderHook(() => useQuizPilotage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.generate(1, 10, { count: 8, difficulty: 2 });
    });
    expect(generateQuiz).toHaveBeenCalledWith(10, { count: 8, difficulty: 2 });
    expect(fetchSubjectTree).toHaveBeenCalledWith(1); // refresh de la matière
    expect(result.current.generating.has(10)).toBe(false);
  });

  it("ouvre l'inspection en chargeant le détail (avec clés)", async () => {
    const { result } = renderHook(() => useQuizPilotage());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.openInspect(99);
    });
    expect(fetchQuizDetail).toHaveBeenCalledWith(99);
    expect(result.current.inspected?.quiz_id).toBe(99);
  });
});
