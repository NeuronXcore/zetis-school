import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAgendaWeek = vi.fn();
const fetchAgendaItems = vi.fn();
const fetchAgendaUpcoming = vi.fn();
const fetchAgendaAhead = vi.fn();
const fetchLateAlert = vi.fn();
const markLateAlertSeen = vi.fn();
const markAgendaSeen = vi.fn();

vi.mock("../lib/agenda", () => ({
  fetchAgendaWeek: () => fetchAgendaWeek(),
  fetchAgendaItems: (...args: unknown[]) => fetchAgendaItems(...args),
  fetchAgendaUpcoming: () => fetchAgendaUpcoming(),
  fetchAgendaAhead: () => fetchAgendaAhead(),
  fetchLateAlert: () => fetchLateAlert(),
  markLateAlertSeen: () => markLateAlertSeen(),
  markAgendaSeen: () => markAgendaSeen(),
  setAgendaItemDone: vi.fn(),
  setAgendaPlanStepDone: vi.fn(),
  dismissAgendaItem: vi.fn(),
  undismissAgendaItem: vi.fn(),
}));

import { useAgenda } from "./useAgenda";

beforeEach(() => {
  fetchAgendaWeek.mockReset().mockResolvedValue({ days: [] });
  fetchAgendaItems.mockReset().mockResolvedValue([]);
  fetchAgendaUpcoming.mockReset().mockResolvedValue([]);
  // ⚠️ Sans ce mock, `load()` appelait `undefined()` : les tests restaient VERTS et le
  // rejet remontait en « unhandled error » — un vert qui masque un appel cassé.
  fetchAgendaAhead.mockReset().mockResolvedValue({ anchor: null, gestes: [] });
  fetchLateAlert.mockReset().mockResolvedValue(null);
  markLateAlertSeen.mockReset().mockResolvedValue(undefined);
  markAgendaSeen.mockReset().mockResolvedValue(undefined);
});

// 🔴 CE FICHIER EXISTE PARCE QUE `useAgenda` EST DEVENU LE SEUL APPELANT.
//
// Jusqu'au 2026-08-15, `markAgendaSeen` avait deux appelants et le bandeau d'Accueil portait le
// seul test. `adr-0025-agenda-scolaire` (Amendement 7) a retiré celui-là — laisser le geste
// survivant non couvert aurait transformé une révocation en suppression silencieuse du témoin.
describe("useAgenda — le regard", () => {
  it("marque l'agenda vu à l'ouverture de la page", async () => {
    renderHook(() => useAgenda());
    await waitFor(() => expect(markAgendaSeen).toHaveBeenCalledTimes(1));
  });

  it("ne le remarque pas quand la page se recharge d'elle-même", async () => {
    // L'effet est SANS dépendance, et c'est délibéré (`useAgenda.ts`) : le mettre dans `load()`
    // le rejouerait à chaque coche, ce qui marcherait mais confondrait « regarder » et « agir ».
    const { rerender } = renderHook(() => useAgenda());
    await waitFor(() => expect(markAgendaSeen).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(markAgendaSeen).toHaveBeenCalledTimes(1);
  });
});
