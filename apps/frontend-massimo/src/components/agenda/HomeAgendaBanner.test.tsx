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

  it("ne marque PAS l'agenda vu — le regard vit à /agenda seul (adr-0025-addendum-le-regard-vit-a-l-agenda)", async () => {
    // ~~« marque l'agenda vu — le rendu du bandeau EST un regard (addendum §12.3) »~~ — INVERSÉ le
    // 2026-08-15. L'ancienne raison est gardée barrée, pas effacée : le §12.3 argumentait ses deux
    // surfaces (« n'en retenir qu'une ferait mentir le badge sur ce qu'il a déjà lu »), et un test
    // inversé qui ne dit pas pourquoi est un test perdu.
    //
    // Ce que le §12.3 n'avait pas mesuré : l'Accueil est la page d'atterrissage, donc le témoin
    // était éteint avant d'avoir été vu — il n'a jamais existé pour personne. Et le bandeau ne
    // montre qu'un EXTRAIT (aujourd'hui/demain + à-venir tronqué), pas ce qui est arrivé : il
    // marquait donc vu ce que Massimo n'avait pas pu lire.
    fetchAgendaUpcoming.mockResolvedValue([upcomingItem()]);
    renderBanner();
    await waitFor(() => expect(screen.getByText("Contrôle de maths")).toBeInTheDocument());
    expect(markAgendaSeen).not.toHaveBeenCalled();
  });

  it("reste affiché si « ce qui arrive » échoue", async () => {
    // Échec silencieux : aucun message technique à l'écran de l'enfant.
    fetchAgendaUpcoming.mockRejectedValue(new Error("réseau"));
    renderBanner();
    await waitFor(() => expect(screen.getByText("Mon agenda")).toBeInTheDocument());
    expect(screen.queryByText("À préparer")).toBeNull();
  });
});
