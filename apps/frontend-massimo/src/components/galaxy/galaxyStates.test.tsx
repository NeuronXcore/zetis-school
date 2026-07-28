import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { GalaxyEdge, GalaxyNode, GalaxyStatus } from "@zetis/types";
import {
  GALAXY_MAX_NODES,
  GalaxyFallbackList,
  GalaxyLegend,
  STATUS_ORDER,
  maxNodesFor,
  starStyle,
} from "@zetis/ui/galaxy";

// Un rouge, au sens large : tout ce qui dirait « échec » à un enfant.
function isReddish(hex: string): boolean {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return r > 150 && r > g * 1.6 && r > b * 1.6;
}

describe("états lumineux", () => {
  it("les cinq états ont des apparences distinctes", () => {
    const colors = STATUS_ORDER.map((s) => starStyle(s).color);
    expect(new Set(colors).size).toBe(5);
    const sizes = STATUS_ORDER.map((s) => starStyle(s).size);
    expect(new Set(sizes).size).toBe(5);
  });

  it("AUCUN état n'est rouge — une notion non vue n'est pas un échec", () => {
    for (const status of STATUS_ORDER) {
      expect(isReddish(starStyle(status).color)).toBe(false);
    }
  });

  it("un statut inattendu retombe sur « À découvrir » sans planter", () => {
    expect(starStyle("in_progress" as GalaxyStatus).label).toBe(starStyle("unknown").label);
    expect(starStyle(null).label).toBe("À découvrir");
  });

  it("la légende montre les cinq libellés enfant, sans pourcentage", () => {
    const { container } = render(<GalaxyLegend />);
    for (const label of ["À découvrir", "On commence", "En construction", "Bien acquis", "Maîtrisé"])
      expect(screen.getByText(label)).toBeTruthy();
    expect(container.textContent).not.toMatch(/%/);
  });
});

describe("KPI cliquables", () => {
  const counts = { unknown: 9, weak: 1, learning: 2, solid: 4, mastered: 0 };

  it("affiche un COMPTE par état, jamais un pourcentage", () => {
    const { container } = render(<GalaxyLegend counts={counts} onToggle={() => {}} />);
    expect(screen.getByText("· 4")).toBeTruthy();
    expect(container.textContent).not.toMatch(/%/);
  });

  it("marque l'état actif via aria-pressed", () => {
    render(<GalaxyLegend counts={counts} active="solid" onToggle={() => {}} />);
    const actif = screen.getByRole("button", { pressed: true });
    expect(actif.textContent).toContain("Bien acquis");
  });

  it("remonte l'état cliqué", () => {
    const vus: string[] = [];
    render(<GalaxyLegend counts={counts} onToggle={(s) => vus.push(s)} />);
    fireEvent.click(screen.getByRole("button", { name: /Bien acquis/ }));
    expect(vus).toEqual(["solid"]);
  });

  it("n'offre pas de filtre sur un état sans aucune étoile — il ne montrerait rien", () => {
    render(<GalaxyLegend counts={counts} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /Maîtrisé/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /Bien acquis/ }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("reste purement informative sans callback", () => {
    render(<GalaxyLegend counts={counts} />);
    expect(
      screen.getAllByRole("button").every((b) => b.hasAttribute("disabled")),
    ).toBe(true);
  });
});

describe("plafond adaptatif de nœuds", () => {
  it("suit la classe d'appareil — Massimo a trois postes, pas un", () => {
    expect(maxNodesFor(390)).toBe(GALAXY_MAX_NODES.compact); // iPhone
    expect(maxNodesFor(768)).toBe(GALAXY_MAX_NODES.tablet); // iPad
    expect(maxNodesFor(1440)).toBe(GALAXY_MAX_NODES.desktop); // MacBook
    expect(GALAXY_MAX_NODES.compact).toBeLessThan(GALAXY_MAX_NODES.desktop);
  });
});

describe("repli sans WebGL", () => {
  const nodes: GalaxyNode[] = [
    { id: "chapter-1", kind: "chapter", label: "La cellule", chapter_id: 1 },
    {
      id: "skill-7",
      kind: "skill",
      label: "Mitose",
      skill_id: 7,
      chapter_id: 1,
      status: "solid",
      intensity: 78,
    },
  ];
  const edges: GalaxyEdge[] = [{ source: "chapter-1", target: "skill-7", type: "structure" }];

  it("liste les notions par chapitre avec leur état — la progression reste accessible", () => {
    render(<GalaxyFallbackList nodes={nodes} edges={edges} />);
    expect(screen.getByText("La cellule")).toBeTruthy();
    expect(screen.getByText("Mitose")).toBeTruthy();
    expect(screen.getByLabelText("Mitose — Bien acquis")).toBeTruthy();
  });

  it("n'affiche aucun pourcentage bien qu'`intensity` soit fourni", () => {
    const { container } = render(<GalaxyFallbackList nodes={nodes} edges={edges} />);
    expect(container.textContent).not.toMatch(/%|78/);
  });

  it("applique le MÊME filtre que le canvas — la parité d'accès n'est pas optionnelle", () => {
    const avecEteinte: GalaxyNode[] = [
      ...nodes,
      { id: "skill-8", kind: "skill", label: "Noyau", skill_id: 8, chapter_id: 1, status: "unknown" },
    ];
    const avecLien: GalaxyEdge[] = [
      ...edges,
      { source: "chapter-1", target: "skill-8", type: "structure" },
    ];
    render(
      <GalaxyFallbackList nodes={avecEteinte} edges={avecLien} highlightStatus="solid" />,
    );
    // Rien n'est retiré : les deux notions restent lisibles, seule l'emphase change.
    expect(screen.getByText("Mitose")).toBeTruthy();
    expect(screen.getByText("Noyau")).toBeTruthy();
    const eteinte = screen.getByLabelText("Noyau — À découvrir");
    const allumee = screen.getByLabelText("Mitose — Bien acquis");
    expect(eteinte.className).toContain("opacity-35");
    expect(allumee.className).not.toContain("opacity-35");
  });
});
