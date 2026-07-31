import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { OpenGap } from "@zetis/types";
import { ModeFocusPage } from "./ModeFocusPage";

// Mode focus — la page promettait « ZETIS priorisera les missions, capsules et révisions » et son
// bouton n'écrivait qu'un `useState` local : rien n'était persisté, rien n'était priorisé, et il
// n'existe AUCUN état « focus » côté backend.
//
// Ce qui existe est `Mission.force_priority` (plancher de score du sélecteur, ADR-0018). Ces tests
// verrouillent que le bouton fait bien CETTE chose-là, et rien d'autre.

vi.mock("../lib/activity", () => ({ fetchOpenGaps: vi.fn() }));
vi.mock("../lib/missionsPilotage", () => ({
  commandConfirm: vi.fn(),
  notifyPendingChanged: vi.fn(),
}));

import { fetchOpenGaps } from "../lib/activity";
import { commandConfirm } from "../lib/missionsPilotage";

function gap(overrides: Partial<OpenGap> = {}): OpenGap {
  return {
    skill_id: 7,
    skill_name: "Nombres relatifs",
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
      <ModeFocusPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchOpenGaps).mockReset().mockResolvedValue([gap()]);
  vi.mocked(commandConfirm).mockReset().mockResolvedValue([]);
});

describe("mise en tête", () => {
  it("liste les VRAIES notions, plus le mock", async () => {
    renderPage();
    expect(await screen.findByText(/Nombres relatifs/)).toBeInTheDocument();
    expect(fetchOpenGaps).toHaveBeenCalledTimes(1);
  });

  it("crée une mission PRIORITAIRE sur la notion, après confirmation", async () => {
    renderPage();
    await screen.findByText(/Nombres relatifs/);

    fireEvent.click(screen.getByRole("button", { name: /Mettre en tête/ }));
    // Le premier clic n'écrit rien : il ouvre la confirmation.
    expect(commandConfirm).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole("button", { name: /Mettre en tête/ });
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() =>
      expect(commandConfirm).toHaveBeenCalledWith(
        expect.objectContaining({ skill_ids: [7], force_priority: true }),
      ),
    );
    // La liste est relue : la notion a maintenant une mission active.
    await waitFor(() => expect(fetchOpenGaps).toHaveBeenCalledTimes(2));
  });

  it("accuse réception sans promettre plus que ce que le moteur fait", async () => {
    renderPage();
    await screen.findByText(/Nombres relatifs/);
    fireEvent.click(screen.getByRole("button", { name: /Mettre en tête/ }));
    const buttons = screen.getAllByRole("button", { name: /Mettre en tête/ });
    fireEvent.click(buttons[buttons.length - 1]);

    expect(await screen.findByText(/Notion mise en tête/)).toBeInTheDocument();
    // L'ancienne promesse — capsules et révisions priorisées — n'existait nulle part.
    expect(screen.queryByText(/capsules/i)).toBeNull();
  });

  it("ne propose PAS les notions déjà couvertes par une mission active", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([gap({ has_active_mission: true })]);
    renderPage();

    expect(await screen.findByText(/ferait doublon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mettre en tête/ })).toBeNull();
  });

  it("état vide : aucune notion à cibler", async () => {
    vi.mocked(fetchOpenGaps).mockResolvedValue([]);
    renderPage();
    expect(await screen.findByText(/Aucune notion à cibler/)).toBeInTheDocument();
  });

  it("erreur : bandeau + Réessayer, aucune liste inventée", async () => {
    vi.mocked(fetchOpenGaps).mockRejectedValue(new Error("backend éteint"));
    renderPage();

    expect(await screen.findByText("backend éteint")).toBeInTheDocument();
    expect(screen.queryByText(/Nombres relatifs/)).toBeNull();
  });
});
