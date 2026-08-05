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
      detail: "4 cours · 2 fiches",
      href: "/relecture",
      breakdown: [
        { kind: "lesson", count: 4, label: "4 cours", href: "/relecture?kind=lesson" },
        { kind: "fiche", count: 2, label: "2 fiches", href: "/relecture?kind=fiche" },
      ],
    },
  ],
  unattributed_minutes: { "7": 107, "30": 450, "90": 1200, "365": 3900 },
  periods: { "7": period(200), "30": period(825), "90": period(2210), "365": period(7400) },
  subjects: [subject(), subject({ id: 2, slug: "svt", name: "SVT", minutes: { "7": 28, "30": 120, "90": 320, "365": 1100 } })],
  content_chain: [
    {
      stage: "cours_valides",
      label: "Cours validés",
      value: 30,
      target: 38,
      missing_href: "/couverture?filter=no_course",
      missing_count: 8,
    },
    {
      stage: "fiches",
      label: "Fiches",
      value: 22,
      target: 30,
      missing_href: "/couverture?filter=ready&manque=fiche",
      missing_count: 5,
    },
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

describe("donut « Répartition du temps »", () => {
  // On lit les `<text>` du CENTRE, pas le texte de la carte : `formatMinutes` sert aussi aux
  // `<title>` des segments, si bien qu'un `toHaveTextContent("1h05")` passerait au vert sans que
  // le centre ait bougé d'un pixel.
  const centre = () =>
    [...screen.getByRole("img", { name: /Répartition du temps actif/ }).querySelectorAll("text")]
      .map((t) => t.textContent);

  it("sans filtre, le centre annonce le total de la fenêtre", async () => {
    renderPage();
    await screen.findByRole("button", { name: /Temps actif/ });

    expect(centre()).toEqual(["3h20", "temps actif"]);
  });

  it("le centre suit la matière sélectionnée, et garde le total sous lui", async () => {
    renderPage("/?subject=maths");
    await screen.findByRole("button", { name: /Temps actif/ });

    // 65 min de maths dans une fenêtre de 200.
    expect(centre()).toEqual(["1h05", "Mathématiques", "sur 3h20"]);

    // Le TRACÉ, lui, ne suit pas le filtre : réduit à une matière, le donut occuperait 100 % du
    // disque et ne dirait plus rien de sa part réelle.
    const carte = screen.getByRole("img", { name: /Répartition du temps actif/ }).closest("section")!;
    expect(within(carte).getByText("SVT")).toBeInTheDocument();
    expect(within(carte).getByText("Hors matière")).toBeInTheDocument();
  });

  it("une matière SANS temps affiche 0, pas le total de la fenêtre", async () => {
    // Le cas que le donut ne peut pas montrer : à 0 minute la matière n'a aucune part dessinée.
    // La chercher parmi les parts la ferait retomber sur le total — un bug qui ne se verrait que
    // sur les matières inactives, donc jamais.
    vi.mocked(fetchDashboard).mockResolvedValue({
      ...PAYLOAD,
      subjects: [
        ...PAYLOAD.subjects,
        subject({
          id: 3,
          slug: "anglais",
          name: "Anglais",
          minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
        }),
      ],
    });
    renderPage("/?subject=anglais");
    await screen.findByRole("button", { name: /Temps actif/ });

    expect(centre()).toEqual(["0 min", "Anglais", "sur 3h20"]);
  });
});

describe("créneaux — ce que la case montre", () => {
  // Deux matières qui se partagent Lun 8 h (20 + 5), et une case à maths seul (Jeu 12 h).
  // Posé sur les QUATRE fenêtres : les créneaux vivent dans `slots[period]`, et n'alimenter que
  // « 7 » rendrait la grille vide dès qu'un test change de période — sans rien casser d'autre,
  // donc sans qu'on comprenne pourquoi.
  const poser = (s: DashboardSubject, slot: number, day: number, minutes: number) => {
    for (const p of ["7", "30", "90", "365"] as const) s.slots[p][slot][day] = minutes;
  };
  const avecCreneaux = () => {
    const maths = subject({ slug: "maths", name: "Mathématiques", color: "#60a5fa" });
    poser(maths, 0, 0, 20);
    poser(maths, 2, 3, 12);
    const svt = subject({ id: 2, slug: "svt", name: "SVT", color: "#34d399" });
    poser(svt, 0, 0, 5);
    return { ...PAYLOAD, subjects: [maths, svt] };
  };

  const ouvrirCreneaux = async () => {
    await screen.findByRole("button", { name: /Temps actif/ });
    fireEvent.click(screen.getByRole("button", { name: "Semaine type" }));
  };

  it("sans filtre, une case partagée porte un segment PAR matière, la plus grosse d'abord", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage();
    await ouvrirCreneaux();

    const cellule = screen.getByLabelText(/^Lun 8 h — 25 min —/);
    const segments = [...cellule.querySelectorAll("span[style*='background']")];

    expect(segments).toHaveLength(2);
    expect(segments[0]).toHaveStyle({ width: "80%" }); // maths 20/25
    expect(segments[1]).toHaveStyle({ width: "20%" }); // svt 5/25

    // Aucun nombre sans filtre : un seul chiffre par-dessus deux matières additionnerait des
    // choses différentes sans le dire.
    expect(cellule.textContent).toBe("");
  });

  it("filtré, chaque case non vide porte ses minutes — les cases vides restent nues", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage("/?subject=maths");
    await ouvrirCreneaux();

    expect(screen.getByLabelText(/^Lun 8 h —/).textContent).toBe("20");
    expect(screen.getByLabelText(/^Jeu 12 h —/).textContent).toBe("12");
    // 20 et non 25 : filtrée, la grille ne compte plus que la matière retenue.
    expect(screen.getByLabelText(/^Lun 8 h —/).getAttribute("aria-label")).toContain(
      "20 min — Mathématiques 20",
    );
    expect(screen.getByLabelText("Mar 8 h — aucune séance").textContent).toBe("");
  });

  it("le survol ouvre le détail par matière, le quitter le referme", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage();
    await ouvrirCreneaux();

    const cellule = screen.getByLabelText(/^Lun 8 h — 25 min —/);
    const bulle = () => screen.queryByText(/^Lun 8 h · 25 min$/);

    expect(bulle()).toBeNull();

    fireEvent.mouseEnter(cellule);
    const contenu = bulle()!.parentElement!;
    expect(within(contenu).getByText("Mathématiques")).toBeInTheDocument();
    expect(within(contenu).getByText("20 min")).toBeInTheDocument();
    expect(within(contenu).getByText("SVT")).toBeInTheDocument();
    expect(within(contenu).getByText("5 min")).toBeInTheDocument();

    fireEvent.mouseLeave(cellule);
    expect(bulle()).toBeNull();
  });

  it("le `title` natif cède la place sur les cases ouvrables, et reste sur les vides", async () => {
    // Deux bulles pour la même case — la nôtre tout de suite, celle du navigateur une seconde
    // plus tard, grise et par-dessus.
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage();
    await ouvrirCreneaux();

    expect(screen.getByLabelText(/^Lun 8 h — 25 min —/)).not.toHaveAttribute("title");
    expect(screen.getByLabelText("Mar 8 h — aucune séance")).toHaveAttribute("title");
  });

  it("date la fenêtre et ne dit « moyenne » que lorsque c'en est une", async () => {
    // Le piège que ce verrou ferme : des en-têtes `Lun…Dim` se lisent comme la semaine EN COURS,
    // et une case remplie un jeudi passe pour une prédiction alors que c'est le jeudi PASSÉ de la
    // fenêtre. Constaté à l'écran un mercredi.
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage();
    await ouvrirCreneaux();

    // `generated_at` = 2026-07-29, fenêtre de 7 jours bornes incluses → 23 → 29 juillet.
    const carte = screen.getByText("Quand Massimo travaille").closest("section")!;
    expect(carte).toHaveTextContent("Semaine type du 23 juil. au 29 juil.");
    expect(carte).toHaveTextContent("le jeudi de cette fenêtre");
    // Sur 7 jours le serveur divise par 1 : le mot « moyenne » ne doit apparaître nulle part.
    expect(carte).toHaveTextContent(/le chiffre est ses minutes, pas une moyenne/);
    expect(screen.getByLabelText(/^Lun 8 h —/).getAttribute("aria-label")).not.toContain(
      "en moyenne",
    );
  });

  it("sur 30 jours la moyenne en est une, et le mot revient", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage("/?period=30");
    await ouvrirCreneaux();

    const carte = screen.getByText("Quand Massimo travaille").closest("section")!;
    expect(carte).toHaveTextContent("Semaine type du 30 juin au 29 juil.");
    expect(carte).toHaveTextContent("minutes actives moyennes du créneau");
    expect(screen.getByLabelText(/^Lun 8 h —/).getAttribute("aria-label")).toContain("en moyenne");
  });

  it("la longueur de la barre compare les créneaux entre eux", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecCreneaux());
    renderPage();
    await ouvrirCreneaux();

    // La plus grosse case de la grille remplit toute sa piste ; les autres s'y rapportent.
    const barre = (label: RegExp) =>
      screen.getByLabelText(label).querySelector("span:not([style*='background'])");
    expect(barre(/^Lun 8 h —/)).toHaveStyle({ width: "100%" }); // 25/25
    expect(barre(/^Jeu 12 h —/)).toHaveStyle({ width: "48%" }); // 12/25
  });
});

