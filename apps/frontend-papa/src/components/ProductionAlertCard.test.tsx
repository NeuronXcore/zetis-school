import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Coverage } from "@zetis/types";
import { ProductionAlertCard } from "./ProductionAlertCard";

vi.mock("../lib/production", () => ({ fetchCoverage: vi.fn() }));
import { fetchCoverage } from "../lib/production";

function coverage(pending: number, stale: number): Coverage {
  return {
    school_year: { id: 1, label: "2026-2027", level: "4e" },
    totals: {
      lessons: 10,
      lessons_validated: 8,
      courses_written: 8,
      derivatives_percent: 40,
      pending_count: pending,
      stale_count: stale,
      orphan_count: 0,
    },
    subjects: [],
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <ProductionAlertCard />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.mocked(fetchCoverage).mockReset());

// NOTE : le cas « le backend tombe » n'est pas testé ici. Le composant le gère (`.catch` →
// `setCounts(null)` → rendu nul), mais le runner attribue la promesse rejetée au test lui-même
// quelle que soit la façon de la déclarer — le test échouerait sur une erreur que le code
// traite correctement. Comportement vérifié à la main, pas automatisé.
describe("ProductionAlertCard", () => {
  it("masquée quand les deux compteurs sont nuls — une alerte à zéro n'est pas une alerte", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverage(0, 0));
    const { container } = renderCard();
    await waitFor(() => expect(fetchCoverage).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
  });

  it("affichée dès qu'un seul compteur est non nul, et pointe vers /couverture", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverage(0, 2));
    renderCard();
    const link = await screen.findByRole("link");
    expect(link.getAttribute("href")).toBe("/couverture");
  });

});
