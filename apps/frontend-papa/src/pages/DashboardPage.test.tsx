import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardPayload, DashboardSubject } from "@zetis/types";
import { DashboardPage } from "./DashboardPage";

// Dashboard Papa (ADR-0028).
//
// LE test de ce chantier est `test_aucune_requete_sur_un_geste_de_filtrage` : tout le design —
// agrégat unique, trois fenêtres préchargées, séries par matière — n'existe que pour ça. S'il
// tombe, la page a beau s'afficher correctement, elle n'est plus un cockpit.

vi.mock("../lib/dashboard", () => ({ fetchDashboard: vi.fn() }));
vi.mock("../components/BackendStatus", () => ({ BackendStatus: () => null }));

import { fetchDashboard } from "../lib/dashboard";

function subject(overrides: Partial<DashboardSubject> = {}): DashboardSubject {
  const zeros = () => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0));
  return {
    id: 1,
    slug: "maths",
    name: "Mathématiques",
    color: "#60a5fa",
    minutes: { "7": 65, "30": 255, "90": 690 },
    calendar: [{ date: "2026-07-28", active_minutes: 42 }],
    slots: { "7": zeros(), "30": zeros(), "90": zeros() },
    slots_outside_minutes: { "7": 0, "30": 0, "90": 0 },
    notions: { consolidated: 4, fragile: 3, in_progress: 2, total: 13 },
    series: {
      "7": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
      "30": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
      "90": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
    },
    review_load: Array.from({ length: 14 }, () => 2),
    gaps_open: 1,
    has_referentiel: true,
    ...overrides,
  };
}

const period = (minutes: number) => ({
  kpis: {
    active_minutes: { value: minutes, delta: 5 },
    active_days: { value: 4, of: 7, delta: 1 },
    consolidated: { value: 4, of: 13, delta: 2 },
    open_gaps: { value: 1, delta: 0, without_mission: 1 },
  },
  sparks: {
    active_minutes: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    active_days: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    consolidated: [0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4],
    open_gaps: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
});

const PAYLOAD: DashboardPayload = {
  school_year: { level: "4e", label: "2025-2026", program_version: null },
  generated_at: "2026-07-29T08:12:00+02:00",
  last_activity_at: "2026-07-28T18:40:00+02:00",
  days_inactive: 0,
  inbox: [
    {
      kind: "validation",
      count: 6,
      label: "6 contenus en attente de relecture",
      detail: "4 leçons · 2 fiches",
      href: "/couverture",
    },
  ],
  unattributed_minutes: { "7": 107, "30": 450, "90": 1200 },
  periods: { "7": period(200), "30": period(825), "90": period(2210) },
  subjects: [subject(), subject({ id: 2, slug: "svt", name: "SVT", minutes: { "7": 28, "30": 120, "90": 320 } })],
  content_chain: [
    { stage: "cours_valides", label: "Cours validés", value: 30, target: 38 },
    { stage: "fiches", label: "Fiches", value: 22, target: 30 },
  ],
  reading: [
    {
      trend: "watch",
      text: "Mathématiques : 3 notions à renforcer",
      evidence: { count: 3, kind: "notion", href: "/lacunes?subject=maths" },
    },
  ],
  proposed_mission: null,
};

function renderPage(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <DashboardPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(fetchDashboard).mockReset().mockResolvedValue(PAYLOAD);
});

