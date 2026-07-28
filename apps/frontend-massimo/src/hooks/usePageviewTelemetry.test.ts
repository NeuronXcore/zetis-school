import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../lib/telemetry", () => ({ sendPageview: vi.fn() }));

const mockPathname = { value: "/cours" };
vi.mock("react-router-dom", () => ({
  useLocation: () => ({ pathname: mockPathname.value }),
}));

import { sendPageview } from "../lib/telemetry";
import { usePageviewTelemetry } from "./usePageviewTelemetry";

beforeEach(() => {
  vi.mocked(sendPageview).mockReset();
  mockPathname.value = "/cours";
});

describe("usePageviewTelemetry", () => {
  it("envoie la route à l'arrivée sur une page", () => {
    renderHook(() => usePageviewTelemetry());
    expect(sendPageview).toHaveBeenCalledExactlyOnceWith("/cours");
  });

  it("n'envoie rien si la route n'a pas changé (remontage, re-render)", () => {
    const { rerender } = renderHook(() => usePageviewTelemetry());
    rerender();
    rerender();
    expect(sendPageview).toHaveBeenCalledTimes(1);
  });

  it("envoie à chaque VRAI changement de route, retour compris", () => {
    const { rerender } = renderHook(() => usePageviewTelemetry());

    mockPathname.value = "/revision";
    rerender();
    // Retour sur une page déjà visitée : c'est une navigation, donc un événement.
    mockPathname.value = "/cours";
    rerender();

    expect(vi.mocked(sendPageview).mock.calls.map(([route]) => route)).toEqual([
      "/cours",
      "/revision",
      "/cours",
    ]);
  });
});
