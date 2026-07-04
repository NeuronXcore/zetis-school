import { type ReactNode, createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  type Eli5Explain,
  type Eli5Reverse,
} from "../lib/eli5";
import {
  buildChips,
  eli5SourceBadge,
  resolveSkillId,
  stripMarkdown,
  useEli5,
} from "./useEli5";

vi.mock("../lib/eli5", () => ({
  fetchSkills: vi.fn(),
  fetchDueReviews: vi.fn(),
  fetchLessonSuggestions: vi.fn(),
  explainEli5: vi.fn(),
  reverseEli5: vi.fn(),
  transcribeEli5: vi.fn(),
  requestNotion: vi.fn(),
  Eli5SttUnavailable: class extends Error {},
}));

import {
  explainEli5,
  fetchDueReviews,
  fetchLessonSuggestions,
  fetchSkills,
  requestNotion,
  reverseEli5,
} from "../lib/eli5";

const SKILLS = [
  { id: 1, name: "Les fractions", subject: "Maths" },
  { id: 2, name: "La photosynthèse", subject: "SVT" },
  { id: 3, name: "Les nombres relatifs", subject: "Maths" },
];

const EXPLAIN: Eli5Explain = {
  title: "Les fractions",
  simple_explanation: "Une fraction est une part d'un tout.",
  analogy: "Comme une pizza coupée en parts.",
  example: "1/2 = la moitié.",
  common_mistake: "",
  check_question: "Combien font deux quarts ?",
  next_action: "Réviser demain",
  sources_used: 0,
};

const REVERSE: Eli5Reverse = {
  score: 72,
  feedback: "Bien joué, ton explication est claire.",
  missing_points: ["le dénominateur"],
  next_action: "Refais un exercice sur les parts.",
};

function wrapper(initialEntries: string[] = ["/eli5"]) {
  return ({ children }: { children: ReactNode }) =>
    createElement(MemoryRouter, { initialEntries }, children);
}

beforeEach(() => {
  vi.mocked(fetchSkills).mockReset().mockResolvedValue(SKILLS);
  vi.mocked(fetchDueReviews)
    .mockReset()
    .mockResolvedValue([
      { id: 10, skill_id: 3, front_markdown: "**Les nombres relatifs**", interval_days: 2 },
    ]);
  vi.mocked(explainEli5).mockReset().mockResolvedValue(EXPLAIN);
  vi.mocked(reverseEli5).mockReset().mockResolvedValue(REVERSE);
  vi.mocked(fetchLessonSuggestions).mockReset().mockResolvedValue([]);
});

// ── Helpers purs ────────────────────────────────────────────────────────────

describe("resolveSkillId", () => {
  it("matche par égalité insensible à la casse", () => {
    expect(resolveSkillId("les FRACTIONS", SKILLS)).toBe(1);
  });
  it("matche par inclusion tolérante", () => {
    expect(resolveSkillId("photosynthèse", SKILLS)).toBe(2);
  });
  it("renvoie null sans match (aucune requête backend possible)", () => {
    expect(resolveSkillId("le théorème de Pythagore", SKILLS)).toBeNull();
    expect(resolveSkillId("   ", SKILLS)).toBeNull();
  });
});

describe("stripMarkdown", () => {
  it("retire le markdown et tronque", () => {
    expect(stripMarkdown("**Les nombres relatifs**")).toBe("Les nombres relatifs");
    expect(stripMarkdown("a".repeat(60)).length).toBeLessThanOrEqual(40);
    expect(stripMarkdown("$x^2$ égalité")).toBe("égalité");
  });
});