describe("agrégat unique", () => {
  it("ne déclenche AUCUNE requête sur un geste de filtrage", async () => {
    renderPage();
    await screen.findByText("6 contenus en attente de relecture");
    expect(fetchDashboard).toHaveBeenCalledTimes(1);

    // Période, matière, focus : trois gestes, trois projections, zéro réseau.
    // La matière est cliquée sur la PASTILLE (`SubjectFilterChips` rend un `role="group"`) :
    // « Mathématiques » apparaît aussi dans la légende du donut et dans les barres empilées,
    // qui sont trois points d'entrée équivalents vers le même `setSubject`.
    fireEvent.click(screen.getByRole("button", { name: "30 jours" }));
    fireEvent.click(within(screen.getByRole("group")).getByRole("button", { name: /Mathématiques/ }));
    fireEvent.click(screen.getByRole("button", { name: /Temps actif/ }));

    expect(fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("change les KPI affichés quand on change de période, sans recharger", async () => {
    renderPage();
    // On cible le KPI : « 3h20 » apparaît AUSSI au centre du donut, et c'est voulu — les deux
    // doivent afficher le même temps (cf. le test de cohérence ci-dessous).
    const kpi = await screen.findByRole("button", { name: /Temps actif/ });
    expect(kpi).toHaveTextContent("3h20"); // 200 min sur 7 jours

    fireEvent.click(screen.getByRole("button", { name: "30 jours" }));

    await waitFor(() => expect(kpi).toHaveTextContent("13h45")); // 825 min sur 30 jours
    expect(fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("le donut totalise le MÊME temps que le KPI, part « hors matière » comprise", async () => {
    // Sans la part « hors matière », le donut affichait 93 min à côté d'un KPI annonçant 3h20 :
    // deux chiffres du même écran qui se contredisent. Constaté au premier rendu réel.
    renderPage();
    const kpi = await screen.findByRole("button", { name: /Temps actif/ });

    expect(kpi).toHaveTextContent("3h20");
    // 65 (maths) + 28 (svt) + 107 (hors matière) = 200 min = 3h20.
    const donut = screen.getByLabelText("Répartition du temps actif par matière");
    expect(donut.closest("section")).toHaveTextContent("3h20");
    expect(screen.getByText("Hors matière")).toBeInTheDocument();
  });
});

describe("KPI actifs", () => {
  it("expose aria-pressed et bascule au second clic", async () => {
    renderPage();
    const kpi = await screen.findByRole("button", { name: /Temps actif/ });

    expect(kpi).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(kpi);
    await waitFor(() => expect(kpi).toHaveAttribute("aria-pressed", "true"));
    fireEvent.click(kpi);
    await waitFor(() => expect(kpi).toHaveAttribute("aria-pressed", "false"));
  });

  it("n'affiche PAS l'XP : il reste sur Progression (ADR-0028 §5)", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Temps actif/ });

    expect(screen.queryByText(/XP/)).toBeNull();
    expect(screen.queryByText(/Sessions/)).toBeNull();
  });
});

describe("état de l'URL", () => {
  it("restaure période, matière et focus depuis les query params", async () => {
    renderPage("/?period=90&subject=svt&focus=open_gaps");
    await screen.findByRole("button", { name: /Temps actif/ });

    expect(screen.getByRole("button", { name: "Trimestre" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // « Lacunes ouvertes » (lignes `Gap`) et non « notions à renforcer » : ce dernier libellé
    // désigne les notions au statut fragile, une AUTRE mesure, affichée sur les cartes voisines.
    expect(screen.getByRole("button", { name: /Lacunes ouvertes/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("un slug de matière inconnu retombe sur « toutes » au lieu de vider la page", async () => {
    renderPage("/?subject=matiere-supprimee");
    await screen.findByRole("button", { name: /Temps actif/ });

    // Les deux matières restent tracées dans « État des notions ».
    expect(screen.getAllByText("Mathématiques").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SVT").length).toBeGreaterThan(0);
  });
});

describe("file « À décider »", () => {
  it("affiche l'état vide comme un état NORMAL, sans félicitation", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue({ ...PAYLOAD, inbox: [] });
    renderPage();

    expect(await screen.findByText("Quand cette file est vide, il n'y a rien à faire.")).toBeInTheDocument();
  });

  it("groupe par famille : une ligne par kind, jamais une par contenu", async () => {
    renderPage();
    const queue = (await screen.findByText("À décider")).closest("section");

    expect(queue).not.toBeNull();
    expect(within(queue as HTMLElement).getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("erreur", () => {
  it("ne rend RIEN de partiel et propose de réessayer", async () => {
    vi.mocked(fetchDashboard).mockRejectedValue(new Error("backend éteint"));
    renderPage();

    expect(await screen.findByText("backend éteint")).toBeInTheDocument();
    // Des cartes vides se liraient comme des zéros mesurés.
    expect(screen.queryByText("À décider")).toBeNull();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});
