import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProgressionOverview, ProgressionSubject } from "@zetis/types";
import { ProgressionPage } from "./ProgressionPage";

// Page Progression — la cible de la branche `up` de la Lecture ZETIS.
//
// L'enjeu des tests : cette page rendait un MOCK (51 lignes lisant `data/mock`) alors qu'un
// constat cliquable du dashboard prétendait y mener pour prouver un compte. Ce fichier verrouille
// quatre choses : rien ne vient du mock, « abordé » et « acquis » restent deux nombres, une
// matière sans référentiel garde sa ligne, et aucune période ne s'invite.

// La FABRIQUE de mock s'étend avec ce que la page appelle réellement — le dépliage d'une ligne
// charge les notions acquises et le détail nommé d'une matière. Aucune assertion existante n'a
// bougé : ce sont deux modules de plus à mocker, pas un comportement réécrit.
vi.mock("../lib/activity", () => ({
  fetchProgressionOverview: vi.fn(),
  fetchConsolidatedSkills: vi.fn(),
}));
vi.mock("../lib/subjectAnalysis", () => ({ fetchSubjectAnalysis: vi.fn() }));
vi.mock("../lib/councilClass", () => ({
  createMissionsFromReco: vi.fn(),
  equipNotion: vi.fn(),
}));

import { fetchConsolidatedSkills, fetchProgressionOverview } from "../lib/activity";
import { fetchSubjectAnalysis } from "../lib/subjectAnalysis";
import { createMissionsFromReco } from "../lib/councilClass";

function subject(overrides: Partial<ProgressionSubject> = {}): ProgressionSubject {
  return {
    subject_id: 1,
    slug: "francais",
    name: "Français",
    color: null,
    icon: null,
    notions: { consolidated: 1, fragile: 8, in_progress: 1, total: 96 },
    engaged: 10,
    xp: 367,
    gaps_open: 1,
    has_referentiel: true,
    ...overrides,
  };
}

function overview(subjects: ProgressionSubject[]): ProgressionOverview {
  return {
    generated_at: "2026-08-05T09:00:00+00:00",
    school_year: { label: "2026-2027", level: "4e" },
    subjects,
  };
}

function renderPage(url = "/progression") {
  render(
    <MemoryRouter initialEntries={[url]}>
      <ProgressionPage />
    </MemoryRouter>,
  );
}

/** La ligne du TABLEAU. Scopée exprès : le bandeau « Depuis le constat sur Français » porte le
 *  même nom, et un `getByText` global remonterait deux nœuds. */
function ligne(name: string) {
  return within(screen.getByRole("table")).getByText(name).closest("tr") as HTMLElement;
}

function analyse(overrides: Record<string, unknown> = {}) {
  return {
    subject_id: 1,
    slug: "francais",
    name: "Français",
    generated_at: "2026-08-05T09:00:00+00:00",
    to_reinforce: [],
    fragile_count: 0,
    open_gap_count: 0,
    without_mission_count: 0,
    in_progress: {
      missions: [],
      pending_content: 0,
      stale_content: 0,
      review_overdue: 0,
      review_max_overdue_days: 0,
    },
    referentiel: {
      has_referentiel: true,
      lessons: 1,
      lessons_validated: 1,
      courses_written: 1,
      derivatives_percent: 100,
    },
    engaged: [],
    not_started: [],
    xp_by_reason: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(fetchProgressionOverview).mockReset().mockResolvedValue(overview([subject()]));
  vi.mocked(fetchConsolidatedSkills).mockReset().mockResolvedValue([]);
  vi.mocked(fetchSubjectAnalysis).mockReset().mockResolvedValue(analyse() as never);
  vi.mocked(createMissionsFromReco).mockReset().mockResolvedValue([] as never);
});

// --- Verrou 1 : aucune donnée ne vient de `data/mock` ---------------------------------------------