describe("semaine en cours — la vraie, datée", () => {
  // `generated_at` = mercredi 29 juillet 2026. La semaine calendaire va donc du lundi 27 au
  // dimanche 2 août, et jeudi/vendredi/samedi/dimanche n'ont PAS encore eu lieu.
  const avecSemaine = () => {
    const maths = subject({
      slug: "maths",
      name: "Mathématiques",
      color: "#60a5fa",
      calendar: [
        { date: "2026-07-27", active_minutes: 40 },
        { date: "2026-07-29", active_minutes: 25 },
      ],
    });
    const svt = subject({
      id: 2,
      slug: "svt",
      name: "SVT",
      color: "#34d399",
      calendar: [{ date: "2026-07-27", active_minutes: 20 }],
    });
    return { ...PAYLOAD, subjects: [maths, svt] };
  };

  const ouvrirSemaine = async () => {
    await screen.findByRole("button", { name: /Temps actif/ });
    fireEvent.click(screen.getByRole("button", { name: "Semaine en cours" }));
  };

  it("montre les sept jours datés de la semaine contenant aujourd'hui", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecSemaine());
    renderPage();
    await ouvrirSemaine();

    // Lundi 27 : 40 de maths + 20 de SVT.
    expect(screen.getByLabelText(/^Lun 27 — 1h00 —/).getAttribute("aria-label")).toContain(
      "Mathématiques 40, SVT 20",
    );
    // Mercredi 29 = aujourd'hui, 25 min de maths seul.
    expect(screen.getByLabelText("Mer 29 — 25 min — Mathématiques 25")).toBeInTheDocument();
    // Mardi 28 est passé sans séance — ce n'est PAS la même chose qu'un jour à venir.
    expect(screen.getByLabelText("Mar 28 — aucune séance")).toBeInTheDocument();
  });

  it("un jour À VENIR est marqué comme tel, jamais compté à zéro", async () => {
    // Le cœur de cette vue : « il n'a rien fait vendredi » et « on n'est pas encore vendredi »
    // sont deux phrases différentes, et une seule des deux est vraie un mercredi.
    vi.mocked(fetchDashboard).mockResolvedValue(avecSemaine());
    renderPage();
    await ouvrirSemaine();

    for (const jour of ["Jeu 30", "Ven 31", "Sam 1", "Dim 2"]) {
      expect(screen.getByLabelText(`${jour} — à venir`)).toBeInTheDocument();
    }
    // Et aucun de ces jours ne prétend valoir zéro minute.
    expect(screen.queryByLabelText(/^Jeu 30 — aucune séance$/)).toBeNull();
  });

  it("le survol d'un jour ouvre la même bulle que la semaine type", async () => {
    vi.mocked(fetchDashboard).mockResolvedValue(avecSemaine());
    renderPage();
    await ouvrirSemaine();

    fireEvent.mouseEnter(screen.getByLabelText(/^Lun 27 —/));
    const contenu = screen.getByText(/^Lun 27 · 60 min$/).parentElement!;
    expect(within(contenu).getByText("Mathématiques")).toBeInTheDocument();
    expect(within(contenu).getByText("40 min")).toBeInTheDocument();
    expect(within(contenu).getByText("SVT")).toBeInTheDocument();
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

  // Verrou du lien mesure → preuves, tel qu'il se VOIT. Rien d'autre dans cette suite ne regarde
  // ce que le focus produit à l'écran : sans ce test, `CARD_SCOPES` peut se décrocher de ce qui
  // s'affiche sans qu'un seul test rougisse. Il porte sur les classes parce que c'est le seul
  // endroit où jsdom peut constater le signe — l'apparence, elle, se vérifie à l'œil.
  it("le souffle vert marque le KPI cliqué ET ses cartes liées, elles seules", async () => {
    renderPage();
    const kpi = await screen.findByRole("button", { name: /Temps actif/ });

    // `heatmap` répond à « Temps actif » (`CARD_SCOPES`), `chaine` non.
    const heatmap = document.querySelector('[data-card="heatmap"]');
    const chaine = document.querySelector('[data-card="chaine"]');
    expect(heatmap).not.toBeNull();
    expect(chaine).not.toBeNull();

    expect(kpi).not.toHaveClass("souffle-focus");
    expect(heatmap!).not.toHaveClass("souffle-focus--lie");

    fireEvent.click(kpi);
    await waitFor(() => expect(kpi).toHaveClass("souffle-focus"));
    expect(heatmap!).toHaveClass("souffle-focus", "souffle-focus--lie");
    expect(chaine!).not.toHaveClass("souffle-focus");
    expect(chaine!).not.toHaveClass("souffle-focus--lie");

    // Relâcher éteint TOUT : un souffle qui survivrait au focus deviendrait un signe qui ment.
    fireEvent.click(kpi);
    await waitFor(() => expect(kpi).not.toHaveClass("souffle-focus"));
    expect(heatmap!).not.toHaveClass("souffle-focus--lie");
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
