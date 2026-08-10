import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReviewCard, type ReviewRating } from "@zetis/types";
import {
  cappedCount,
  chapterContext,
  computeTier,
  useReviewSession,
} from "./useReviewSession";

vi.mock("../lib/reviews", () => ({
  startReviewSession: vi.fn(),
  submitReviewAttempt: vi.fn(),
}));

import { startReviewSession, submitReviewAttempt } from "../lib/reviews";

function card(id: number, slug = "maths"): ReviewCard {
  return { card_id: id, subject_slug: slug, front_markdown: `Q${id}`, back_markdown: `R${id}` };
}

// Note serveur par défaut : +5 XP, planification opaque (le client ne la lit pas).
function attempt(xp: number, isConsolidation = false) {
  return { next_due_at: null, xp_awarded: xp, is_consolidation: isConsolidation };
}

beforeEach(() => {
  vi.mocked(startReviewSession).mockReset().mockResolvedValue([card(1), card(2)]);
  vi.mocked(submitReviewAttempt).mockReset().mockResolvedValue(attempt(5));
});

// Enchaîne reveal → rate sur la carte courante, attend la transition attendue.
async function answer(
  result: { current: ReturnType<typeof useReviewSession> },
  rating: ReviewRating,
  becomes: string,
) {
  act(() => result.current.reveal());
  await waitFor(() => expect(result.current.status).toBe("back"));
  await act(async () => {
    result.current.rate(rating);
  });
  await waitFor(() => expect(result.current.status).toBe(becomes));
}

// ── Helpers purs ────────────────────────────────────────────────────────────

describe("computeTier — bornes incluses", () => {
  it("≥ 80 % → haut (80 % inclus)", () => {
    expect(computeTier(0.8)).toBe("high");
    expect(computeTier(1)).toBe("high");
  });
  it("50–79 % → moyen (50 % inclus)", () => {
    expect(computeTier(0.5)).toBe("mid");
    expect(computeTier(0.79)).toBe("mid");
  });
  it("< 50 % → bas", () => {
    expect(computeTier(0.49)).toBe("low");
    expect(computeTier(0)).toBe("low");
  });
});

describe("cappedCount", () => {
  it("exact jusqu'à 15, « 15+ » au-delà", () => {
    expect(cappedCount(0)).toBe("0");
    expect(cappedCount(15)).toBe("15");
    expect(cappedCount(16)).toBe("15+");
    expect(cappedCount(99)).toBe("15+");
  });
});

// ── Machine à états ─────────────────────────────────────────────────────────

