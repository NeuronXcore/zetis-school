import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GalaxyFullGraph, GalaxyTimeline } from "@zetis/types";

// Le rejeu est une CROISSANCE, pas une lecture (addendum ADR-0029 §3). Ce qui se teste ici,
// ce sont les INTERDITS — plus de curseur, aucune date — et le fait que la modale ne parle
// jamais d'une période vide.

const GRAPH: GalaxyFullGraph = {
  nodes: [
    { id: "root", kind: "root", label: "ZETIS" },
    { id: "subject-1", kind: "subject", label: "SVT", subject_slug: "svt" },
    { id: "chapter-1", kind: "chapter", label: "La cellule", chapter_id: 1 },
    { id: "skill-1", kind: "skill", label: "Mitose", skill_id: 1, status: "solid" },
    { id: "skill-2", kind: "skill", label: "Méiose", skill_id: 2, status: "weak" },
  ],
  edges: [
    { source: "root", target: "subject-1", type: "structure" },
    { source: "subject-1", target: "chapter-1", type: "structure" },
    { source: "chapter-1", target: "skill-1", type: "structure" },
    { source: "chapter-1", target: "skill-2", type: "structure" },
  ],
} as GalaxyFullGraph;

const TIMELINE: GalaxyTimeline = {
  points: [
    { date: "2026-09-02", lit: 1 },
    { date: "2026-11-14", lit: 2 },
  ],
  total: 2,
  skills: [
    { skill_id: 1, first_lit: "2026-09-02" },
    { skill_id: 2, first_lit: "2026-11-14" },
  ],
} as GalaxyTimeline;

vi.mock("../../lib/galaxy", () => ({
  fetchFullGraph: () => Promise.resolve(GRAPH),
  fetchGalaxyTimelineWithSkills: () => Promise.resolve(TIMELINE),
}));

// Le canvas tire Three.js : hors sujet ici, et impossible à monter sous jsdom.
vi.mock("@zetis/ui/galaxy/canvas", () => ({
  GalaxyCanvas: () => <div data-testid="canvas" />,
}));

import { GalaxyReplayModal } from "./GalaxyReplayModal";

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("la frise est témoin, plus commande", () => {
  it("aucun curseur, aucune barre de lecture", async () => {
    render(<GalaxyReplayModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    // Le curseur `<input type="range">` de la version précédente a disparu avec le §3 réécrit.
    expect(document.querySelector('input[type="range"]')).toBeNull();
    expect(screen.queryByLabelText("Avancer dans le temps")).toBeNull();
  });

  it("un seul bouton, « Revoir » — plus de Lecture/Pause", async () => {
    render(<GalaxyReplayModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Revoir")).toBeTruthy());
    expect(screen.queryByText("Lecture")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
    expect(screen.queryByText("Rejouer")).toBeNull();
  });
});

describe("aucune date, nulle part", () => {
  it("ni jour, ni mois, ni année ne sont rendus", async () => {
    // Interdit du §4 : une date rendrait le temps lisible, et les intervalles vides avec lui.
    const { container } = render(<GalaxyReplayModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(text).not.toMatch(/20\d{2}/);
    expect(text).not.toMatch(/septembre|novembre|janvier/i);
  });
});

describe("le compte d'étoiles", () => {
  it("s'affiche comme un COMPTE, jamais comme un pourcentage", async () => {
    const { container } = render(<GalaxyReplayModal onClose={() => {}} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect(container.textContent).toMatch(/étoiles? allumées?/);
    expect(container.textContent).not.toMatch(/%/);
  });
});