describe("la page ne lit plus le mock", () => {
  it("affiche les chiffres du serveur, pas ceux de data/mock", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview([subject()]));
    renderPage();

    const francais = await waitFor(() => ligne("Français"));

    // Le mock donnait « Français · 62 % · 320 XP · 1 lacune ». Aucun de ces nombres ne doit
    // apparaître : ce sont eux qui trahissaient la page.
    expect(within(francais).getByText("10 / 96")).toBeInTheDocument();
    expect(within(francais).getByText("367")).toBeInTheDocument();
    expect(screen.queryByText("62 %")).not.toBeInTheDocument();
    expect(screen.queryByText("320")).not.toBeInTheDocument();
  });

  it("ne rend AUCUNE ligne tant que le serveur n'a pas répondu", () => {
    // Une promesse qui ne se résout jamais : si un mock survivait quelque part, des matières
    // s'afficheraient ici sans qu'aucune donnée soit arrivée.
    vi.mocked(fetchProgressionOverview).mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Français")).not.toBeInTheDocument();
  });

  it("garde son bouton Réessayer quand le chargement échoue, et n'invente rien", async () => {
    vi.mocked(fetchProgressionOverview).mockRejectedValue(new Error("Backend éteint"));
    renderPage();

    expect(await screen.findByText("Backend éteint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Réessayer/ })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

// --- Verrou 2 : « avancé » et « acquis » SÉPARÉMENT, jamais additionnés ---------------------------

describe("avancé et acquis ne fusionnent jamais", () => {
  it("sert deux nombres distincts, et la barre n'est pas celle des acquis", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({
          notions: { consolidated: 1, fragile: 8, in_progress: 1, total: 96 },
          engaged: 10,
        }),
      ]),
    );
    renderPage();

    const francais = await waitFor(() => ligne("Français"));

    expect(within(francais).getByText("10 / 96")).toBeInTheDocument();
    expect(within(francais).getByText("1")).toBeInTheDocument(); // acquis, à part
    // Anti-vacuité : 10 ≠ 1, donc afficher l'un pour l'autre se verrait. Et la somme des deux
    // (11) ne doit apparaître nulle part — ce serait le total unique qu'on refuse.
    expect(within(francais).queryByText("11 / 96")).not.toBeInTheDocument();
    expect(within(francais).queryByText(/11/)).not.toBeInTheDocument();
  });

  it("affiche une barre non nulle même sans AUCUNE notion acquise", async () => {
    // C'est tout l'enjeu de l'ADR : 1 notion consolidée sur 280 en base réelle. Une barre bâtie
    // sur les acquis serait à zéro ici et ne dirait rien pendant des mois.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({
          slug: "mathematiques",
          name: "Mathématiques",
          notions: { consolidated: 0, fragile: 3, in_progress: 2, total: 58 },
          engaged: 5,
        }),
      ]),
    );
    renderPage();

    const maths = await waitFor(() => ligne("Mathématiques"));
    expect(within(maths).getByText("5 / 58")).toBeInTheDocument();
  });

  it("n'affiche AUCUN pourcentage — « 10 % » se lirait « il ne sait que 10 % »", async () => {
    renderPage();
    await waitFor(() => ligne("Français"));

    expect(screen.queryByText(/\d+\s*%/)).not.toBeInTheDocument();
  });
});

// --- Verrou 3 : une matière sans référentiel garde sa ligne ET son lien ---------------------------

describe("une matière sans référentiel n'est pas masquée", () => {
  it("garde sa ligne, écrit son état et propose le Programme", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject(),
        subject({
          subject_id: 6,
          slug: "espagnol",
          name: "Espagnol",
          notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 0 },
          engaged: 0,
          xp: 0,
          has_referentiel: false,
        }),
      ]),
    );
    renderPage();

    const espagnol = await waitFor(() => ligne("Espagnol"));
    expect(within(espagnol).getByText(/référentiel non généré/)).toBeInTheDocument();
    expect(within(espagnol).getByRole("link", { name: /Ouvrir le programme/ })).toHaveAttribute(
      "href",
      "/programme",
    );
  });

  it("distingue « pas de référentiel » de « référentiel vide »", async () => {
    // Deux états qui ont tous deux `total === 0` et ne se lisent PAS pareil. Les confondre
    // enverrait Papa générer un programme qu'il a déjà. Sur la base réelle, trois matières sont
    // exactement dans le second cas.
    const vide = { consolidated: 0, fragile: 0, in_progress: 0, total: 0 };
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({ subject_id: 6, slug: "espagnol", name: "Espagnol", notions: vide, engaged: 0, has_referentiel: false }),
        subject({ subject_id: 7, slug: "technologie", name: "Technologie", notions: vide, engaged: 0, has_referentiel: true }),
      ]),
    );
    renderPage();

    const espagnol = await waitFor(() => ligne("Espagnol"));
    const techno = ligne("Technologie");

    expect(within(espagnol).getByText(/référentiel non généré/)).toBeInTheDocument();
    expect(within(techno).getByText(/aucune notion rattachée/)).toBeInTheDocument();
    expect(within(techno).queryByText(/référentiel non généré/)).not.toBeInTheDocument();
  });
});

