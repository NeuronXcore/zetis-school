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

import { NIVEAU_LABEL } from "../lib/settings";
import { PAPA_NAV } from "../lib/navigation";
import { type AutonomyState } from "../hooks/useAutonomyState";
import { PapaSidebar } from "./PapaSidebar";

const SEMI: AutonomyState = {
  status: "ready",
  autonomy: { auto_trigger_enabled: false,
    production_suspended: false, classes: [], niveau: "semi" },
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
    // ⚠️ Le libellé n'est plus ÉCRIT (il est dans l'illustration, cf. §7.2bis) : on vérifie le
    // nom accessible du lien, qui lui porte les deux axes. Chercher le texte à l'écran donnerait
    // un test rouge pour une bonne raison — et, si on le « réparait » à l'envers, un test creux.
    show(SEMI);
    expect(
      screen.getByRole("link", { name: new RegExp(NIVEAU_LABEL.semi) }),
    ).toBeInTheDocument();
  });

  it("montée sans prop, ne devine aucun régime", () => {
    // Le repli du défaut est `loading` — jamais un régime, jamais « Manuel » par prudence.
    show();
    for (const label of [...Object.values(NIVEAU_LABEL), "Sur mesure"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it("🔒 ne porte PAS la signature de l'interface — elle vit dans le header", () => {
    // Déplacée dans `PapaLayout` le 2026-08-04 (addendum §7.2bis) : la sidebar est la colonne
    // rare, 22 entrées à faire tenir. Le verrou d'identité est là-bas ; celui-ci empêche de la
    // ré-ajouter ici en croyant réparer un oubli.
    const { container } = show(SEMI);
    expect(container.querySelector("aside")!.textContent).not.toContain("ZETIS Papa");
  });

  it("le bandeau a cédé sa place, et le bloc ne retire AUCUNE entrée", () => {
    const { container } = show(SEMI);

    // « Cockpit de pilotage » ne revient pas : c'était la ligne qui n'apprenait rien.
    expect(screen.queryByText("Cockpit de pilotage")).toBeNull();
    // ⚠️ Sélecteur `nav a` obligatoire : le bloc d'état est un `<a>` lui aussi, mais hors du
    // `<nav>`. Un `querySelectorAll("a")` compterait 23 et le test ne prouverait rien.
    expect(container.querySelectorAll("nav a")).toHaveLength(PAPA_NAV.length);
  });
});
