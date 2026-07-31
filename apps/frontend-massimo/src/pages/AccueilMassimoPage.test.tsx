import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { GalaxySubject, MissionTodayResponse, ReviewsSummary } from "@zetis/types";

// Composition de l'Accueil (addendum ADR-0024 slice B, spec `docs/frontend-massimo/page-accueil.md`).
//
// Ces tests protègent des règles de tenue, pas une mise en page : une seule action accentuée,
// aucun compteur de retard, et un état sans mission qui reste serein au lieu de se faire
// compenser par un bouton posé ailleurs.

vi.mock("@zetis/auth", async (orig) => ({
  ...(await orig<typeof import("@zetis/auth")>()),
  useAuth: () => ({ user: { username: "massimo" } }),
}));

vi.mock("../components/agenda/HomeAgendaBanner", () => ({
  HomeAgendaBanner: () => <div>bandeau-agenda</div>,
}));

vi.mock("../hooks/useMotivationWeek", () => ({
  useMotivationWeek: () => ({ week: null, pending: false, notice: null, chooseGoal: vi.fn() }),
}));

const accueil = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock("../hooks/useAccueil", () => ({ useAccueil: () => accueil.value }));

import { AccueilMassimoPage } from "./AccueilMassimoPage";

const ELECTED: MissionTodayResponse = {
  elected: {
    id: 7,
    subject: "Français",
    skill_id: 12,
    skill_name: "Les temps du récit",
    title: "Les temps du récit",
    description: null,
    mission_type: "revision",
    status: "pending",
    origin: "zetis",
    priority: 1,
    estimated_minutes: 15,
    xp_reward: 60,
    steps: [],
  },
  reason: "Parce que cette notion revient bientôt en révision.",
  reason_code: "srs_due",
  scoring_version: "v3",
  alternatives: [],
};

const REVIEWS: ReviewsSummary = {
  subjects: [],
  total_due: 40,
  flash_size: 5,
  new_count: 0,
};

const SUBJECTS: GalaxySubject[] = [
  { subject_id: 1, name: "Français", slug: "francais", lit: 29, total: 40 },
  { subject_id: 2, name: "SVT", slug: "svt", lit: 18, total: 26 },
];

function state(over: Record<string, unknown> = {}) {
  return {
    welcome: null,
    today: ELECTED,
    reviews: REVIEWS,
    capsules: { total: 4, seen_count: 1, new_count: 3, view_count: 1 },
    subjects: SUBJECTS,
    loading: false,
    refreshWelcome: vi.fn(),
    ...over,
  };
}

/** Les actions accentuées de la page : fond plein `bg-zetis-accent`, jamais une bordure. */
function accentedActions(): Element[] {
  return [...document.querySelectorAll("a, button")].filter((el) =>
    el.className.toString().includes("bg-zetis-accent "),
  );
}

function renderPage() {
  render(
    <MemoryRouter>
      <AccueilMassimoPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  accueil.value = state();
});

describe("Accueil — composition", () => {
  it("affiche `flash_size` et JAMAIS `total_due`", async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText("5 cartes")).toBeTruthy());
    // « 40 cartes en retard » sur l'écran d'accueil est la pression quotidienne anxiogène
    // qu'interdit CLAUDE.md. Le compteur de retard n'a rien à faire ici.
    expect(document.body.textContent).not.toContain("40");
  });

  it("n'a qu'UNE SEULE action accentuée : « Commencer »", () => {
    renderPage();
    const accented = accentedActions();
    expect(accented).toHaveLength(1);
    expect(accented[0].textContent).toContain("Commencer");
  });

  it("sans mission : aucun bouton plein, et aucun autre bloc n'en gagne un", () => {
    accueil.value = state({ today: { ...ELECTED, elected: null } });
    renderPage();
    // Une page sans action accentuée est un état VALIDE, pas un défaut à compenser.
    expect(accentedActions()).toHaveLength(0);
    expect(screen.getByText("Rien d'obligatoire maintenant")).toBeTruthy();
  });

  it("galaxie à 0 étoile : la carte s'affiche avec son compte à zéro, ce n'est pas un état vide", () => {
    accueil.value = state({
      subjects: [{ subject_id: 1, name: "Français", slug: "francais", lit: 0, total: 40 }],
    });
    renderPage();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText(/Ta galaxie t'attend/)).toBeTruthy();
    // Une galaxie qui n'a pas encore commencé est le point de départ normal : pas d'erreur.
    expect(document.body.textContent).not.toMatch(/erreur|impossible|réessay/i);
  });

  it("un raccourci sans contenu n'est PAS rendu (pas de carte grisée ici)", () => {
    accueil.value = state({
      reviews: { ...REVIEWS, flash_size: 0 },
      capsules: { total: 0, seen_count: 0, new_count: 0, view_count: 0 },
    });
    renderPage();
    expect(screen.queryByText("Révision éclair")).toBeNull();
    expect(screen.queryByText("Capsule IA")).toBeNull();
    // ELI5 ne dépend d'aucun contenu préexistant : elle reste toujours proposée.
    expect(screen.getByText("ELI5")).toBeTruthy();
  });

  it("garde le bandeau Agenda — seul accès à /agenda en phase 0 (ADR-0025)", () => {
    renderPage();
    expect(screen.getByText("bandeau-agenda")).toBeTruthy();
  });

  it("ne rend PAS le héros ZETIS tant que le chat n'existe pas sur cette page", () => {
    renderPage();
    // Une porte vers du vide est pire que pas de porte : le slot est structuré, non rendu.
    expect(screen.queryByText(/Discuter avec ZETIS/)).toBeNull();
  });
});