describe("eli5SourceBadge", () => {
  it("lesson_title présent → variante leçon", () => {
    expect(eli5SourceBadge({ ...EXPLAIN, lesson_title: "Chapitre 3" })).toEqual({
      variant: "lesson",
      lessonTitle: "Chapitre 3",
    });
  });
  it("sources_used>0 seul → variante cours", () => {
    expect(eli5SourceBadge({ ...EXPLAIN, sources_used: 4 })).toEqual({ variant: "course" });
  });
  it("aucune source → aucune variante", () => {
    expect(eli5SourceBadge({ ...EXPLAIN, sources_used: 0 })).toEqual({ variant: "none" });
    expect(eli5SourceBadge(null)).toEqual({ variant: "none" });
  });
});

describe("buildChips", () => {
  it("place « Ta leçon » en tête, puis les « à réviser » réelles", () => {
    const chips = buildChips(SKILLS, [
      { id: 10, skill_id: 2, front_markdown: "x", interval_days: 1 },
    ]);
    expect(chips[0]).toMatchObject({ kind: "lesson", note: "Ta leçon", skillId: 1 });
    expect(chips[1]).toMatchObject({ kind: "review", note: "à réviser", skillId: 2 });
  });

  it("résout le libellé « à réviser » via skills (skill_id réel)", () => {
    const chips = buildChips(SKILLS, [
      { id: 10, skill_id: 2, front_markdown: "peu importe", interval_days: 1 },
    ]);
    expect(chips[1]).toMatchObject({ name: "La photosynthèse", skillId: 2 });
  });

  it("repli sur front_markdown strippé si skill_id absent de fetchSkills — skill_id conservé", () => {
    const chips = buildChips(SKILLS, [
      { id: 11, skill_id: 999, front_markdown: "**Notion orpheline**", interval_days: 5 },
    ]);
    const orphan = chips.find((c) => c.kind === "review");
    expect(orphan).toBeDefined();
    expect(orphan!.name).toBe("Notion orpheline"); // libellé dégradé (cosmétique)
    expect(orphan!.skillId).toBe(999); // skill_id TOUJOURS réel
  });

  it("les chips « Ta leçon » viennent des suggestions réelles (skill_id de la suggestion)", () => {
    const chips = buildChips(
      SKILLS,
      [{ id: 10, skill_id: 3, front_markdown: "x", interval_days: 1 }],
      [{ skill_id: 2, name: "La photosynthèse", lesson_id: 5, lesson_title: "Chapitre SVT" }],
    );
    expect(chips[0]).toMatchObject({
      kind: "lesson",
      note: "Ta leçon",
      skillId: 2,
      name: "La photosynthèse",
    });
    // La suggestion prime sur le mock skills[0].
    expect(chips.some((c) => c.kind === "lesson" && c.skillId === 1)).toBe(false);
  });

  it("repli sur le mock skills[0] si aucune suggestion", () => {
    const chips = buildChips(SKILLS, [], []);
    expect(chips[0]).toMatchObject({ kind: "lesson", skillId: 1 });
  });

  it("ne dédouble pas « Ta leçon » et cape à 4", () => {
    const chips = buildChips(
      SKILLS,
      [1, 2, 3, 3, 3].map((sid, i) => ({
        id: i,
        skill_id: sid,
        front_markdown: "x",
        interval_days: 1,
      })),
    );
    expect(chips.length).toBeLessThanOrEqual(4);
    expect(chips.filter((c) => c.skillId === 1).length).toBe(1); // pas de doublon avec la leçon
  });
});

// ── Machine à états ─────────────────────────────────────────────────────────

