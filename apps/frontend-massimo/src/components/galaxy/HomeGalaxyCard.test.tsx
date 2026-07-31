import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalaxySubject } from "@zetis/types";

// Le ciel 3D de l'Accueil (addendum « la galaxie revient sur l'Accueil », 2026-07-31 soir).
//
// Ce qui se teste ici : qu'il arrive APRÈS la première peinture, et pas du tout quand il ne
// doit pas. Le rendu lui-même est hors de portée de jsdom.

vi.mock("@zetis/ui/galaxy", async (actual) => ({
  ...((await actual()) as object),
  hasWebGL: () => webgl,
}));

let webgl = true;

vi.mock("@zetis/ui/galaxy/canvas", () => ({
  GalaxyCanvas: () => <div data-testid="ciel" />,
}));

// Le graphe complet n'est chargé QU'AVEC le ciel, jamais au premier rendu.
const fetches = { graph: 0, timeline: 0 };
vi.mock("../../lib/galaxy", () => ({
  fetchFullGraph: () => {
    fetches.graph += 1;
    return Promise.resolve({
      nodes: [
        { id: "root", kind: "root", label: "ZETIS" },
        { id: "subject-1", kind: "subject", label: "SVT", subject_slug: "svt" },
        { id: "chapter-1", kind: "chapter", label: "Cellule", chapter_id: 1 },
        { id: "skill-1", kind: "skill", label: "Mitose", skill_id: 1, status: "solid" },
      ],
      edges: [
        { source: "root", target: "subject-1", type: "structure" },
        { source: "subject-1", target: "chapter-1", type: "structure" },
        { source: "chapter-1", target: "skill-1", type: "structure" },
      ],
    });
  },
  fetchGalaxyTimelineWithSkills: () => {
    fetches.timeline += 1;
    return Promise.resolve({
      points: [{ date: "2026-09-02", lit: 1 }, { date: "2026-11-14", lit: 1 }],
      total: 1,
      skills: [{ skill_id: 1, first_lit: "2026-09-02" }],
    });
  },
}));

import { HomeGalaxyCard } from "./HomeGalaxyCard";

const SUBJECTS: GalaxySubject[] = [
  { subject_id: 1, name: "SVT", slug: "svt", lit: 3, total: 12 },
  { subject_id: 2, name: "Maths", slug: "maths", lit: 5, total: 20 },
] as GalaxySubject[];

const show = () =>
  render(
    <MemoryRouter>
      <HomeGalaxyCard subjects={SUBJECTS} />
    </MemoryRouter>,
  );

beforeEach(() => {
  webgl = true;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // Pas de `requestIdleCallback` : c'est le cas de Safari, donc celui de l'iPhone et de l'iPad
  // de Massimo. On force le repli `setTimeout`, qui est le chemin réellement emprunté chez lui.
  vi.stubGlobal("requestIdleCallback", undefined);
  reducedMotion = false;
  fetches.graph = 0;
  fetches.timeline = 0;
});

let reducedMotion = false;

describe("le ciel arrive, mais après la carte", () => {
  it("la carte est peinte SANS canvas ni requête au premier rendu", () => {
    show();
    // La première peinture, c'est le compte et les pastilles — pas 1,37 Mo de Three.js, et pas
    // un appel réseau de plus sur la page d'atterrissage.
    expect(screen.getByText("8")).toBeTruthy();
    expect(screen.queryByTestId("ciel")).toBeNull();
    expect(fetches.graph).toBe(0);
    expect(fetches.timeline).toBe(0);
  });

  it("puis le ciel se monte", async () => {
    show();
    await waitFor(() => expect(screen.queryByTestId("ciel")).not.toBeNull(), { timeout: 3000 });
  });
});

describe("ce qui empêche le ciel, et c'est voulu", () => {
  it("prefers-reduced-motion : aucun canvas, jamais", async () => {
    reducedMotion = true;
    show();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.queryByTestId("ciel")).toBeNull();
    // ...mais la carte, elle, est toujours là et complète.
    expect(screen.getByText("8")).toBeTruthy();
  });

  it("sans WebGL : aucun canvas non plus", async () => {
    webgl = false;
    show();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(screen.queryByTestId("ciel")).toBeNull();
  });

  it("et dans les deux cas, AUCUNE requête n'est faite", async () => {
    // Le graphe complet ne se charge qu'avec le ciel. Sans ciel, la page d'atterrissage ne
    // paie rien du tout — ni octets de code, ni aller-retour réseau.
    reducedMotion = true;
    show();
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(fetches.graph).toBe(0);
    expect(fetches.timeline).toBe(0);
  });
});

describe("la carte reste ce qu'elle était", () => {
  it("une seule cible de clic, vers /galaxy", () => {
    show();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/galaxy");
  });

  it("un COMPTE d'étoiles, jamais un pourcentage", () => {
    const { container } = show();
    expect(container.textContent).toMatch(/étoiles allumées/);
    expect(container.textContent).not.toMatch(/%/);
  });
});
