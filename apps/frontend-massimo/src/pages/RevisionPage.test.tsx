import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ReviewsSummary } from "@zetis/types";
import { RevisionPage } from "./RevisionPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("../lib/reviews", () => ({
  fetchReviewsSummary: vi.fn(),
}));
import { fetchReviewsSummary } from "../lib/reviews";

const SUMMARY: ReviewsSummary = {
  total_due: 27,
  flash_size: 5,
  subjects: [
    { slug: "maths", name: "Maths", due_count: 20 }, // > 15 → « 15+ »
    { slug: "svt", name: "SVT", due_count: 3 },
    { slug: "espagnol", name: "Espagnol", due_count: 0 }, // à jour → non cliquable
  ],
};

function renderAt(path = "/revision") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RevisionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchReviewsSummary).mockReset().mockResolvedValue(SUMMARY);
});

describe("RevisionPage — écran des decks", () => {
  it("plafonne le badge à « 15+ » au-delà de 15", async () => {
    renderAt();
    // La matière Maths (20 dues) plafonne à « 15+ » ; SVT (3) reste exact.
    const maths = await screen.findByRole("button", { name: /Maths/ });
    expect(within(maths).getByText("15+")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /SVT/ })).getByText("3")).toBeInTheDocument();
  });

  it("matière à jour : « à jour ✓ », non cliquable (pas de bouton)", async () => {
    renderAt();
    await screen.findByText("Espagnol");
    expect(screen.getByText("à jour ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Espagnol/ })).not.toBeInTheDocument();
    // Les matières avec des cartes dues restent cliquables.
    expect(screen.getByRole("button", { name: /Maths/ })).toBeInTheDocument();
  });

  it("état zéro global : message bienveillant, aucun CTA de révision", async () => {
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      total_due: 0,
      flash_size: 0,
      subjects: [{ slug: "maths", name: "Maths", due_count: 0 }],
    });
    renderAt();
    expect(await screen.findByText(/Tout est frais dans ta mémoire/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mélange/ })).not.toBeInTheDocument();
  });

  it("deep link ?subject= lance la session matière avec `replace` (pas de boucle au retour)", async () => {
    renderAt("/revision?subject=maths");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/revision/session",
        expect.objectContaining({
          replace: true,
          state: expect.objectContaining({ deck: { subject: "maths" }, label: "Maths" }),
        }),
      ),
    );
  });

  it("ignore ?subject= inconnu (pas de session lancée)", async () => {
    renderAt("/revision?subject=latin");
    await screen.findByText("Maths");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
