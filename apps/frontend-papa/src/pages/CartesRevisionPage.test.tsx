import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type SrsCardsOverview, type SrsSubjectTree } from "@zetis/types";
import { CartesRevisionPage } from "./CartesRevisionPage";

vi.mock("../lib/srsCards", () => ({
  fetchCardsOverview: vi.fn(),
  fetchSubjectTree: vi.fn(),
  generateSubjectCards: vi.fn(),
  generateSkillCards: vi.fn(),
  fetchSkillCards: vi.fn(),
  reactivateSkill: vi.fn(),
  deleteSkillCards: vi.fn(),
}));

import { deleteSkillCards, fetchCardsOverview, fetchSubjectTree } from "../lib/srsCards";

const OVERVIEW: SrsCardsOverview = {
  subjects: [{ subject_id: 1, name: "Français", active_cards: 2, to_generate: 0, suspended: 1 }],
  totals: { covered: 3, active: 2, to_generate: 0, suspended: 1 },
};
const TREE: SrsSubjectTree = {
  subject_id: 1,
  name: "Français",
  chapters: [],
  suspended: [{ skill_id: 20, name: "Le passé antérieur", state: "suspended", card_count: 0 }],
};

function renderPage() {
  render(
    <MemoryRouter>
      <CartesRevisionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchCardsOverview).mockReset().mockResolvedValue(OVERVIEW);
  vi.mocked(fetchSubjectTree).mockReset().mockResolvedValue(TREE);
  vi.mocked(deleteSkillCards).mockReset().mockResolvedValue({ skill_id: 20, deleted: 3 });
});

describe("CartesRevisionPage", () => {
  it("état vide : aucune leçon validée → renvoie vers Programme", async () => {
    vi.mocked(fetchCardsOverview).mockResolvedValue({
      subjects: [],
      totals: { covered: 0, active: 0, to_generate: 0, suspended: 0 },
    });
    renderPage();
    expect(await screen.findByText(/Aucune leçon validée/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Programme/ })).toBeInTheDocument();
  });

  it("erreur : message + réessayer", async () => {
    vi.mocked(fetchCardsOverview).mockRejectedValue(new Error("Backend indisponible"));
    renderPage();
    expect(await screen.findByText(/Backend indisponible/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
  });

  it("KPI + matière rendus", async () => {
    renderPage();
    expect(await screen.findByText("notions couvertes")).toBeInTheDocument();
    expect(screen.getByText("cartes actives")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Français/ })).toBeInTheDocument();
  });

  it("retirer une notion → ConfirmDialog avant DELETE", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Français/ }));
    fireEvent.click(await screen.findByRole("button", { name: "retirer" }));

    // Le dialogue de confirmation apparaît AVANT toute suppression.
    expect(await screen.findByText(/Retirer les cartes de cette notion/)).toBeInTheDocument();
    expect(deleteSkillCards).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retirer" }));
    await waitFor(() => expect(deleteSkillCards).toHaveBeenCalledWith(20));
  });
});
