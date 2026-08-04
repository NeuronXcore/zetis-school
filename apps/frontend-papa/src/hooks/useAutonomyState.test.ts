import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type Autonomy } from "@zetis/types";

vi.mock("../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/settings")>()),
  fetchAutonomy: vi.fn(),
}));
import { AUTONOMY_CHANGED_EVENT, fetchAutonomy } from "../lib/settings";

import { useAutonomyState } from "./useAutonomyState";

function autonomy(overrides: Partial<Autonomy> = {}): Autonomy {
  return {
    auto_trigger_enabled: false,
    classes: [],
    preset: "semi",
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchAutonomy).mockResolvedValue(autonomy());
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useAutonomyState", () => {
  it("commence en « loading » — jamais un régime avant la réponse (addendum §7.4)", () => {
    const { result } = renderHook(() => useAutonomyState());
    expect(result.current).toEqual({ status: "loading" });
  });

  it("passe en « ready » avec l'objet du serveur, sans rien recalculer", async () => {
    const served = autonomy({ preset: "autonome", auto_trigger_enabled: true });
    vi.mocked(fetchAutonomy).mockResolvedValue(served);

    const { result } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    // Identité de référence : le hook TRANSPORTE, il ne dérive pas. `preset` vient du serveur
    // (ADR-0032 §2) — un hook qui le recalculerait construirait un nouvel objet.
    expect(result.current).toEqual({ status: "ready", autonomy: served });
  });

  it("🔒 un échec donne « error », JAMAIS un régime de repli", async () => {
    vi.mocked(fetchAutonomy).mockRejectedValue(new Error("réseau"));

    const { result } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("error"));

    // Le piège que ce test verrouille : un `catch` qui laisserait passer un `preset` par défaut.
    expect(result.current).not.toHaveProperty("autonomy");
  });

  it("🔒 un échec APRÈS une lecture réussie efface l'état — un régime périmé est un régime faux", async () => {
    const { result } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    vi.mocked(fetchAutonomy).mockRejectedValue(new Error("réseau"));
    act(() => {
      window.dispatchEvent(new Event(AUTONOMY_CHANGED_EVENT));
    });

    // ⚠️ DIVERGENCE assumée d'avec `useNewsSummary`, qui garde sa valeur précédente. Ici la valeur
    // précédente EST le mensonge (`page-parametres.md`, §États).
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("n'appelle le serveur qu'UNE fois au montage", async () => {
    const { result } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(fetchAutonomy).toHaveBeenCalledTimes(1);
  });

  it("🔒 ne SONDE jamais : 60 s de timers avancés sans événement → toujours un seul appel", async () => {
    // ⚠️ Les faux timers s'installent AVANT le montage, et c'est tout le test. Posés après, ils
    // ne contrôlent pas les minuteurs déjà créés : un `setInterval` de sondage leur échapperait
    // et le verrou passerait au vert devant la faute qu'il est censé attraper. Contre-épreuve
    // faite le 2026-08-04 — la première version de ce test ne mordait pas.
    vi.useFakeTimers();
    const { result } = renderHook(() => useAutonomyState());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.status).toBe("ready");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    // Verrou repris de l'ADR-0030. Sans lui, un `setInterval` de « rafraîchissement » se glisse au
    // premier bug de fraîcheur signalé, et la sidebar interroge le serveur sur les 22 pages.
    expect(fetchAutonomy).toHaveBeenCalledTimes(1);
  });

  it("relit sur événement, et coalesce les rafales en un seul appel", async () => {
    const { result } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("ready"));

    vi.useFakeTimers();
    act(() => {
      for (let i = 0; i < 5; i += 1) window.dispatchEvent(new Event(AUTONOMY_CHANGED_EVENT));
    });
    expect(fetchAutonomy).toHaveBeenCalledTimes(1); // rien n'est parti avant le débounce

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(fetchAutonomy).toHaveBeenCalledTimes(2); // cinq événements, UN appel
  });

  it("démonté avant la réponse, n'écrit plus rien", async () => {
    let resolve: (value: Autonomy) => void = () => undefined;
    vi.mocked(fetchAutonomy).mockReturnValue(
      new Promise<Autonomy>((r) => {
        resolve = r;
      }),
    );

    const { unmount } = renderHook(() => useAutonomyState());
    unmount();
    await act(async () => {
      resolve(autonomy());
    });
    // Le flag `alive` : sans lui, React avertit et un composant démonté re-rend.
  });

  it("cesse d'écouter après démontage", async () => {
    const { result, unmount } = renderHook(() => useAutonomyState());
    await waitFor(() => expect(result.current.status).toBe("ready"));
    unmount();

    vi.useFakeTimers();
    act(() => {
      window.dispatchEvent(new Event(AUTONOMY_CHANGED_EVENT));
    });
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(fetchAutonomy).toHaveBeenCalledTimes(1);
  });
});