describe("useReviewSession", () => {
  it("charge la session au montage puis présente le recto", async () => {
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));
    expect(vi.mocked(startReviewSession)).toHaveBeenCalledWith("mix_day");
    expect(result.current.card?.card_id).toBe(1);
    expect(result.current.progress).toEqual({ current: 1, total: 2 });
  });

  it("deck déjà à jour (0 carte servie) → done, sans session vide inventée", async () => {
    vi.mocked(startReviewSession).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("done"));
  });

  it("les notes n'apparaissent qu'après le flip (anti-réflexe)", async () => {
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));
    expect(result.current.showRatings).toBe(false);

    act(() => result.current.reveal());
    await waitFor(() => expect(result.current.status).toBe("back"));
    // Juste après le flip : encore masquées.
    expect(result.current.showRatings).toBe(false);
    // Puis elles apparaissent (délai anti-réflexe).
    await waitFor(() => expect(result.current.showRatings).toBe(true));
  });

  it("file `fragile` = cartes notées à revoir / difficile du passage", async () => {
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));

    await answer(result, "again", "front"); // carte 1 → fragile
    await answer(result, "good", "summary"); // carte 2 → ancrée
    expect(result.current.summary?.fragileCount).toBe(1);
    expect(result.current.summary?.total).toBe(2);
    expect(result.current.summary?.good).toBe(1);
  });

  it("XP affichée = SOMME des `xp_awarded` serveur, jamais un recalcul client (consolidation +2, pas +5)", async () => {
    // Passage 1 : +5 par carte (serveur). Re-tour : +2 par carte (consolidation serveur).
    vi.mocked(submitReviewAttempt)
      .mockReset()
      .mockResolvedValueOnce(attempt(5))
      .mockResolvedValueOnce(attempt(5))
      .mockResolvedValueOnce(attempt(2, true))
      .mockResolvedValueOnce(attempt(2, true));

    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));

    // Passage 1 : deux « à revoir » → pct 0 → palier bas, re-tour possible.
    await answer(result, "again", "front");
    await answer(result, "again", "summary");
    expect(result.current.summary?.xp).toBe(10);
    expect(result.current.summary?.tier).toBe("low");
    expect(result.current.summary?.canRedo).toBe(true);
    expect(result.current.summary?.fragileCount).toBe(2);

    // Re-tour : le serveur renvoie +2 (consolidation). Le total suit le serveur : 10+2+2 = 14.
    act(() => result.current.redo());
    await waitFor(() => expect(result.current.status).toBe("front"));
    await answer(result, "good", "front");
    await answer(result, "good", "summary");

    expect(result.current.summary?.xp).toBe(14); // PAS 20 (= 4×5 si le client recalculait)
  });

  it("le re-tour n'est proposé qu'une seule fois par session", async () => {
    vi.mocked(submitReviewAttempt).mockResolvedValue(attempt(5));
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));

    await answer(result, "again", "front");
    await answer(result, "hard", "summary");
    expect(result.current.summary?.canRedo).toBe(true);

    act(() => result.current.redo());
    await waitFor(() => expect(result.current.status).toBe("front"));
    // Même score bas au re-tour → plus de re-tour offert.
    await answer(result, "again", "front");
    await answer(result, "again", "summary");
    expect(result.current.summary?.tier).toBe("low");
    expect(result.current.summary?.canRedo).toBe(false);
  });

  it("passage réussi → palier haut, aucun re-tour", async () => {
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));

    await answer(result, "good", "front");
    await answer(result, "easy", "summary");
    expect(result.current.summary?.pct).toBe(1);
    expect(result.current.summary?.tier).toBe("high");
    expect(result.current.summary?.canRedo).toBe(false);
  });

  it("finish → done (l'écran de session rendra la main aux decks)", async () => {
    const { result } = renderHook(() => useReviewSession("mix_day"));
    await waitFor(() => expect(result.current.status).toBe("front"));
    await answer(result, "good", "front");
    await answer(result, "good", "summary");
    act(() => result.current.finish());
    expect(result.current.status).toBe("done");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// LE CONTEXTE DE SESSION CHAPITRE (ADR-0049 Décision 4)
// ─────────────────────────────────────────────────────────────────────────────────────

describe("chapterContext — l'écho du deck, jamais une décision", () => {
  it("rend le contexte pour un deck chapitre, et rien pour les autres", () => {
    expect(chapterContext({ chapter: 12 })).toEqual({ chapter: 12 });
    expect(chapterContext("mix_day")).toBeUndefined();
    expect(chapterContext("mix_flash")).toBeUndefined();
    expect(chapterContext({ subject: "histoire" })).toBeUndefined();
    expect(chapterContext(null)).toBeUndefined();
  });
});

describe("useReviewSession — le deck accompagne CHAQUE note", () => {
  it("🔴 VERROU — toutes les notes d'une session chapitre portent le contexte", async () => {
    // Un contexte posé sur la première note seulement laisserait les suivantes replanifier les
    // cartes : l'invariant de l'ADR-0025 §11 serait tenu sur une carte et violé sur les autres.
    const { result } = renderHook(() => useReviewSession({ chapter: 12 }));
    await waitFor(() => expect(result.current.status).toBe("front"));

    await answer(result, "good", "front");
    await answer(result, "again", "summary");

    expect(vi.mocked(submitReviewAttempt).mock.calls).toHaveLength(2);
    for (const call of vi.mocked(submitReviewAttempt).mock.calls) {
      expect(call[2]).toEqual({ chapter: 12 });
    }
  });

  it("VERROU — une session ordinaire n'envoie AUCUN contexte", () => {
    // Le corps de la requête doit rester `{rating}` à l'identique hors deck chapitre : un
    // contexte parasite sur un mélange ferait taire la replanification de cartes réellement dues.
    return (async () => {
      const { result } = renderHook(() => useReviewSession("mix_day"));
      await waitFor(() => expect(result.current.status).toBe("front"));
      await answer(result, "good", "front");
      expect(vi.mocked(submitReviewAttempt).mock.calls[0][2]).toBeUndefined();
    })();
  });
});
