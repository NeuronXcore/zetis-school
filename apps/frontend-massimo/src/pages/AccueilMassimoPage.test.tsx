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

/** `AAAA-MM-JJ` d'il y a N jours, en heure locale — la grille dépend d'« aujourd'hui », donc la
 *  fixture ne doit pas dépendre de l'horloge de la machine (une date figée dans le futur serait
 *  ignorée par `buildSparseCalendar`, et le test deviendrait flaky au fil du temps). */
function ilYA(jours: number): string {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const XP_HISTORY = {
  days: [
    { date: ilYA(9), xp: 60 },
    { date: ilYA(4), xp: 25 },
    { date: ilYA(0), xp: 120 },
  ],
};

/** Les cases du calendrier — une par jour qui a eu lieu.
 *
 * On sélectionne sur `data-day` et NON sur le style : le navigateur normalise
 * `gridColumn`/`gridRow` en `grid-area`, là où jsdom les conserve. Un sélecteur de style aurait
 * donc mesuré une chose en test et une autre en vrai. */
function skyCells(): NodeListOf<Element> {
  const sky = screen.getByText("Mon ciel").closest("section") as HTMLElement;
  return sky.querySelectorAll("[data-day]");
}

const GAMIFICATION = {
  total_xp: 205,
  level: 3,
  xp_into_level: 5,
  xp_for_next: 100,
  regularity: null,
  badges: [{ code: "explainer", label: "10 notions acquises", icon: "🌟" }],
  recent: [
    { amount: 60, reason: "mission_remediation", created_at: "2026-07-31T10:00:00Z" },
    { amount: 25, reason: "mission_champion", created_at: "2026-07-29T10:00:00Z" },
  ],
};

function state(over: Record<string, unknown> = {}) {
  return {
    welcome: null,
    today: ELECTED,
    reviews: REVIEWS,
    capsules: { total: 4, seen_count: 1, new_count: 3, view_count: 1 },
    subjects: SUBJECTS,
    xpHistory: XP_HISTORY,
    timeline: { points: [{ date: "2026-07-01", lit: 2 }, { date: "2026-07-31", lit: 47 }], total: 47 },
    gamification: GAMIFICATION,
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
    // Cible l'aria-label de la carte plutôt que le texte « 0 » : depuis que les pastilles de
    // matières portent LEUR compte, plusieurs « 0 » coexistent légitimement à l'écran.
    expect(screen.getByLabelText(/Ma galaxie : 0 étoiles allumées/)).toBeTruthy();
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

describe("Accueil — « Mon ciel » et les derniers gains", () => {
  it("ne dessine AUCUNE case vide — le pendant du test WeekDots, sur un calendrier", () => {
    // LE test-verrou de ce chantier, et le seul qui distingue « Mon ciel » d'une heatmap.
    // La série couvre 10 jours mais n'en porte que 3 : la grille doit contenir exactement
    // 3 cases. S'il y en avait 10 — ou 7 par semaine — c'est qu'un jour sans gain aurait été
    // reconstruit, et la carte serait redevenue un décompte de jours manqués.
    renderPage();
    expect(skyCells()).toHaveLength(XP_HISTORY.days.length);
  });

  it("porte quand même un repère temporel : les mois sont libellés", () => {
    // C'est ce qui en fait un calendrier et non un damier — le point de la demande.
    renderPage();
    const sky = screen.getByText("Mon ciel").closest("section") as HTMLElement;
    expect(sky.textContent).toMatch(/janv\.|févr\.|mars|avr\.|mai|juin|juil\.|août|sept\.|oct\.|nov\.|déc\./);
  });

  it("annonce un COMPTE qui ne peut que monter, jamais un manque", () => {
    renderPage();
    const sky = screen.getByText("Mon ciel").closest("section") as HTMLElement;
    expect(sky.textContent).toContain("3");
    expect(sky.textContent).toMatch(/jours d'apprentissage/);
    expect(sky.textContent).not.toMatch(/%|raté|manqué|perdu|restant|série|depuis \d+ jours/i);
  });

  it("n'affiche AUCUNE date : ni sous une étoile, ni dans les gains", () => {
    // Une date rendrait le temps lisible, et donc les intervalles vides avec lui.
    renderPage();
    expect(document.body.textContent).not.toMatch(/2026-07-\d\d/);
    expect(document.body.textContent).not.toMatch(/il y a \d+ jour/i);
  });

  it("traduit chaque raison d'XP — jamais un identifiant brut à l'écran", () => {
    renderPage();
    expect(screen.getByText("Mission terminée")).toBeTruthy();
    expect(screen.getByText("Défi champion relevé")).toBeTruthy();
    expect(document.body.textContent).not.toContain("mission_champion");
  });

  it("ces blocs n'ajoutent AUCUNE action accentuée", () => {
    // Ce qui est ajouté se regarde. La règle d'or de la page tient toujours.
    renderPage();
    expect(accentedActions()).toHaveLength(1);
  });

  it("un ciel vide ne rend pas la carte — ce n'est pas un état d'erreur", () => {
    accueil.value = state({ xpHistory: { days: [] } });
    renderPage();
    expect(screen.queryByText("Mon ciel")).toBeNull();
    expect(document.body.textContent).not.toMatch(/erreur|impossible|réessay/i);
  });
});

describe("Accueil — rejeu animé de la galaxie (ADR-0029)", () => {
  it("propose « Revoir ma galaxie grandir » depuis « Mon ciel »", () => {
    renderPage();
    expect(screen.getByText(/Revoir ma galaxie grandir/)).toBeTruthy();
  });

  it("ne monte PAS la modale au chargement — c'est ce qui garde l'Accueil sans Three.js", () => {
    // LE test qui protège le budget de bundle sur ce chantier. `accueil.bundle.test.ts` ne
    // parcourt que les imports STATIQUES : il ne voit donc pas la modale (c'est correct, elle
    // est en `lazy()`). Ce qu'il ne peut pas voir, c'est un montage au premier rendu — qui
    // déclencherait le chargement du chunk 3D exactement comme le 2026-07-28.
    renderPage();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("le rejeu n'ajoute AUCUNE action accentuée : « Commencer » reste la seule", () => {
    renderPage();
    const accented = accentedActions();
    expect(accented).toHaveLength(1);
    expect(accented[0].textContent).toContain("Commencer");
  });

  it("sans jour de gain, ni le ciel ni son action ne sont proposés", () => {
    accueil.value = state({ xpHistory: { days: [] } });
    renderPage();
    expect(screen.queryByText(/Revoir ma galaxie grandir/)).toBeNull();
  });
});
