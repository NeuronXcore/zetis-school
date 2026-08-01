import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAgendaItems = vi.fn();
const fetchAgendaUpcoming = vi.fn();
const markAgendaSeen = vi.fn();

vi.mock("../../lib/agenda", () => ({
  fetchAgendaItems: (...args: unknown[]) => fetchAgendaItems(...args),
  fetchAgendaUpcoming: () => fetchAgendaUpcoming(),
  markAgendaSeen: () => markAgendaSeen(),
}));

import { HomeAgendaBanner } from "./HomeAgendaBanner";

function upcomingItem(overrides = {}) {
  return {
    id: 1,
    label: "Contrôle de maths",
    subject: null,
    due_on: "2026-08-06",
    days_left: 5,
    has_plan: false,
    ...overrides,
  };
}

beforeEach(() => {
  fetchAgendaItems.mockReset().mockResolvedValue([]);
  fetchAgendaUpcoming.mockReset().mockResolvedValue([]);
  markAgendaSeen.mockReset().mockResolvedValue(undefined);
});

function renderBanner() {
  return render(
    <MemoryRouter>
      <HomeAgendaBanner />
    </MemoryRouter>,
  );
}

describe("HomeAgendaBanner — « À préparer »", () => {
  it("montre l'échéance à venir AVEC sa date, même sans rien aujourd'hui ni demain", async () => {
    // Le cas qui a motivé la section : un contrôle jeudi était invisible depuis l'Accueil
    // jusqu'à mercredi. Un badge n'aurait pas pu y répondre — c'est un nombre sans date.
    fetchAgendaUpcoming.mockResolvedValue([upcomingItem()]);
    renderBanner();

    await waitFor(() => expect(screen.getByText("À préparer")).toBeInTheDocument());
    expect(screen.getByText("Contrôle de maths")).toBeInTheDocument();
    expect(screen.getByText(/dans 5 jours/)).toBeInTheDocument();
  });

  it("ne s'allonge jamais : deux échéances au maximum sur l'Accueil", async () => {
    // Une section qui grossit redevient la liste de dette que l'ADR-0025 §6 refuse d'afficher.
    fetchAgendaUpcoming.mockResolvedValue([
      upcomingItem({ id: 1, label: "Contrôle de maths" }),
      upcomingItem({ id: 2, label: "Exposé anglais" }),
      upcomingItem({ id: 3, label: "DM de SVT" }),
      upcomingItem({ id: 4, label: "Poésie" }),
    ]);
    renderBanner();

    await waitFor(() => expect(screen.getByText("Contrôle de maths")).toBeInTheDocument());
    expect(screen.getByText("Exposé anglais")).toBeInTheDocument();
    expect(screen.queryByText("DM de SVT")).toBeNull();
    expect(screen.queryByText(/et \d+ autres?/)).toBeNull();
  });

  it("garde l'état calme quand il n'y a vraiment rien", async () => {
    renderBanner();
    await waitFor(() =>
      expect(screen.getByText(/Rien de noté pour aujourd'hui ni demain/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("À préparer")).toBeNull();
    // Jamais « ajoute tes devoirs » : en phase 0 Massimo ne le peut pas (ADR-0025 §10).
    expect(screen.queryByText(/ajoute/i)).toBeNull();
  });

  it("marque l'agenda vu — le rendu du bandeau EST un regard (addendum §12.3)", async () => {
    fetchAgendaUpcoming.mockResolvedValue([upcomingItem()]);
    renderBanner();
    await waitFor(() => expect(markAgendaSeen).toHaveBeenCalled());
  });

  it("reste affiché si « ce qui arrive » échoue", async () => {
    // Échec silencieux : aucun message technique à l'écran de l'enfant.
    fetchAgendaUpcoming.mockRejectedValue(new Error("réseau"));
    renderBanner();
    await waitFor(() => expect(screen.getByText("Mon agenda")).toBeInTheDocument());
    expect(screen.queryByText("À préparer")).toBeNull();
  });
});
