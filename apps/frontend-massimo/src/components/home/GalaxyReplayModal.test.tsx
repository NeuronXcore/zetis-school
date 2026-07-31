import { act, render, screen, waitFor } from "@testing-library/react";
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

// jsdom n'a pas de contexte WebGL : sans ce mock, la modale rend son repli « il faut un écran
// qui sait dessiner en 3D » et le canvas n'est jamais monté. Tout le reste est le vrai module —
// horloge de rang et arbre radial compris.
vi.mock("@zetis/ui/galaxy", async (actual) => ({
  ...((await actual()) as object),
  hasWebGL: () => true,
}));

// Le canvas tire Three.js : hors sujet ici, et impossible à monter sous jsdom. On enregistre
// au passage les tableaux de nœuds reçus — c'est ce qui permet de vérifier qu'on ne réassigne
// pas les données à chaque image.
const received: unknown[] = [];
vi.mock("@zetis/ui/galaxy/canvas", () => ({
  GalaxyCanvas: ({ nodes }: { nodes: unknown }) => {
    received.push(nodes);
    return <div data-testid="canvas" />;
  },
}));

import { GalaxyReplayModal } from "./GalaxyReplayModal";

beforeEach(() => {
  received.length = 0;
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});

describe("les données ne sont réassignées qu'aux NAISSANCES", () => {
  // ⚠️ Test-verrou d'une régression réelle. Le rejeu se recalculait sur `elapsed`, qui avance à
  // chaque image : le graphe était réassigné 60 fois par seconde, et `three-forcegraph` fait
  // `stop().alpha(1)` à chaque assignation. Résultat : le graphe se réinitialisait en boucle et
  // ne s'affichait jamais. Rien ne le voyait — d'où ce test.
  //
  // Le temps est piloté à la main : `requestAnimationFrame` n'avance pas tout seul ici, et un
  // test qui dort n'aurait prouvé qu'une chose — que rien ne s'était passé.
  it("le canvas reçoit le MÊME tableau de nœuds entre deux étoiles", async () => {
    const frames: FrameRequestCallback[] = [];
    let now = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    render(<GalaxyReplayModal onClose={() => {}} />);
    await waitFor(() => expect(received.length).toBeGreaterThan(0));

    // ~25 images de 16 ms : deux notions naissent (cadence 120 ms), donc quelques paliers.
    for (let i = 0; i < 25; i += 1) {
      now += 16;
      const pending = frames.splice(0, frames.length);
      await act(async () => {
        for (const frame of pending) frame(now);
      });
    }

    const distinct = new Set(received).size;
    // Plusieurs rendus ont bien eu lieu — sans quoi le test passerait pour rien.
    expect(received.length).toBeGreaterThan(10);
    // ...mais très peu de tableaux DISTINCTS : un par naissance, pas un par image.
    expect(distinct).toBeLessThanOrEqual(6);
    expect(received.length).toBeGreaterThan(distinct * 2);
  });
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
