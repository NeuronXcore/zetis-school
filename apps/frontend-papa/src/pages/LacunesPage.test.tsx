import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OpenGap } from "@zetis/types";
import { LacunesPage } from "./LacunesPage";

// Page Lacunes — la surface de DÉCISION vers laquelle le dashboard renvoie.
//
// L'enjeu des tests : elle doit SÉPARER deux situations que le backend distingue et que la page
// mockée confondait — une notion découverte et jamais travaillée (consolidation) d'une notion
// revenue par la révision après un « à revoir ». Les proposer au même geste enverrait Papa sur un
// générateur qui ne la reprendra pas.

vi.mock("../lib/activity", () => ({ fetchOpenGaps: vi.fn() }));
vi.mock("../lib/missionsPilotage", () => ({
  generateRemediation: vi.fn(),
  generateRevision: vi.fn(),
  notifyPendingChanged: vi.fn(),
}));

import { fetchOpenGaps } from "../lib/activity";
import { generateRemediation, generateRevision } from "../lib/missionsPilotage";

function gap(overrides: Partial<OpenGap> = {}): OpenGap {
  return {
    skill_id: 1,
    skill_name: "Comparaison de relatifs",
    subject_slug: "mathematiques",
    subject_name: "Mathématiques",
    severity: "high",
    status: "open",
    first_detected_at: "2026-07-12T10:00:00+02:00",
    has_active_mission: false,
    ...overrides,
  };
}

function renderPage() {
  render(
    <MemoryRouter>
      <LacunesPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchOpenGaps).mockReset().mockResolvedValue([]);
  vi.mocked(generateRemediation).mockReset().mockResolvedValue({ created: 1 });
  vi.mocked(generateRevision).mockReset().mockResolvedValue({ created: 1 });
});

describe("séparation des deux situations", () => {
  it("distingue « jamais travaillée » de « revenue par la révision »", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 1, status: "open" }),
      gap({ skill_id: 2, skill_name: "Temps du récit", status: "in_progress" }),
    ]);
    renderPage();

    const decouvertes = (await screen.findByText(/Découvertes, jamais travaillées/)).closest("section");
    const revenues = screen.getByText(/Revenues par la révision/).closest("section");

    expect(within(decouvertes as HTMLElement).getByText(/Comparaison de relatifs/)).toBeInTheDocument();
    expect(within(revenues as HTMLElement).getByText(/Temps du récit/)).toBeInTheDocument();
  });

  it("propose le générateur QUI CORRESPOND à chaque situation", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([
      gap({ skill_id: 2, skill_name: "Temps du récit", status: "in_progress" }),
    ]);
    renderPage();
    await screen.findByText(/Revenues par la révision/);

    // Une notion `in_progress` ne doit JAMAIS mener au générateur de consolidation : il ne la
    // reprendrait pas, et Papa croirait avoir agi.
    expect(screen.queryByText(/mission de consolidation/)).toBeNull();
    expect(screen.getByRole("button", { name: /missions de révision dues/ })).toBeInTheDocument();
  });

  it("range à part ce qu'une mission active couvre déjà", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap({ has_active_mission: true })]);
    renderPage();

    const section = (await screen.findByText(/Déjà prises en charge/)).closest("section");
    expect(within(section as HTMLElement).getByText(/Comparaison de relatifs/)).toBeInTheDocument();
    // Rien à décider : aucun bouton de génération sur cette section.
    expect(within(section as HTMLElement).queryByRole("button")).toBeNull();
  });
});

describe("création", () => {
  it("ne crée qu'après confirmation, puis relit la liste", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap()]);
    renderPage();
    await screen.findByText(/Découvertes, jamais travaillées/);

    fireEvent.click(screen.getByRole("button", { name: /mission de consolidation/ }));
    expect(generateRemediation).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(generateRemediation).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchOpenGaps).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/en attente de ta validation/)).toBeInTheDocument();
  });

  it("dit clairement quand il n'y avait rien à créer", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap()]);
    vi.mocked(generateRemediation).mockResolvedValue({ created: 0 });
    renderPage();
    await screen.findByText(/Découvertes, jamais travaillées/);

    fireEvent.click(screen.getByRole("button", { name: /mission de consolidation/ }));
    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    expect(await screen.findByText(/Aucune mission à créer/)).toBeInTheDocument();
  });
});

describe("états", () => {
  it("état vide : aucune notion à renforcer", async () => {
    renderPage();
    expect(await screen.findByText(/Rien à renforcer pour le moment/)).toBeInTheDocument();
  });

  it("erreur : bandeau + Réessayer, aucune liste inventée", async () => {
    vi.mocked(fetchOpenGaps).mockRejectedValue(new Error("backend éteint"));
    renderPage();

    expect(await screen.findByText("backend éteint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
    expect(screen.queryByText(/Découvertes/)).toBeNull();
  });
});
