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

/** La cellule d'une ligne SOUS une colonne nommée.
 *
 *  ⚠️ Ancrée sur l'EN-TÊTE, jamais sur un index : deux assertions positionnelles (« la dernière
 *  cellule vaut 8 », « la ligne contient 1 ») ont été silencieusement invalidées le 2026-08-06 par
 *  l'ajout de la colonne « Lacune ». Ancrées ainsi, elles disent enfin de QUELLE colonne elles
 *  parlent — et une septième colonne ne les déplacera plus. */
function cellule(ligneEl: HTMLElement, colonne: string) {
  const entetes = within(screen.getByRole("table")).getAllByRole("columnheader");
  const i = entetes.findIndex((h) =>
    h.textContent?.trim().toLowerCase().startsWith(colonne.toLowerCase()),
  );
  if (i < 0) throw new Error(`colonne « ${colonne} » introuvable`);
  return within(ligneEl).getAllByRole("cell")[i];
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

    expect(cellule(francais, "Avancement")).toHaveTextContent("10 / 96");
    expect(cellule(francais, "Acquis")).toHaveTextContent(/^1$/); // acquis, à part
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
    // 🔴 Cette assertion GELAIT le défaut : elle exigeait `/programme` NU, donc elle serait restée
    // verte pour toujours sur un lien qui renvoyait les huit matières vers la même page. Un test
    // peut verrouiller un bug aussi bien qu'un comportement — celui-ci l'a fait pendant un jour.
    expect(within(espagnol).getByRole("link", { name: /Ouvrir le programme/ })).toHaveAttribute(
      "href",
      "/programme?subject=6",
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
    // Depuis le 2026-08-06 les deux populations ont chacune leur colonne. L'assertion en est
    // renforcée, pas allégée : elle dit maintenant que 8 et 1 tombent dans DEUX colonnes
    // différentes, là où elle vérifiait seulement que la dernière valait 8.
    expect(cellule(francais, "À renforcer")).toHaveTextContent(/^8$/);
    expect(cellule(francais, "Lacune")).toHaveTextContent(/^1$/);
  });

  it("le compte de lacunes MÈNE à la page qui les porte, et zéro ne mène nulle part", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({ gaps_open: 1 }),
        subject({ subject_id: 2, slug: "mathematiques", name: "Mathématiques", gaps_open: 0 }),
      ]),
    );
    renderPage();

    const francais = await waitFor(() => ligne("Français"));
    expect(within(cellule(francais, "Lacune")).getByRole("link")).toHaveAttribute(
      "href",
      "/lacunes?subject=francais",
    );
    // Un lien vers une liste vide serait le cul-de-sac que ce chantier existe pour supprimer.
    expect(within(cellule(ligne("Mathématiques"), "Lacune")).queryByRole("link")).toBeNull();
  });
});

// --- 🔴 Chaque lien porte SA matière ---------------------------------------------------------------
//
// Le défaut trouvé à l'écran le 2026-08-06 : les trois « Ouvrir le programme » ne portaient aucun
// paramètre, donc les huit lignes menaient toutes à la matière ouverte par défaut. Une cible
// manquante est SILENCIEUSE — la page d'arrivée ignore le paramètre absent et ouvre autre chose,
// sans erreur, sans rien de rouge nulle part.
//
// ⚠️ Le paramètre `subject` ne porte pas le même type selon la destination : `subject_id` pour
// `/programme` et `/couverture`, SLUG pour `/lacunes` et `/conseil`. Ce test fige les deux.

