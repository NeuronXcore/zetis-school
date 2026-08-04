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
    // Six valeurs DISTINCTES : le libellé accessible porte le nombre, deux entrées au même
    // compte seraient indiscernables et le test ne prouverait pas que chacune a le sien.
    renderSidebar({ agenda: 2, fiches: 1, capsules: 3, revision: 5, missions: 7, mindmaps: 4 });

    expect(screen.getByLabelText("2 nouveaux")).toHaveTextContent("2");
    expect(screen.getByLabelText("1 nouveau")).toBeInTheDocument();
    expect(screen.getByLabelText("3 nouveaux")).toHaveTextContent("3");
    expect(screen.getByLabelText("5 nouveaux")).toHaveTextContent("5");
    expect(screen.getByLabelText("7 nouveaux")).toHaveTextContent("7");
    expect(screen.getByLabelText("4 nouveaux")).toHaveTextContent("4");
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

describe("MassimoSidebar — tiroir mobile (2026-08-04)", () => {
  // ⚠️ Défaut MESURÉ, pas supposé : `w-60 shrink-0` sans point de rupture prenait 240 px sur un
  // écran de 375, laissant 135 px à Massimo et un canevas de galaxie de 170 px de large.
  // `CLAUDE.md` exige pourtant une version iPhone.
  const aside = () => document.querySelector("aside")!;

  it("est HORS DU FLUX et escamotée tant que le tiroir est fermé", () => {
    render(
      <MemoryRouter>
        <MassimoSidebar />
      </MemoryRouter>,
    );
    // `fixed` est ce qui rend les 240 px au contenu ; sans lui le tiroir ne répare rien.
    expect(aside().className).toContain("fixed");
    expect(aside().className).toContain("-translate-x-full");
    expect(screen.queryByLabelText("Fermer le menu")).toBeNull();
  });

  it("coulisse et pose un voile quand il est ouvert", () => {
    render(
      <MemoryRouter>
        <MassimoSidebar open />
      </MemoryRouter>,
    );
    expect(aside().className).toContain("translate-x-0");
    expect(aside().className).not.toContain("-translate-x-full");
    // Le voile n'existe QUE tiroir ouvert : laissé en place, il intercepterait les touches.
    expect(screen.getByLabelText("Fermer le menu")).toBeTruthy();
  });

  it("⚠️ ne change RIEN à partir de `md` — le desktop n'est pas la cible du correctif", () => {
    render(
      <MemoryRouter>
        <MassimoSidebar />
      </MemoryRouter>,
    );
    // Ces deux-là annulent le comportement mobile au-dessus du point de rupture. Les perdre
    // ferait disparaître la sidebar sur l'écran où elle a toujours marché — une régression bien
    // pire que le défaut qu'on répare.
    expect(aside().className).toContain("md:static");
    expect(aside().className).toContain("md:translate-x-0");
  });

  it("refermer : choisir une entrée rappelle `onNavigate`", () => {
    // Sinon Massimo arrive sur sa page avec le menu par-dessus, et doit faire un second geste
    // pour voir ce qu'il vient de demander.
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <MassimoSidebar open onNavigate={onNavigate} />
      </MemoryRouter>,
    );
    screen.getByText("Agenda").click();
    expect(onNavigate).toHaveBeenCalledTimes(1);

    screen.getByLabelText("Fermer le menu").click();
    expect(onNavigate).toHaveBeenCalledTimes(2);
  });

  it("les 13 entrées restent là — le tiroir ne retire RIEN", () => {
    // ⚠️ Ce n'est pas la bottom-nav des 5 verbes de `navigation.md` : cette spec date de l'étape 2
    // et appliquer sa lettre masquerait 8 sections, dont l'Agenda que l'ADR-0025 a délibérément
    // placé en position 2. Le tiroir répare la largeur, il ne rouvre aucune décision.
    render(
      <MemoryRouter>
        <MassimoSidebar open />
      </MemoryRouter>,
    );
    for (const libelle of ["Accueil", "Agenda", "Matières", "Ma Galaxie", "Chat ZETIS"]) {
      expect(screen.getByText(libelle)).toBeTruthy();
    }
    expect(aside().querySelectorAll("nav a")).toHaveLength(13);
  });
});
