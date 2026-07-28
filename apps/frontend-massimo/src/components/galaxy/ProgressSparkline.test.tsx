import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GalaxyTimeline } from "@zetis/types";
import { ProgressSparkline } from "./ProgressSparkline";

const timeline: GalaxyTimeline = {
  points: [
    { date: "2026-07-01", lit: 2 },
    { date: "2026-07-08", lit: 5 },
    { date: "2026-07-15", lit: 9 },
  ],
  total: 9,
};

describe("frise de progression", () => {
  it("trace une courbe qui MONTE — jamais un recul", () => {
    const { container } = render(<ProgressSparkline timeline={timeline} />);
    const polyline = container.querySelector("polyline")!;
    const ys = polyline
      .getAttribute("points")!
      .split(" ")
      .map((p) => Number(p.split(",")[1]));
    // En SVG, l'axe Y descend : une courbe croissante a des Y DÉCROISSANTS.
    expect(ys).toEqual([...ys].sort((a, b) => b - a));
  });

  it("n'affiche ni pourcentage ni échéance — c'est un chemin, pas un tableau de bord", () => {
    const { container } = render(<ProgressSparkline timeline={timeline} />);
    expect(container.textContent).not.toMatch(/%|objectif|retard|reste/i);
  });

  it("annonce la progression aux lecteurs d'écran", () => {
    render(<ProgressSparkline timeline={timeline} />);
    expect(screen.getByLabelText("De 2 à 9 notions explorées")).toBeTruthy();
  });

  it("ne rend rien avec un seul point — une frise à un point ne raconte aucun chemin", () => {
    const { container } = render(
      <ProgressSparkline timeline={{ points: [{ date: "2026-07-01", lit: 1 }], total: 1 }} />,
    );
    expect(container.querySelector("svg")).toBeNull();
  });
});
