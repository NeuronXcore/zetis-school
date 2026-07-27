import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../lib/missions", () => ({ fetchToday: vi.fn() }));
vi.mock("../lib/reviews", () => ({ fetchReviewsSummary: vi.fn() }));

import { fetchToday } from "../lib/missions";
import { fetchReviewsSummary } from "../lib/reviews";
import { useAccueil } from "./useAccueil";

const today = {
  elected: {
    id: 7,
    subject: "Mathématiques",
    skill_id: 1,
    skill_name: "Nombres relatifs",
    title: "Renforcer les nombres relatifs",
    description: null,
    mission_type: "remediation",
    status: "planned",
    origin: "zetis",
    priority: 1,
    estimated_minutes: 15,
    xp_reward: 60,
    steps: [],
  },
  reason: "Cette notion revient bientôt.",
  reason_code: "due_soon",
  scoring_version: "v3",
  alternatives: [],
};

const reviews = { subjects: [], total_due: 42, flash_size: 5, new_count: 0 };

beforeEach(() => {
  vi.mocked(fetchToday).mockReset().mockResolvedValue(today as never);
  vi.mocked(fetchReviewsSummary).mockReset().mockResolvedValue(reviews as never);
});

describe("useAccueil", () => {
  it("sert les deux payloads tels quels", async () => {
    const { result } = renderHook(() => useAccueil());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.today?.elected?.id).toBe(7);
    expect(result.current.reviews?.flash_size).toBe(5);
  });

  it("garde la mission quand les révisions échouent", async () => {
    // L'invariant du `allSettled` : un `Promise.all` ferait disparaître toute la page parce
    // qu'un compteur secondaire n'a pas répondu.
    vi.mocked(fetchReviewsSummary).mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useAccueil());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.today?.elected?.id).toBe(7);
    expect(result.current.reviews).toBeNull();
  });

  it("ne casse pas quand TOUT échoue", async () => {
    vi.mocked(fetchToday).mockRejectedValue(new Error("réseau"));
    vi.mocked(fetchReviewsSummary).mockRejectedValue(new Error("réseau"));
    const { result } = renderHook(() => useAccueil());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.today).toBeNull();
    expect(result.current.reviews).toBeNull();
  });

  it("n'expose aucun chiffre dérivé ni aucune phrase", async () => {
    // Le hook passe les payloads ; il ne compose rien. C'est ce qui garantit qu'aucun
    // « Tu as consolidé N notions » ne peut réapparaître côté client.
    const { result } = renderHook(() => useAccueil());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current).sort()).toEqual(["loading", "reviews", "today"]);
  });
});
