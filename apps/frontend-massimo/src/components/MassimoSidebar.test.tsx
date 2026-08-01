import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type NewsSummary } from "@zetis/types";
import { MassimoSidebar } from "./MassimoSidebar";
import { EMPTY_NEWS } from "../lib/news";

function renderSidebar(news?: NewsSummary) {
  return render(
    <MemoryRouter>
      <MassimoSidebar news={news} />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MassimoSidebar — témoins de nouveauté (ADR-0030)", () => {
  it("rend un badge par entrée qui en a un, avec son compte", () => {
    // Cinq valeurs DISTINCTES : le libellé accessible porte le nombre, deux entrées au même
    // compte seraient indiscernables et le test ne prouverait pas que chacune a le sien.
    renderSidebar({ agenda: 2, fiches: 1, capsules: 3, revision: 5, missions: 7 });

    expect(screen.getByLabelText("2 nouveaux")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 nouveau")).toBeInTheDocument();
    expect(screen.getByLabelText("3 nouveaux")).toHaveTextContent("3");
    expect(screen.getByLabelText("5 nouveaux")).toHaveTextContent("5");
    expect(screen.getByLabelText("7 nouveaux")).toHaveTextContent("7");
  });

  it("ne rend RIEN à zéro — pas de « 0 », pas de réceptacle vide", () => {
    const { container } = renderSidebar(EMPTY_NEWS);
    expect(container.querySelectorAll("[aria-label$='nouveau'], [aria-label$='nouveaux']"))
      .toHaveLength(0);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("plafonne à « 9+ » sans jamais afficher le compte exact au-delà", () => {
    renderSidebar({ ...EMPTY_NEWS, fiches: 12 });
    const badge = screen.getByLabelText("12 nouveaux");
    expect(badge).toHaveTextContent("9+");
    expect(badge).not.toHaveTextContent("12");
  });

  it("n'attire l'œil par AUCUNE animation ni par du rouge (§6)", () => {
    renderSidebar({ ...EMPTY_NEWS, missions: 1 });
    const badge = screen.getByLabelText("1 nouveau");
    expect(badge.className).not.toMatch(/animate|pulse|transition/);
    expect(badge.className).not.toMatch(/red|amber|yellow/);
  });

  it("ne fait AUCUN appel réseau : les compteurs viennent du layout", () => {
    // Verrou du lot. La sidebar faisait auparavant deux fetch au montage, un par pastille ; sans
    // ce test, la troisième entrée ré-introduirait le patron entrée par entrée.
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderSidebar({ ...EMPTY_NEWS, agenda: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("se monte sans prop (repli à zéro) — aucun badge, aucune erreur", () => {
    const { container } = renderSidebar();
    expect(container.querySelectorAll("[aria-label$='nouveaux']")).toHaveLength(0);
    expect(screen.getByText("Agenda")).toBeInTheDocument();
  });
});