describe("les liens de la Progression sont ciblés", () => {
  const MATHS = subject({ subject_id: 7, slug: "mathematiques", name: "Mathématiques" });

  it("« Ouvrir le programme » porte l'id de SA ligne, sur les deux états sans mesure", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({ subject_id: 3, slug: "svt", name: "SVT", has_referentiel: false }),
        subject({
          subject_id: 5,
          slug: "techno",
          name: "Technologie",
          notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 0 },
        }),
      ]),
    );
    renderPage();

    await waitFor(() => ligne("SVT"));
    // Scopé à la cellule « Avancement » : la ligne porte aussi le lien de la colonne « Lacune ».
    expect(within(cellule(ligne("SVT"), "Avancement")).getByRole("link")).toHaveAttribute(
      "href",
      "/programme?subject=3",
    );
    expect(within(cellule(ligne("Technologie"), "Avancement")).getByRole("link")).toHaveAttribute(
      "href",
      "/programme?subject=5",
    );
  });

  it("le dépliage cible programme ET couverture sur la MÊME matière", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview([MATHS]));
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({ not_started: [{ skill_id: 9, skill_name: "Pythagore" }] }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Mathématiques"));
    await ouvrir("Mathématiques");

    // Programme : la notion pas encore abordée ; Couverture : ce qu'il reste à produire.
    expect(await screen.findByRole("link", { name: /Ouvrir le programme/ })).toHaveAttribute(
      "href",
      "/programme?subject=7",
    );
    expect(screen.getByRole("link", { name: /Ouvrir la couverture/ })).toHaveAttribute(
      "href",
      "/couverture?subject=7",
    );
    // …et les deux destinations qui prennent un SLUG le prennent toujours.
    expect(screen.getByRole("link", { name: /Conseil de classe/ })).toHaveAttribute(
      "href",
      "/conseil?subject=mathematiques",
    );
    expect(screen.getByRole("link", { name: /Ouvrir les lacunes/ })).toHaveAttribute(
      "href",
      "/lacunes?subject=mathematiques",
    );
  });

  it("les trois liens du dépliage mènent aux autres VUES, pré-filtrées sur la matière", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({
          subject_id: 7,
          slug: "mathematiques",
          name: "Mathématiques",
          engaged: 12,
          notions: { consolidated: 1, fragile: 4, in_progress: 7, total: 58 },
        }),
      ]),
    );
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(analyse() as never);
    renderPage();
    await waitFor(() => ligne("Mathématiques"));
    await ouvrir("Mathématiques");

    // Les libellés PORTENT les nombres de la ligne : un lien « Les 12 notions engagées » qui
    // n'ouvrirait pas 12 notions serait le constat qui ment, déplacé d'un cran.
    expect(await screen.findByRole("link", { name: "Les 12 notions engagées →" })).toHaveAttribute(
      "href",
      "/progression?view=notion&subject=mathematiques",
    );
    expect(screen.getByRole("link", { name: "Les 4 à renforcer →" })).toHaveAttribute(
      "href",
      "/progression?view=notion&subject=mathematiques&palier=a_renforcer",
    );
    expect(screen.getByRole("link", { name: "Ce qui s'est passé →" })).toHaveAttribute(
      "href",
      "/progression?view=periode&subject=mathematiques",
    );
  });

  it("« 0 à renforcer » ne propose pas de lien vers une liste vide", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([subject({ notions: { consolidated: 1, fragile: 0, in_progress: 2, total: 58 } })]),
    );
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(analyse() as never);
    renderPage();
    await waitFor(() => ligne("Français"));
    await ouvrir("Français");

    await screen.findByRole("link", { name: /notions engagées/ });
    expect(screen.queryByRole("link", { name: /à renforcer →/ })).toBeNull();
  });

  it("aucun lien de la surface Progression ne part sans cible", async () => {
    // Anti-régression générique : c'est la forme du défaut, pas une de ses instances. Un futur
    // « Ouvrir le programme » ajouté sans paramètre rougira ici sans qu'on ait pensé à lui.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview([MATHS]));
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(analyse() as never);
    renderPage();
    await waitFor(() => ligne("Mathématiques"));
    await ouvrir("Mathématiques");
    await screen.findByText(/Référentiel —/);

    const nus = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "")
      .filter((h) => ["/programme", "/couverture", "/lacunes", "/conseil"].includes(h));
    expect(nus).toEqual([]);
  });
});

// --- Le tri des six colonnes (2026-08-06) ----------------------------------------------------------
//
// 🔴 L'invariant qui compte n'est PAS « ça trie » : c'est que **le départage survit au sens**, et
// que **l'absence de mesure ne se retourne pas avec lui**. Les ex æquo sont la règle sur cette
// table — sept matières sur huit à zéro acquis.

/** Les matières, dans l'ordre du tableau. Les lignes de dépliage (une seule cellule) sont écartées. */
function ordreMatieres(noms: string[]): string[] {
  return within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .filter((r) => within(r).queryAllByRole("cell").length > 1)
    .map((r) => noms.find((n) => r.textContent?.includes(n)) ?? "?");
}

/** Clique un en-tête de colonne.
 *
 *  ⚠️ `fireEvent`, jamais `element.click()` : un clic DOM nu n'est pas enveloppé dans `act()`,
 *  l'état n'est pas vidé, et l'assertion lit l'ordre d'AVANT — un test écrit ainsi passe quand
 *  l'attendu est déjà l'ordre par défaut, donc il ne prouve rien. */
