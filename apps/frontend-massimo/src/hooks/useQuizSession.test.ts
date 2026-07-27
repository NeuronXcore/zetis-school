import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type StudentQuiz } from "@zetis/types";
import { useQuizSession } from "./useQuizSession";

vi.mock("../lib/quiz", () => ({
  startQuizAttempt: vi.fn(),
  submitQuizAnswer: vi.fn(),
  completeQuizAttempt: vi.fn(),
}));

import { completeQuizAttempt, startQuizAttempt, submitQuizAnswer } from "../lib/quiz";

const QUIZ: StudentQuiz = {
  quiz_id: 7,
  title: "Quiz — Les relatifs",
  lesson_id: 3,
  questions: [
    { id: 101, question_type: "mcq", prompt_markdown: "Q1 ?", choices_json: ["a", "b"], skill_id: 1, skill_name: "N1" },
    { id: 102, question_type: "true_false", prompt_markdown: "Q2 ?", choices_json: null, skill_id: 1, skill_name: "N1" },
  ],
};

beforeEach(() => {
  vi.mocked(startQuizAttempt).mockReset().mockResolvedValue({ attempt_id: 55, quiz_id: 7, questions_count: 2 });
  vi.mocked(submitQuizAnswer).mockReset().mockResolvedValue({ is_correct: true, explanation_markdown: "Bravo." });
  vi.mocked(completeQuizAttempt).mockReset().mockResolvedValue({
    attempt_id: 55,
    quiz_id: 7,
    score_percent: 100,
    xp_awarded: 30,
    per_skill: [{ skill_id: 1, skill_name: "N1", score: 100, status: "mastered" }],
    strengths: ["N1"],
    to_review: [],
  });
});

describe("useQuizSession", () => {
  it("démarre une tentative et sert la première question", async () => {
    const { result } = renderHook(() => useQuizSession(QUIZ));
    await waitFor(() => expect(result.current.status).toBe("answering"));
    expect(startQuizAttempt).toHaveBeenCalledWith(7);
    expect(result.current.question?.id).toBe(101);
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
    expect(result.current.isLast).toBe(false);
  });

  it("corrige côté serveur, montre le feedback, puis avance", async () => {
    const { result } = renderHook(() => useQuizSession(QUIZ));
    await waitFor(() => expect(result.current.status).toBe("answering"));

    act(() => result.current.submit({ choice_index: 0 }));
    await waitFor(() => expect(result.current.status).toBe("feedback"));
    expect(submitQuizAnswer).toHaveBeenCalledWith(55, 101, { choice_index: 0 });
    expect(result.current.feedback?.is_correct).toBe(true);

    act(() => result.current.next());
    await waitFor(() => expect(result.current.question?.id).toBe(102));
    expect(result.current.isLast).toBe(true);
  });

  it("à la dernière question, termine et sert le résumé serveur (XP incluse)", async () => {
    const { result } = renderHook(() => useQuizSession(QUIZ));
    await waitFor(() => expect(result.current.status).toBe("answering"));
    // Q1
    act(() => result.current.submit({ choice_index: 0 }));
    await waitFor(() => expect(result.current.status).toBe("feedback"));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.question?.id).toBe(102));
    // Q2 (dernière)
    act(() => result.current.submit({ value: true }));
    await waitFor(() => expect(result.current.status).toBe("feedback"));
    act(() => result.current.next());
    await waitFor(() => expect(result.current.status).toBe("summary"));

    expect(completeQuizAttempt).toHaveBeenCalledWith(55);
    expect(result.current.summary?.xp_awarded).toBe(30);
    expect(result.current.summary?.strengths).toEqual(["N1"]);

    act(() => result.current.finish());
    expect(result.current.status).toBe("done");
  });
});