// --- Verrou 4 : aucun sélecteur de période -------------------------------------------------------

describe("aucune période sur la page", () => {
  it("n'expose aucun sélecteur et n'appelle le serveur QU'UNE fois", async () => {
    renderPage();
    await waitFor(() => ligne("Français"));

    expect(fetchProgressionOverview).toHaveBeenCalledTimes(1);
    // Aucun bouton de période, aucune liste déroulante : les 7/30/90/365 jours du dashboard n'ont
    // rien à faire ici, tout ce qui est servi est un stock (ADR-0038 §6).
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    for (const jours of ["7 jours", "30 jours", "90 jours", "365 jours"]) {
      expect(screen.queryByText(jours)).not.toBeInTheDocument();
    }
  });
});

// --- La colonne « À renforcer » compte les FRAGILES ------------------------------------------------

describe("à renforcer", () => {
  it("affiche les notions fragiles, pas les lacunes ouvertes", async () => {
    // Décision du 2026-08-05 : le tableau de la spec disait `Gap`, son wireframe montrait les
    // fragiles. C'est le wireframe qui a raison — c'est ce que compte le constat du dashboard qui
    // pointe vers cette page. Sur la base réelle : 8 fragiles pour 1 lacune ouverte en Français.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([subject({ notions: { consolidated: 1, fragile: 8, in_progress: 1, total: 96 }, gaps_open: 1 })]),
    );
    renderPage();

    const francais = await waitFor(() => ligne("Français"));
    const cellules = within(francais).getAllByRole("cell");
    expect(cellules[cellules.length - 1]).toHaveTextContent("8");
  });
});

// --- La preuve pointe sur SA ligne (`?subject=`) ---------------------------------------------------

describe("le constat qui pointe ici trouve sa ligne", () => {
  const deux = [
    subject(),
    subject({ subject_id: 2, slug: "mathematiques", name: "Mathématiques", xp: 577 }),
  ];

  it("met en évidence la matière du constat SANS masquer les autres", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(deux));
    renderPage("/progression?subject=francais");

    const francais = await waitFor(() => ligne("Français"));
    expect(francais).toHaveAttribute("aria-current", "true");
    // Anti-vacuité : comparer les matières est la raison d'être de la page. Une preuve qui vide
    // l'écran autour d'elle enlèverait ce qu'on venait chercher.
    expect(ligne("Mathématiques")).not.toHaveAttribute("aria-current");
    expect(screen.getByText(/Depuis le constat sur/)).toBeInTheDocument();
  });

  it("ne surligne RIEN sur un slug inconnu, et ne vide pas la table", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(deux));
    renderPage("/progression?subject=klingon");

    await waitFor(() => ligne("Français"));
    expect(ligne("Français")).not.toHaveAttribute("aria-current");
    expect(ligne("Mathématiques")).toBeInTheDocument();
    expect(screen.queryByText(/Depuis le constat sur/)).not.toBeInTheDocument();
  });

  it("« Tout voir » retire la mise en avant sans recharger", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(deux));
    renderPage("/progression?subject=francais");

    const bouton = await screen.findByRole("button", { name: "Tout voir" });
    fireEvent.click(bouton);

    await waitFor(() => expect(ligne("Français")).not.toHaveAttribute("aria-current"));
    expect(ligne("Mathématiques")).toBeInTheDocument();
    // Retirer un surlignage n'est pas une raison de redemander la page au serveur.
    expect(fetchProgressionOverview).toHaveBeenCalledTimes(1);
  });
});

// --- L'état « aucune matière » --------------------------------------------------------------------

describe("aucune matière", () => {
  it("renvoie vers les années scolaires plutôt que d'afficher un tableau vide", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview([]));
    renderPage();

    expect(await screen.findByText(/Aucune matière dans l'année active/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Années scolaires/ })).toHaveAttribute("href", "/annees");
  });
});

// --- Le dépliage d'une ligne (addendum ADR-0038) --------------------------------------------------
//
// Ce que ces tests protègent : le détail RECOMPOSE le nombre de sa ligne, un seul dépliage reste
// ouvert, aucun des quatre nombres n'est redemandé au réseau, et aucune écriture n'a lieu sans
// confirmation.

const DEUX = [
  subject(),
  subject({ subject_id: 2, slug: "mathematiques", name: "Mathématiques", xp: 577 }),
];