function trierPar(nom: string) {
  const colonne = within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .find((c) => c.textContent?.trim().toLowerCase().startsWith(nom.toLowerCase()));
  if (!colonne) throw new Error(`colonne « ${nom} » introuvable`);
  fireEvent.click(within(colonne).getByRole("button"));
}

describe("tri des colonnes", () => {
  // Servies dans l'ORDRE DE L'ANNÉE, qui n'est pas l'ordre alphabétique — c'est ce qui rend les
  // deux distinguables.
  const NOMS = ["Mathématiques", "Français", "Histoire"];
  const TROIS = [
    subject({ subject_id: 1, slug: "mathematiques", name: "Mathématiques", xp: 100 }),
    subject({ subject_id: 2, slug: "francais", name: "Français", xp: 300 }),
    subject({ subject_id: 3, slug: "histoire", name: "Histoire", xp: 200 }),
  ];

  it("trie « Matière » dans l'ORDRE DE L'ANNÉE, jamais alphabétique", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(TROIS));
    renderPage();
    await waitFor(() => ligne("Français"));

    // ⚠️ On passe D'ABORD par une autre colonne : l'ordre de l'année étant déjà celui du départ,
    // cliquer « Matière » d'emblée passerait même si le clic ne faisait rien.
    trierPar("XP");
    expect(ordreMatieres(NOMS)).toEqual(["Français", "Histoire", "Mathématiques"]);

    trierPar("Matière");
    // L'ordre servi, pas l'alphabet — qui donnerait Français, Histoire, Mathématiques.
    expect(ordreMatieres(NOMS)).toEqual(["Mathématiques", "Français", "Histoire"]);
  });

  it("le premier clic d'une colonne de compte montre les PLUS GRANDS", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(TROIS));
    renderPage();
    await waitFor(() => ligne("Français"));

    trierPar("XP");
    // 300, 200, 100 : on trie sur « XP » pour voir qui en a le plus, pas les zéros.
    expect(ordreMatieres(NOMS)).toEqual(["Français", "Histoire", "Mathématiques"]);
    trierPar("XP");
    expect(ordreMatieres(NOMS)).toEqual(["Mathématiques", "Histoire", "Français"]);
  });

  it("🔴 le SENS n'inverse pas le départage — les ex æquo gardent leur ordre", async () => {
    // Trois matières au MÊME XP : la clé principale ne les départage pas. Quel que soit le sens,
    // elles restent dans l'ordre (nom, subject_id). Si le tri inversait aussi sa queue, l'ordre
    // des ex æquo basculerait — et sur cette table les ex æquo sont la règle.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview(TROIS.map((s) => ({ ...s, xp: 42 }))),
    );
    renderPage();
    await waitFor(() => ligne("Français"));

    trierPar("XP");
    const desc = ordreMatieres(NOMS);
    trierPar("XP");
    const asc = ordreMatieres(NOMS);

    expect(desc).toEqual(["Français", "Histoire", "Mathématiques"]); // alphabétique, la queue
    expect(asc).toEqual(desc);
  });

  it("🔴 une matière SANS barre reste en bas dans les DEUX sens", async () => {
    // Sans référentiel, il n'y a pas de ratio. La compter comme 0 dirait « pas avancée » là où la
    // vérité est « pas mesurable » — et en sens descendant elle passerait en TÊTE du classement
    // d'avancement, ce qui serait le contresens exact.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([
        subject({ subject_id: 1, slug: "mathematiques", name: "Mathématiques", engaged: 5, notions: { consolidated: 0, fragile: 0, in_progress: 5, total: 100 } }),
        subject({ subject_id: 2, slug: "francais", name: "Français", engaged: 0, notions: { consolidated: 0, fragile: 0, in_progress: 0, total: 0 }, has_referentiel: false }),
        subject({ subject_id: 3, slug: "histoire", name: "Histoire", engaged: 50, notions: { consolidated: 0, fragile: 0, in_progress: 50, total: 100 } }),
      ]),
    );
    renderPage();
    await waitFor(() => ligne("Français"));

    trierPar("Avancement");
    expect(ordreMatieres(NOMS)).toEqual(["Histoire", "Mathématiques", "Français"]);
    trierPar("Avancement");
    expect(ordreMatieres(NOMS)).toEqual(["Mathématiques", "Histoire", "Français"]);
  });

  it("porte `aria-sort` sur la colonne active, et sur elle seule", async () => {
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(TROIS));
    renderPage();
    await waitFor(() => ligne("Français"));

    trierPar("Acquis");
    const actives = within(screen.getByRole("table"))
      .getAllByRole("columnheader")
      .filter((c) => c.getAttribute("aria-sort") !== "none");
    expect(actives).toHaveLength(1);
    expect(actives[0]).toHaveAttribute("aria-sort", "descending");
  });

  it("trier ne referme pas la matière ouverte", async () => {
    // Le dépliage est repéré par son SLUG, pas par sa position : réordonner la table ne doit pas
    // faire disparaître le détail que Papa était en train de lire.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(overview(TROIS));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Histoire/ }));
    await waitFor(() => expect(ligne("Histoire")).toBeInTheDocument());

    trierPar("XP");
    const histoire = within(screen.getByRole("table")).getByRole("button", { name: /Histoire/ });
    expect(histoire).toHaveAttribute("aria-expanded", "true");
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
        subject({ notions: { consolidated: 1, fragile: 2, in_progress: 0, total: 5 }, engaged: 3, xp: 90, gaps_open: 1 }),
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
        // `to_reinforce` est l'UNION fragiles ∪ lacunes : « Homophones » porte une lacune SANS
        // être fragile, ce qui est exactement le cas que les deux colonnes existent pour montrer.
        to_reinforce: [
          { skill_id: 1, skill_name: "Accord", is_fragile: true, has_open_gap: false, has_active_mission: false },
          { skill_id: 3, skill_name: "Concordance", is_fragile: true, has_open_gap: false, has_active_mission: false },
          { skill_id: 6, skill_name: "Homophones", is_fragile: false, has_open_gap: true, has_active_mission: false },
        ],
        fragile_count: 2,
        open_gap_count: 1,
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

    // À renforcer : 2 — les fragiles, et « Homophones » qui n'en est pas n'y figure pas.
    const aRenforcer = screen.getByText(/À renforcer —/).closest("section") as HTMLElement;
    expect(within(aRenforcer).getAllByRole("listitem")).toHaveLength(2);
    expect(within(aRenforcer).queryByText("Homophones")).toBeNull();

    // Lacune : 1 — et c'est bien l'autre population. Sans ce bloc, la colonne « Lacune » serait le
    // seul nombre de l'écran dont le détail n'existe nulle part.
    const lacune = screen.getByText(/Lacune ouverte —/).closest("section") as HTMLElement;
    expect(lacune).toHaveTextContent("Lacune ouverte — 1");
    expect(within(lacune).getAllByRole("listitem")).toHaveLength(1);
    expect(within(lacune).getByText("Homophones")).toBeInTheDocument();
  });

  it("une notion des DEUX blocs n'a qu'UNE surface d'action, et sa raison écrite", async () => {
    // Le compte exige qu'elle figure dans les deux blocs ; l'écran exige qu'elle n'ait qu'un jeu
    // de boutons. Deux « Créer une mission » identiques à trois centimètres d'écart laisseraient
    // croire à deux actions différentes.
    vi.mocked(fetchProgressionOverview).mockResolvedValue(
      overview([subject({ notions: { consolidated: 0, fragile: 1, in_progress: 0, total: 5 }, gaps_open: 1 })]),
    );
    vi.mocked(fetchSubjectAnalysis).mockResolvedValue(
      analyse({
        to_reinforce: [
          { skill_id: 1, skill_name: "Accord", is_fragile: true, has_open_gap: true, has_active_mission: false },
        ],
        fragile_count: 1,
        open_gap_count: 1,
      }) as never,
    );
    renderPage();
    await waitFor(() => ligne("Français"));
    await ouvrir("Français");

    const lacune = (await screen.findByText(/Lacune ouverte —/)).closest("section") as HTMLElement;
    // Elle est bien comptée et nommée ici…
    expect(within(lacune).getAllByRole("listitem")).toHaveLength(1);
    expect(within(lacune).getByText("Accord")).toBeInTheDocument();
    expect(within(lacune).getByText(/aussi listée dans « À renforcer »/)).toBeInTheDocument();
    // …mais ses boutons ne sont rendus qu'une fois, dans l'autre bloc.
    expect(within(lacune).queryByRole("button")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Équiper" })).toHaveLength(1);
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
