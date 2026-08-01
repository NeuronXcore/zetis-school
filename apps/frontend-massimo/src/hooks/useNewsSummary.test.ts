import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNewsSummary } from "./useNewsSummary";
import { NEWS_CHANGED_EVENT } from "../lib/newsEvents";

const fetchNewsSummary = vi.fn();

vi.mock("../lib/news", async () => {
  const actual = await vi.importActual<typeof import("../lib/news")>("../lib/news");
  return { ...actual, fetchNewsSummary: () => fetchNewsSummary() };
});

const SUMMARY = { agenda: 1, fiches: 2, capsules: 0, revision: 3, missions: 0, mindmaps: 5 };

beforeEach(() => {
  fetchNewsSummary.mockReset();
  fetchNewsSummary.mockResolvedValue(SUMMARY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useNewsSummary (ADR-0030 §5)", () => {
  it("appelle l'endpoint UNE fois au montage et sert les compteurs", async () => {
    const { result } = renderHook(() => useNewsSummary());
    await waitFor(() => expect(result.current).toEqual(SUMMARY));
    expect(fetchNewsSummary).toHaveBeenCalledTimes(1);
  });

  it("ne rafraîchit JAMAIS tout seul, même après une longue attente", async () => {
    // Verrou anti-polling, miroir côté client du test-verrou backend : un compteur qui bouge
    // sans que Massimo ait rien fait EST une notification, quel que soit son intitulé.
    const { result } = renderHook(() => useNewsSummary());
    await waitFor(() => expect(result.current).toEqual(SUMMARY));

    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);
    expect(fetchNewsSummary).toHaveBeenCalledTimes(1);
  });

  it("refetch quand un geste a consommé une nouveauté", async () => {
    renderHook(() => useNewsSummary());
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event(NEWS_CHANGED_EVENT));
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalledTimes(2));
  });

  it("coalesce une rafale : trois événements rapprochés = UN refetch", async () => {
    // Une séance de révision émet un événement par carte notée. Sans coalescence, quinze
    // requêtes pour un chiffre décoratif.
    renderHook(() => useNewsSummary());
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalledTimes(1));

    for (let i = 0; i < 3; i += 1) window.dispatchEvent(new Event(NEWS_CHANGED_EVENT));
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalledTimes(2));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchNewsSummary).toHaveBeenCalledTimes(2);
  });

  it("retire son écouteur au démontage", async () => {
    const { unmount } = renderHook(() => useNewsSummary());
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalledTimes(1));

    unmount();
    window.dispatchEvent(new Event(NEWS_CHANGED_EVENT));
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(fetchNewsSummary).toHaveBeenCalledTimes(1);
  });

  it("garde des compteurs à zéro si le réseau échoue — aucun badge, aucune erreur", async () => {
    fetchNewsSummary.mockRejectedValue(new Error("réseau"));
    const { result } = renderHook(() => useNewsSummary());
    await waitFor(() => expect(fetchNewsSummary).toHaveBeenCalled());
    expect(result.current).toEqual({
      agenda: 0,
      fiches: 0,
      capsules: 0,
      revision: 0,
      missions: 0,
      mindmaps: 0,
    });
  });
});