async function ouvrir(nom: string) {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(nom) }));
}

describe("dépliage d'une ligne", () => {
  it("nomme les notions que la ligne comptait, et rien d'autre", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({
        engaged: [
          { skill_id: 1, skill_name: "Accord du participe", segment: "fragile", mastery_score: 40 },
          { skill_id: 2, skill_name: "Discours rapporté", segment: "consolidated", mastery_score: 92 },
        ],
        not_started: [{ skill_id: 3, skill_name: "Subordonnées" }],
        xp_by_reason: [{ reason: "mission_remediation", count: 12, amount: 367 }],
        to_reinforce: [
          {
            skill_id: 1,
            skill_name: "Accord du participe",
            is_fragile: true,
            has_open_gap: false,
            mastery_score: 40,
            has_active_mission: false,
          },
        ],
        fragile_count: 1,
      }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Français"));

    await ouvrir("Français");

    // Scopé par bloc, et ce n'est pas un détail de test : une notion FRAGILE est aussi une notion
    // ENGAGÉE, elle apparaît donc légitimement dans deux blocs. Un `getByText` global remonterait
    // deux nœuds — c'est ce qui a fait tomber ce test au premier passage.
    const avancement = (await screen.findByText(/Avancement —/)).closest("section") as HTMLElement;
    const aRenforcer = screen.getByText(/À renforcer —/).closest("section") as HTMLElement;
    const xp = screen.getByText(/XP —/).closest("section") as HTMLElement;

    expect(within(avancement).getByText("Accord du participe")).toBeInTheDocument();
    expect(within(avancement).getByText("Discours rapporté")).toBeInTheDocument();
    expect(within(avancement).getByText(/1 notion pas encore abordée/)).toBeInTheDocument();
    expect(within(aRenforcer).getByText("Accord du participe")).toBeInTheDocument();
    // Anti-vacuité : les acquises ne doivent PAS se retrouver dans « à renforcer ».
    expect(within(aRenforcer).queryByText("Discours rapporté")).toBeNull();
    // Le XP est réparti par ACTIVITÉ, et l'écran le dit — sinon Papa chercherait la notion.
    expect(within(xp).getByText("missions de consolidation")).toBeInTheDocument();
    expect(within(xp).getByText(/pas rattaché à une notion précise/)).toBeInTheDocument();
  });

  it("chaque bloc RECOMPOSE le nombre de sa ligne", async () => {
    // Le verrou du chantier, transposé à l'intérieur d'une ligne : les titres des blocs portent
    // les nombres de la ligne, et les listes doivent les valoir.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({ notions: { consolidated: 1, fragile: 2, in_progress: 0, total: 5 }, engaged: 3, xp: 90 }),
      ]),
    );
    vi.mocked(fetchConsolidatedSkills).mockResolvedValue([
      { skill_id: 2, skill_name: "Discours rapporté", subject_slug: "francais", mastery_score: 92 },
      // Une acquise d'une AUTRE matière : elle ne doit pas polluer le bloc de Français.
      { skill_id: 9, skill_name: "Pythagore", subject_slug: "mathematiques", mastery_score: 95 },
    ]);
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({
        engaged: [
          { skill_id: 1, skill_name: "Accord", segment: "fragile" },
          { skill_id: 3, skill_name: "Concordance", segment: "fragile" },
          { skill_id: 2, skill_name: "Discours rapporté", segment: "consolidated" },
        ],
        not_started: [
          { skill_id: 4, skill_name: "Subordonnées" },
          { skill_id: 5, skill_name: "Participiales" },
        ],
        xp_by_reason: [
          { reason: "mission_remediation", count: 2, amount: 60 },
          { reason: "quiz_completed", count: 1, amount: 30 },
        ],
        to_reinforce: [
          { skill_id: 1, skill_name: "Accord", is_fragile: true, has_open_gap: false, has_active_mission: false },
          { skill_id: 3, skill_name: "Concordance", is_fragile: true, has_open_gap: false, has_active_mission: false },
        ],
        fragile_count: 2,
      }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Français"));
    await ouvrir("Français");

    // Avancement : 3 engagées sur 5 au programme → 3 nommées + 2 non abordées.
    const avancement = (await screen.findByText(/Avancement —/)).closest("section") as HTMLElement;
    expect(avancement).toHaveTextContent("3 notions abordées sur 5");
    expect(within(avancement).getAllByRole("listitem")).toHaveLength(3);
    expect(within(avancement).getByText(/2 notions pas encore abordées/)).toBeInTheDocument();

    // Acquis : 1, et la notion d'une autre matière est écartée.
    const acquis = screen.getByText(/Acquis —/).closest("section") as HTMLElement;
    expect(within(acquis).getAllByRole("listitem")).toHaveLength(1);
    expect(within(acquis).queryByText("Pythagore")).toBeNull();

    // XP : 60 + 30 = 90, exactement le nombre de la ligne.
    const xp = screen.getByText(/XP —/).closest("section") as HTMLElement;
    expect(xp).toHaveTextContent("XP — 90");
    expect(within(xp).getAllByRole("listitem")).toHaveLength(2);

    // À renforcer : 2.
    const aRenforcer = screen.getByText(/À renforcer —/).closest("section") as HTMLElement;
    expect(within(aRenforcer).getAllByRole("listitem")).toHaveLength(2);
  });

  it("n'ouvre qu'UNE matière à la fois", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    renderPage();
    await waitFor(() => ligne("Français"));

    await ouvrir("Français");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Français/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );

    await ouvrir("Mathématiques");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Mathématiques/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    // Anti-vacuité : deux lignes existent, et la première doit s'être REFERMÉE.
    expect(screen.getByRole("button", { name: /Français/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("recliquer une ligne ouverte la REFERME", async () => {
    // Trou trouvé par sabotage : le test précédent passait même sans bascule, parce qu'ouvrir une
    // AUTRE ligne referme la première de toute façon. Sans cette assertion, une ligne ouverte
    // n'aurait plus jamais pu se fermer et rien ne l'aurait dit.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    renderPage();
    await waitFor(() => ligne("Français"));

    await ouvrir("Français");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /▶?\s*Français/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Français/ })[0]);

    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: /Français/ })[0]).toHaveAttribute(
        "aria-expanded",
        "false",
      ),
    );
    expect(screen.queryByText(/Avancement —/)).toBeNull();
  });

  it("ne redemande AUCUN des quatre nombres au réseau", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    renderPage();
    await waitFor(() => ligne("Français"));

    await ouvrir("Français");
    await waitFor(() => expect(fetchSubjectAnalysis).toHaveBeenCalled());

    // Les quatre nombres viennent de `/progress/overview`, déjà en mémoire. Les relire au dépliage
    // ferait une seconde source pour une mesure affichée à quelques pixels — le bug du chantier.
    expect(fetchProgressionOverview).toHaveBeenCalledTimes(1);
  });

  it("ne charge les acquises QU'UNE fois, même en ouvrant plusieurs lignes", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    renderPage();
    await waitFor(() => ligne("Français"));

    // Avant tout dépliage, la route des acquises n'est pas appelée : la table garde sa requête
    // unique au montage.
    expect(fetchConsolidatedSkills).not.toHaveBeenCalled();

    await ouvrir("Français");
    await waitFor(() => expect(fetchConsolidatedSkills).toHaveBeenCalledTimes(1));

    await ouvrir("Mathématiques");
    await ouvrir("Français");
    await waitFor(() => expect(fetchSubjectAnalysis).toHaveBeenCalledTimes(3));
    expect(fetchConsolidatedSkills).toHaveBeenCalledTimes(1);
  });

  it("ouvre d'office la matière du constat qui pointe ici", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    renderPage("/progression?subject=francais");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Français/ })).toHaveAttribute(
        "aria-expanded",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: /Mathématiques/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("n'écrit RIEN sans confirmation explicite", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({
        to_reinforce: [
          {
            skill_id: 7,
            skill_name: "Accord du participe",
            is_fragile: true,
            has_open_gap: false,
            has_active_mission: false,
          },
        ],
        fragile_count: 1,
      }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Français"));
    await ouvrir("Français");

    fireEvent.click(await screen.findByRole("button", { name: "Créer une mission" }));
    expect(createMissionsFromReco).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Créer" }));

    await waitFor(() => expect(createMissionsFromReco).toHaveBeenCalledWith([7]));
  });

  it("une notion déjà couverte ne propose pas de seconde mission", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(DEUX));
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({
        to_reinforce: [
          {
            skill_id: 7,
            skill_name: "Accord du participe",
            is_fragile: true,
            has_open_gap: false,
            has_active_mission: true,
          },
        ],
        fragile_count: 1,
      }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Français"));
    await ouvrir("Français");

    expect(await screen.findByText(/déjà prise en charge/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Créer une mission" })).toBeNull();
  });
});
