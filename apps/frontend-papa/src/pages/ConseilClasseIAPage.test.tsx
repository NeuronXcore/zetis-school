import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ConseilClasseIAPage } from "./ConseilClasseIAPage";

// Lien profond du dashboard vers le Conseil de classe (ADR-0028 §7).
//
// Ce fichier existe pour UN bug précis, constaté le 2026-08-05 : la page portait sa propre table
// de libellés de période, typée `Record<string, string>`. Ce type accepte n'importe quelle clé —
// l'ajout de la fenêtre « Année » au dashboard n'a donc rien pu y casser, et `?period=365` tombait
// dans le repli « Trimestre 1 ». Le Conseil annonçait un trimestre pendant que Papa regardait
// l'année : exactement ce que le transport de la période était censé empêcher.
//
// La table vit désormais dans `lib/dashboardDerive`, typée par `DashboardPeriod`. Retirer une
// fenêtre fait tomber `tsc` ; ce test-ci couvre l'autre moitié — le bout en bout, là où le bug se
// voyait. C'est le seul qui attrape la combinaison « type élargi ailleurs, page pas mise à jour ».

vi.mock("../hooks/useCouncilClass", () => ({
  useCouncilClass: () => ({
    loading: false,
    error: null,
    report: null,
    history: [],
    subjects: [],
    generating: false,
    equipping: null,
    equipResults: [],
    generatedSkillIds: [],
    created: null,
    championSuggestion: null,
    hasActiveChampion: false,
    generate: vi.fn(),
    openReport: vi.fn(),
    equipAndCreateMissions: vi.fn(),
    equipAndCreateChampion: vi.fn(),
    dismissCreated: vi.fn(),
  }),
}));

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ConseilClasseIAPage />
    </MemoryRouter>,
  );
}

describe("ConseilClasseIAPage — période venue du lien profond", () => {
  it("présélectionne « Année scolaire » quand le dashboard était sur l'année", () => {
    renderAt("/conseil?subject=svt&period=365");

    expect(screen.getByLabelText("Période")).toHaveValue("Année scolaire");
  });

  it("présélectionne les trois fenêtres plus courtes", () => {
    for (const [param, libellé] of [
      ["7", "7 derniers jours"],
      ["30", "30 derniers jours"],
      ["90", "Trimestre"],
    ] as const) {
      const { unmount } = renderAt(`/conseil?period=${param}`);
      expect(screen.getByLabelText("Période")).toHaveValue(libellé);
      unmount();
    }
  });

  it("retombe sur le défaut pour une période absente ou aberrante", () => {
    // Le repli reste le bon comportement pour une entrée invalide — il était seulement le mauvais
    // pour une fenêtre légitime.
    for (const url of ["/conseil", "/conseil?period=banane"]) {
      const { unmount } = renderAt(url);
      expect(screen.getByLabelText("Période")).toHaveValue("Trimestre 1");
      unmount();
    }
  });
});
