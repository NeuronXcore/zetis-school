import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../lib/missions", () => ({ fetchToday: vi.fn() }));
vi.mock("../lib/reviews", () => ({ fetchReviewsSummary: vi.fn() }));
vi.mock("../lib/motivation", () => ({ fetchWelcome: vi.fn() }));

import { fetchToday } from "../lib/missions";
import { fetchWelcome } from "../lib/motivation";
import { fetchReviewsSummary } from "../lib/reviews";
import { useAccueil } from "./useAccueil";

const welcome = {
  code: "all_clear",
  title: "Rien d'obligatoire aujourd'hui, Massimo.",
  subtitle: null,
  cta: null,
  context: {
    first_name: "Massimo",
    last_notion: null,
    days_since_last_visit: 0,
    consolidated_this_week: 0,
    gaps_closed_this_week: 0,
    reviews_due: 0,
    regularity: {
      week_start: "2026-07-27",
      days: [],
      days_done: 0,
      today_done: false,
      goal_days: null,
      goal_met: false,
    },
  },
};

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
  vi.mocked(fetchWelcome).mockReset().mockResolvedValue(welcome as never);
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
    // La liste reste EXHAUSTIVE : c'est elle qui interdit d'ajouter un champ dérivé en douce.
    // Tous les ajouts du 2026-07-31 sont des payloads serveur BRUTS — `capsules` et `subjects`
    // (refonte de l'Accueil), puis `xpHistory`, `timeline` et `gamification` (Accueil vivant).
    // Aucun n'est un chiffre composé côté client, et c'est ce que ce test protège.
    expect(Object.keys(result.current).sort()).toEqual([
      "capsules",
      "gamification",
      "loading",
      "refreshWelcome",
      "reviews",
      "subjects",
      "timeline",
      "today",
      "welcome",
      "xpHistory",
    ]);
  });

  it("recharge le message quand l'engagement change", async () => {
    // Sans ça, ZETIS resterait sur « engagement tenu » après que Massimo a relevé son objectif,
    // et contredirait la carte « Ma semaine » juste en dessous.
    const { result } = renderHook(() => useAccueil());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchWelcome).toHaveBeenCalledTimes(1);

    result.current.refreshWelcome();
    await waitFor(() => expect(fetchWelcome).toHaveBeenCalledTimes(2));
  });

  it("garde la page vivante si le message de ZETIS tombe", async () => {
    // La carte ZETIS ne s'affichera pas — et surtout, aucune phrase de secours ne la remplace :
    // ce serait le mensonge qu'on vient de retirer de cette page, sous une autre forme.
    vi.mocked(fetchWelcome).mockRejectedValue(new Error("503"));
    const { result } = renderHook(() => useAccueil());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.welcome).toBeNull();
    expect(result.current.today?.elected?.id).toBe(7);
  });
});
