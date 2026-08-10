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
  new_count: 4,
  subjects: [
    { slug: "maths", name: "Maths", due_count: 20, new_count: 4, has_cards: true }, // > 15 → « 15+ »
    { slug: "svt", name: "SVT", due_count: 3, new_count: 0, has_cards: true },
    { slug: "espagnol", name: "Espagnol", due_count: 0, new_count: 0, has_cards: true }, // à jour ✓
    { slug: "histoire", name: "Histoire", due_count: 0, new_count: 0, has_cards: false }, // sans carte → grisé
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

  it("badge « ✨ new » sur les decks contenant des cartes fraîchement générées", async () => {
    renderAt();
    const maths = await screen.findByRole("button", { name: /Maths/ });
    expect(within(maths).getByText(/new/)).toBeInTheDocument(); // maths new_count=4
    expect(
      within(screen.getByRole("button", { name: /SVT/ })).queryByText(/new/),
    ).not.toBeInTheDocument(); // svt new_count=0
  });

  it("matière à jour : « à jour ✓ », non cliquable (pas de bouton)", async () => {
    renderAt();
    await screen.findByText("Espagnol");
    expect(screen.getByText("à jour ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Espagnol/ })).not.toBeInTheDocument();
    // Les matières avec des cartes dues restent cliquables.
    expect(screen.getByRole("button", { name: /Maths/ })).toBeInTheDocument();
  });

  it("matière sans carte : grisée « à venir » / « pas encore de cartes », non cliquable", async () => {
    renderAt();
    await screen.findByText("Histoire");
    expect(screen.getByText("à venir")).toBeInTheDocument();
    expect(screen.getByText("pas encore de cartes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Histoire/ })).not.toBeInTheDocument();
  });

  it("état zéro global : message bienveillant, aucun CTA de révision", async () => {
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      total_due: 0,
      flash_size: 0,
      new_count: 0,
      subjects: [{ slug: "maths", name: "Maths", due_count: 0, new_count: 0, has_cards: true }],
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

// ─────────────────────────────────────────────────────────────────────────────────────
// VERROU DE DÉPÔT — la porte du deck chapitre n'entre PAS sur /revision (ADR-0049)
// ─────────────────────────────────────────────────────────────────────────────────────

describe("VERROU de dépôt — le drill-in permanent est une option ÉCARTÉE", () => {
  it("aucune trace du deck chapitre sous src/pages/Revision*", async () => {
    // La Décision 1 a retenu la porte (a) — l'échéance d'agenda — et ÉCARTÉ (b), le drill-in
    // permanent depuis le deck matière, au motif du *blocked practice* : une porte permanente
    // peut devenir le chemin par défaut, au détriment du mélange entrelacé.
    //
    // Ce verrou attrape la dérive nommée d'avance : « tant qu'on y est, mettons-la aussi sur
    // /revision ». Si elle devient souhaitable un jour, c'est un ADR qui l'ouvre — pas un test
    // qu'on supprime.
    // ⚠️ `process.cwd()`, PAS `import.meta.url` : ce dernier rend un chemin tronqué sous vitest.
    // Le piège est déjà consigné dans `src/voix-de-zetis.test.ts` — vérifié, pas supposé.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const racine = join(process.cwd(), "src", "pages");
    for (const fichier of ["RevisionPage.tsx", "RevisionSessionPage.tsx"]) {
      const src = readFileSync(join(racine, fichier), "utf8");
      expect(src, `${fichier} ne doit pas porter le deck chapitre`).not.toMatch(/\bchapter\b/);
      expect(src, `${fichier} ne doit pas porter le deck chapitre`).not.toMatch(/chapitre/i);
    }
  });
});
