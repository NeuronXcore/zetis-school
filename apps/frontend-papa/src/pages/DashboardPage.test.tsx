import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DashboardPayload, DashboardSubject } from "@zetis/types";
import { DashboardPage } from "./DashboardPage";

// Dashboard Papa (ADR-0028).
//
// LE test de ce chantier est `test_aucune_requete_sur_un_geste_de_filtrage` : tout le design —
// agrégat unique, quatre fenêtres préchargées, séries par matière — n'existe que pour ça. S'il
// tombe, la page a beau s'afficher correctement, elle n'est plus un cockpit.

vi.mock("../lib/dashboard", () => ({ fetchDashboard: vi.fn() }));
vi.mock("../components/BackendStatus", () => ({ BackendStatus: () => null }));
vi.mock("../lib/missionsPilotage", () => ({
  generateRemediation: vi.fn(),
  notifyPendingChanged: vi.fn(),
}));

import { fetchDashboard } from "../lib/dashboard";
import { generateRemediation } from "../lib/missionsPilotage";

function subject(overrides: Partial<DashboardSubject> = {}): DashboardSubject {
  const zeros = () => Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0));
  return {
    id: 1,
    slug: "maths",
    name: "Mathématiques",
    color: "#60a5fa",
    minutes: { "7": 65, "30": 255, "90": 690, "365": 2400 },
    calendar: [{ date: "2026-07-28", active_minutes: 42 }],
    slots: { "7": zeros(), "30": zeros(), "90": zeros(), "365": zeros() },
    slots_outside_minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
    notions: { consolidated: 4, fragile: 3, in_progress: 2, total: 13 },
    series: {
      "7": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
      "30": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
      "90": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
      "365": { covered: [1, 2], consolidated: [0, 4], fragile: [3, 3] },
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
  unattributed_minutes: { "7": 107, "30": 450, "90": 1200, "365": 3900 },
  periods: { "7": period(200), "30": period(825), "90": period(2210), "365": period(7400) },
  subjects: [subject(), subject({ id: 2, slug: "svt", name: "SVT", minutes: { "7": 28, "30": 120, "90": 320, "365": 1100 } })],
  content_chain: [
    { stage: "cours_valides", label: "Cours validés", value: 30, target: 38 },
    { stage: "fiches", label: "Fiches", value: 22, target: 30 },
  ],
  reading: [
    {
      trend: "watch",
      text: "Mathématiques : 3 notions à renforcer",
      // La preuve d'un constat « à renforcer » mène au PANNEAU d'analyse — seul endroit qui nomme
      // les notions fragiles. Elle pointait vers `/lacunes`, qui liste une autre population.
      evidence: { count: 3, kind: "notion", href: "/?subject=maths&panel=ou-agir" },
    },
    {
      // ⚠️ Un constat dont la preuve mène AILLEURS, indispensable au verrou « on n'ajoute la
      // période qu'aux liens internes » : avec un seul item interne, ce test itérait sur rien et
      // restait vert quelle que soit la règle.
      trend: "flat",
      text: "SVT : trop peu d'activité mesurée pour conclure",
      evidence: { count: 2, kind: "trace", href: "/cahier?subject=svt" },
    },
  ],
  proposed_mission: {
    skill_id: 7,
    skill_name: "Comparaison de relatifs",
    title: "Renforcer : Comparaison de relatifs",
    steps: [
      { step_type: "eli5", instruction: "Demande à ZETIS de t'expliquer…" },
      { step_type: "vocal_explain", instruction: "Réexplique avec tes mots…" },
    ],
    estimated_minutes: 10,
    mission_type: "remediation",
    confirm_href: "/missions",
  },
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
  // Sans ce reset, les compteurs d'appel s'accumulent d'un test à l'autre et les assertions
  // « n'a rien créé » passeraient à côté d'une écriture non voulue.
  vi.mocked(generateRemediation).mockReset().mockResolvedValue({ created: 1 });
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

  it("offre « Année » APRÈS « Trimestre », et y basculer ne recharge rien", async () => {
    // La vision globale est la quatrième fenêtre, pas une surface à part : elle doit arriver dans
    // le même payload que les trois autres, sinon le cockpit redevient une page qui va au réseau.
    //
    // L'ordre des boutons est vérifié pour de vrai : il vient de `Object.keys(PERIOD_LABELS)`,
    // que le langage énumère en ordre NUMÉRIQUE parce que les clés ressemblent à des entiers.
    // Cela tombe juste aujourd'hui — une clé non numérique passerait derrière sans prévenir.
    renderPage();
    const kpi = await screen.findByRole("button", { name: /Temps actif/ });

    const périodes = screen
      .getAllByRole("button")
      .map((b) => b.textContent)
      .filter((t) => t && ["7 jours", "30 jours", "Trimestre", "Année"].includes(t));
    expect(périodes).toEqual(["7 jours", "30 jours", "Trimestre", "Année"]);

    fireEvent.click(screen.getByRole("button", { name: "Année" }));

    await waitFor(() => expect(kpi).toHaveTextContent("123h20")); // 7400 min sur 365 jours
    expect(fetchDashboard).toHaveBeenCalledTimes(1);
  });

  it("la preuve GARDE la fenêtre en cours quand elle reste sur le dashboard", async () => {
    // Constaté à l'écran le 2026-08-05 : suivre une preuve renvoyait le sélecteur à « 7 jours »,
    // au moment précis où Papa descendait dans le détail. Le serveur ne peut pas porter la
    // période — le payload en est indépendant par construction — donc c'est au client de la
    // préserver, et SEULEMENT pour les liens qui restent sur cette page.
    renderPage();
    await screen.findByRole("button", { name: /Temps actif/ });
    fireEvent.click(screen.getByRole("button", { name: "Année" }));

    const preuve = await screen.findByRole("link", { name: /preuve · 3 notion/ });
    expect(preuve).toHaveAttribute("href", "/?subject=maths&panel=ou-agir&period=365");
  });

  it("ne touche PAS aux preuves qui mènent ailleurs", async () => {
    // Le `href` reste un contrat serveur : on ajoute une période, on ne réécrit pas un adressage.
    renderPage();
    await screen.findByRole("button", { name: /Temps actif/ });

    const externes = screen
      .getAllByRole("link", { name: /preuve · / })
      .map((l) => l.getAttribute("href") ?? "")
      .filter((h) => !h.startsWith("/?"));

    // Anti-vacuité : sans au moins un lien externe dans la fixture, la boucle ne prouverait rien.
    expect(externes.length).toBeGreaterThan(0);
    for (const href of externes) expect(href).not.toContain("period=");
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

describe("mission proposée", () => {
  it("affiche le parcours composé et son estimation, sans rien créer", async () => {
    renderPage();
    await screen.findByText(/Mission proposée/);

    expect(
      screen.getByText(/2 étapes composées depuis les traces mesurées/),
    ).toHaveTextContent("Explication ELI5 → Reformulation orale. ~10 min.");
    // LE verrou : ouvrir le dashboard ne crée aucune mission.
    expect(generateRemediation).not.toHaveBeenCalled();
  });

  it("ne crée qu'après confirmation explicite, puis recharge l'agrégat", async () => {
    renderPage();
    await screen.findByText(/Mission proposée/);

    fireEvent.click(screen.getByRole("button", { name: "Créer la mission" }));
    // Le premier clic ouvre la confirmation — il n'écrit toujours rien.
    expect(generateRemediation).not.toHaveBeenCalled();
    expect(screen.getByText("Créer cette mission de consolidation ?")).toBeInTheDocument();

    // Deux boutons portent alors ce libellé : celui de l'encart et celui de la modale. C'est le
    // second qui engage.
    const buttons = screen.getAllByRole("button", { name: "Créer la mission" });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(generateRemediation).toHaveBeenCalledTimes(1));
    // Créer une mission est une invalidation métier réelle : c'est le seul cas où l'agrégat est
    // rechargé (ADR-0028 §1).
    await waitFor(() => expect(fetchDashboard).toHaveBeenCalledTimes(2));
  });

  it("« Écarter » masque la proposition sans rien créer", async () => {
    renderPage();
    await screen.findByText(/Mission proposée/);

    fireEvent.click(screen.getByRole("button", { name: "Écarter" }));

    expect(screen.queryByText(/Mission proposée/)).toBeNull();
    expect(generateRemediation).not.toHaveBeenCalled();
  });

  it("sans aucune lacune découverte, la carte le dit au lieu d'inventer un travail", async () => {
    const kpis = PAYLOAD.periods["7"].kpis;
    vi.mocked(fetchDashboard).mockResolvedValue({
      ...PAYLOAD,
      proposed_mission: null,
      periods: {
        ...PAYLOAD.periods,
        "7": {
          ...PAYLOAD.periods["7"],
          kpis: { ...kpis, open_gaps: { ...kpis.open_gaps, without_mission: 0 } },
        },
      },
    });
    renderPage();

    expect(
      await screen.findByText(/chaque notion à renforcer est déjà prise en charge/),
    ).toBeInTheDocument();
  });

  it("des lacunes sans mission mais hors du générateur : la carte ne rassure PAS à tort", async () => {
    // Cas réel constaté en base : une notion travaillée dont le verdict fut « à revoir » passe
    // en `in_progress` et sort du champ de `generate_remediation`. Écrire « tout est pris en
    // charge » mentirait — et se taire laisserait croire à un trou, alors que la révision est
    // bien le relais prévu (adr-0017 §5bis).
    vi.mocked(fetchDashboard).mockResolvedValue({ ...PAYLOAD, proposed_mission: null });
    renderPage();

    expect(await screen.findByText(/reviennent par la/)).toBeInTheDocument();
    expect(screen.queryByText(/déjà prise en charge/)).toBeNull();
    expect(screen.getByRole("link", { name: /Décider quoi en faire/ })).toHaveAttribute(
      "href",
      "/lacunes",
    );
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