describe("useEli5 — machine à états", () => {
  it("chip → generating → explained, puis reverse → evaluating → feedback (accumulation)", async () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));

    act(() => result.current.submitChip(result.current.chips[0]));
    expect(result.current.status).toBe("generating");

    await waitFor(() => expect(result.current.status).toBe("explained"));
    expect(result.current.explanation).toMatchObject({ title: "Les fractions" });
    expect(vi.mocked(explainEli5)).toHaveBeenCalledWith(1);

    act(() => result.current.setAnswer("Une fraction c'est une part."));
    act(() => result.current.submitAnswer());
    expect(result.current.status).toBe("evaluating");

    await waitFor(() => expect(result.current.status).toBe("feedback"));
    expect(result.current.reverse).toMatchObject({ score: 72 });
    // Accumulation : l'explication reste montée pendant le feedback.
    expect(result.current.explanation).not.toBeNull();
  });

  it("champ matchant → explain avec le bon skill_id", async () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));

    act(() => result.current.setQuestion("les nombres relatifs"));
    act(() => result.current.submitQuestion());

    await waitFor(() => expect(result.current.status).toBe("explained"));
    expect(vi.mocked(explainEli5)).toHaveBeenCalledWith(3);
    expect(result.current.noMatch).toBe(false);
  });

  it("champ sans match → aucun appel backend + état vide bienveillant", async () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));

    act(() => result.current.setQuestion("le théorème de Pythagore"));
    act(() => result.current.submitQuestion());

    expect(result.current.noMatch).toBe(true);
    expect(result.current.status).toBe("idle");
    expect(vi.mocked(explainEli5)).not.toHaveBeenCalled();
  });

  it("nouvelle question = reset propre (démontage des sections précédentes)", async () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));

    act(() => result.current.submitChip(result.current.chips[0]));
    await waitFor(() => expect(result.current.status).toBe("explained"));

    // Relance depuis une chip « à réviser » → l'explication est démontée le temps du cycle.
    const review = result.current.chips.find((c) => c.kind === "review")!;
    act(() => result.current.submitChip(review));
    expect(result.current.status).toBe("generating");
    expect(result.current.explanation).toBeNull();
    expect(result.current.reverse).toBeNull();
  });

  it("les chips « à réviser » portent les skill_id réels de fetchDueReviews()", async () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));
    const review = result.current.chips.find((c) => c.kind === "review");
    expect(review).toMatchObject({ skillId: 3, name: "Les nombres relatifs" });
  });

  it("les suggestions de leçon alimentent les chips « Ta leçon »", async () => {
    vi.mocked(fetchLessonSuggestions).mockResolvedValue([
      { skill_id: 2, name: "La photosynthèse", lesson_id: 7, lesson_title: "Chapitre SVT" },
    ]);
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() =>
      expect(result.current.chips.some((c) => c.kind === "lesson" && c.skillId === 2)).toBe(true),
    );
  });

  it("deep-link ?skill=2 pré-remplit et lance explain", async () => {
    const { result } = renderHook(() => useEli5(), {
      wrapper: wrapper(["/eli5?skill=2"]),
    });
    await waitFor(() => expect(result.current.status).toBe("explained"));
    expect(result.current.question).toBe("La photosynthèse");
    expect(vi.mocked(explainEli5)).toHaveBeenCalledWith(2);
  });

  it("champ hors-programme → requestNotion signale la notion à Papa", async () => {
    vi.mocked(requestNotion).mockResolvedValue({ id: 1, text: "pythagore", status: "pending" });
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.chips.length).toBeGreaterThan(0));

    act(() => result.current.setQuestion("le théorème de Pythagore"));
    act(() => result.current.submitQuestion());
    expect(result.current.noMatch).toBe(true);
    expect(vi.mocked(explainEli5)).not.toHaveBeenCalled();

    act(() => void result.current.requestNotion());
    await waitFor(() => expect(result.current.requested).toBe(true));
    expect(vi.mocked(requestNotion)).toHaveBeenCalledWith("le théorème de Pythagore");
  });

  it("mode de réponse : défaut « write », bascule Écrire/Parler", () => {
    const { result } = renderHook(() => useEli5(), { wrapper: wrapper() });
    expect(result.current.mode).toBe("write");
    act(() => result.current.setMode("speak"));
    expect(result.current.mode).toBe("speak");
    act(() => result.current.setMode("write"));
    expect(result.current.mode).toBe("write");
  });
});
