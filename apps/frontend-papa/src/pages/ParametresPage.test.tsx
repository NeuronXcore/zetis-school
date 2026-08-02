import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { ParametresPage } from "./ParametresPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <ParametresPage />
    </MemoryRouter>,
  );
}

describe("ParametresPage", () => {
  it("test-verrou : aucune commande qui ne fait rien", () => {
    // La page portait 3 interrupteurs en `useState` non persisté et un `<select>` « Fournisseur
    // IA » sans handler. Le danger n'était pas l'inutilité mais la CONFIANCE : une page où des
    // commandes ne font rien est un piège le jour où d'autres engagent l'autonomie de ZETIS.
    // Ce verrou interdit qu'une commande revienne ici avant d'être réellement branchée.
    renderPage();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    // Seul un bouton réellement câblé aurait sa place — aucun aujourd'hui.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("ne propose aucun fournisseur IA tiers (ADR-0008 : 100 % local)", () => {
    // Le sélecteur retiré proposait « OpenAI » comme réglage global, ce qui laissait croire que
    // les données de Massimo pouvaient y partir. La seule dérogation cloud est `curriculum_*`
    // (Anthropic), bornée par l'ADR-0009 et sans aucune donnée de Massimo.
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/OpenAI|Fournisseur IA/i);
  });

  it("oriente vers le seul réglage réel, sur la page où la décision se prend", () => {
    renderPage();
    expect(screen.getByRole("link", { name: "Agenda" })).toHaveAttribute("href", "/agenda");
  });

  it("annonce l'autonomie comme indisponible, avec son motif — jamais absente", () => {
    // Convention Papa : une capacité indisponible est grisée AVEC son motif (patron « File de
    // relecture » sur la Couverture). La doctrine « aucun composer grisé » protège Massimo d'une
    // privation affichée ; elle ne protège pas Papa d'une information.
    renderPage();
    expect(screen.getByText("Autonomie de ZETIS")).toBeInTheDocument();
    expect(screen.getByTitle(/non livré/i)).toBeInTheDocument();
  });
});
