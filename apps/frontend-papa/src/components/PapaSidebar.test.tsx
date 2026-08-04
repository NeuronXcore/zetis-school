import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// Les deux pastilles héritées appellent le réseau depuis le composant (dette datée, cf. l'en-tête
// de `PapaSidebar.tsx`) : on les neutralise pour que ces tests portent sur le bloc d'état.
vi.mock("../lib/missionsPilotage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/missionsPilotage")>()),
  fetchPilotSummary: vi.fn().mockResolvedValue({ pending: 0 }),
}));
vi.mock("../lib/contentRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/contentRequests")>()),
  fetchContentRequestsCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("../lib/notionRequests", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/notionRequests")>()),
  fetchNotionRequestsCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("../lib/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/settings")>()),
  fetchAutonomy: vi.fn(),
}));
import { fetchAutonomy } from "../lib/settings";

import { PAPA_NAV } from "../lib/navigation";
import { type AutonomyState } from "../hooks/useAutonomyState";
import { PapaSidebar } from "./PapaSidebar";

const SEMI: AutonomyState = {
  status: "ready",
  autonomy: { auto_trigger_enabled: false, classes: [], preset: "semi" },
};

function show(autonomy?: AutonomyState) {
  return render(
    <MemoryRouter>
      <PapaSidebar autonomy={autonomy} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PapaSidebar", () => {
  it("🔒 ne lit JAMAIS l'autonomie elle-même : la valeur vient du layout", () => {
    // ⚠️ Verrou RÉDUIT, et le motif est dans l'en-tête du composant : « aucun appel réseau »
    // (le verrou fort de l'ADR-0030) reste impossible tant que les deux pastilles héritées vivent
    // ici. Le verrou fort est porté par `EtatZetis`, qui est pur. Sans celui-ci, la troisième
    // entrée ré-introduirait le motif « un fetch par pastille ».
    show(SEMI);
    expect(fetchAutonomy).not.toHaveBeenCalled();
  });

  it("rend l'état reçu en tête", () => {
    show(SEMI);
    expect(screen.getByText("Semi-autonome")).toBeInTheDocument();
  });

  it("montée sans prop, ne devine aucun régime", () => {
    // Le repli du défaut est `loading` — jamais un régime, jamais « Manuel » par prudence.
    show();
    for (const label of ["Manuel", "Semi-autonome", "Autonome", "Sur mesure"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("le bandeau de marque a cédé sa place, et le bloc ne retire AUCUNE entrée", () => {
    const { container } = show(SEMI);

    expect(screen.queryByText("Cockpit de pilotage")).toBeNull();
    // ⚠️ Sélecteur `nav a` obligatoire : le bloc d'état est un `<a>` lui aussi, mais hors du
    // `<nav>`. Un `querySelectorAll("a")` compterait 23 et le test ne prouverait rien.
    expect(container.querySelectorAll("nav a")).toHaveLength(PAPA_NAV.length);
  });
});
