import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  type Coverage,
  type CoverageCell,
  type CoverageLesson,
  type ValidatedBy,
} from "@zetis/types";
import { CouverturePage } from "./CouverturePage";

vi.mock("../lib/production", async () => {
  const actual = await vi.importActual<typeof import("../lib/production")>("../lib/production");
  return {
    ...actual,
    fetchCoverage: vi.fn(),
    fetchOrphans: vi.fn(),
    generateForCell: vi.fn(),
    regenerateForCell: vi.fn(),
  };
});

import { fetchCoverage, fetchOrphans } from "../lib/production";

vi.mock("../lib/srsCards", () => ({ generateSkillCards: vi.fn() }));
import { generateSkillCards } from "../lib/srsCards";

vi.mock("../lib/curriculum", () => ({ validateAllLessons: vi.fn() }));
import { validateAllLessons } from "../lib/curriculum";

function cell(state: CoverageCell["state"], validated_by: ValidatedBy | null = null): CoverageCell {
  return { state, derived_at: "2026-07-20T10:00:00Z", validated_by, object_id: 1 };
}

function lesson(
  id: number,
  title: string,
  row_state: CoverageLesson["row_state"],
  cells: CoverageLesson["cells"],
): CoverageLesson {
  return {
    id,
    title,
    row_state,
    cells,
    notions: {
      cards: { covered: 1, total: 3 },
      capsules: { covered: 0, total: 3 },
      items: [
        { skill_id: 41, name: "Notion couverte", has_card: true, has_capsule: false },
        { skill_id: 42, name: "Notion nue", has_card: false, has_capsule: false },
      ],
    },
  };
}

function coverageWith(
  lessons: CoverageLesson[],
  totals: Partial<Coverage["totals"]> = {},
): Coverage {
  return {
    school_year: { id: 1, label: "2026-2027", level: "4e" },
    totals: {
      lessons: lessons.length,
      lessons_validated: lessons.length,
      courses_written: lessons.length,
      derivatives_percent: 42,
      pending_count: 0,
      stale_count: 0,
      orphan_count: 0,
      ...totals,
    },
    subjects: [
      { id: 1, name: "Français", slug: "francais", chapters: [{ id: 9, title: "Ch. 1", lessons }] },
    ],
  };
}

/** Une leçon par état de cellule : les cinq doivent coexister dans la matrice. */
const FIVE_STATES = lesson(1, "Toutes les couleurs", "ready", {
  cours: cell("validated", "parent"),
  quiz: cell("stale"),
  fiche: cell("pending"),
  mindmap: cell("absent"),
});
const BLOCKED = lesson(2, "Bloquée", "blocked_lesson", {
  cours: cell("blocked"),
  quiz: cell("blocked"),
  fiche: cell("blocked"),
  mindmap: cell("blocked"),
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CouverturePage />
    </MemoryRouter>,
  );
}

/** En vue d'ensemble, les matières arrivent REPLIÉES : le contenu de la matrice sort de l'arbre
 *  d'accessibilité, donc tout test qui l'interroge PAR RÔLE doit d'abord l'ouvrir. Le bouton
 *  d'en-tête se distingue de la pastille de filtre homonyme par ses compteurs de leçons. */
async function expandSubject(name = "Français") {
  fireEvent.click(await screen.findByRole("button", { name: new RegExp(`${name}.*leçon`) }));
}

/** Les pastilles de filtre, à l'exclusion des en-têtes de matière du même nom. */
function chips() {
  return within(screen.getByRole("group", { name: "Filtrer par matière" }));
}

beforeEach(() => {
  vi.mocked(fetchOrphans).mockResolvedValue([]);
});

describe("CouverturePage — matrice", () => {
  it("rend les cinq états de cellule", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES, BLOCKED]));
    const { container } = renderPage();
    await screen.findByText("Toutes les couleurs");

    for (const state of ["validated", "stale", "pending", "absent"]) {
      expect(container.querySelector(`[data-state="${state}"]`)).not.toBeNull();
    }
    // `blocked` n'est pas interactif : rendu comme un point inerte, sans data-state.
    expect(screen.getByText("Bloquée")).toBeTruthy();
  });

  it("une ligne bloquée n'expose AUCUN `+` — rien n'y est générable", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED]));
    const { container } = renderPage();
    await screen.findByText("Bloquée");
    expect(container.querySelectorAll('[data-state="absent"]')).toHaveLength(0);
  });
});

describe("CouverturePage — cellules cliquables", () => {
  it("une cellule renseignée mène à SON objet sur la page du type", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    const { container } = renderPage();
    await screen.findByText("Toutes les couleurs");

    // ✓ Cours → le référentiel, sur la leçon.
    const cours = container.querySelector('[data-state="validated"]')?.closest("a");
    expect(cours?.getAttribute("href")).toBe("/programme?subject=1&chapter=9&lesson=1");
    // ⏳ Fiche → la page Fiches, ciblée sur la fiche.
    const fiche = container.querySelector('[data-state="pending"]')?.closest("a");
    expect(fiche?.getAttribute("href")).toBe("/fiches?subject=1&focus=1");
  });

  it("une cellule bloquée ou absente n'est pas un lien", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED]));
    const { container } = renderPage();
    await screen.findByText("Bloquée");
    // Seul le badge « À valider » est un lien sur une ligne bloquée ; aucune cellule ne l'est.
    const cellLinks = [...container.querySelectorAll("td a")].filter((a) =>
      a.querySelector("[data-state]"),
    );
    expect(cellLinks).toHaveLength(0);
  });
});

describe("CouverturePage — badge de déblocage", () => {
  it("une leçon en brouillon porte un badge « À valider » SUR LA MÊME LIGNE, lié à Programme", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED]));
    renderPage();
    const title = await screen.findByText("Bloquée");
    await expandSubject();

    const link = screen.getByRole("link", { name: /À valider/ });
    // Même cellule que le titre = même ligne à l'écran (et non une sous-ligne).
    expect(link.closest("td")).toBe(title.closest("td"));
    // Le lien porte les trois identifiants nécessaires au ciblage dans Programme.
    expect(link.getAttribute("href")).toBe("/programme?subject=1&chapter=9&lesson=2");
  });

  it("« cours à rédiger » n'est PAS un lien — l'action est ici, dans la colonne Cours", async () => {
    const noCourse = lesson(7, "Sans cours", "blocked_no_course", {
      cours: cell("absent"),
      quiz: cell("blocked"),
      fiche: cell("blocked"),
      mindmap: cell("blocked"),
    });
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([noCourse]));
    renderPage();
    await screen.findByText("Sans cours");

    expect(screen.getByText("Cours à rédiger")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Cours à rédiger/ })).toBeNull();
  });
});

describe("CouverturePage — validation en lot", () => {
  it("le bouton n'apparaît que s'il y a des brouillons, et annonce leur nombre", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");
    // Aucune leçon en brouillon ici → pas de bouton : une action à zéro n'est pas une action.
    expect(screen.queryByRole("button", { name: /Valider les/ })).toBeNull();
  });

  it("confirme AVANT de valider, puis appelle le lot sur le bon chapitre", async () => {
    vi.mocked(validateAllLessons).mockResolvedValue({ validated_count: 1 } as never);
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED, FIVE_STATES]));
    renderPage();
    await screen.findByText("Bloquée");
    await expandSubject();

    fireEvent.click(screen.getByRole("button", { name: /Valider les 1 leçons/ }));
    // Rien n'est parti tant que la confirmation n'est pas donnée.
    expect(validateAllLessons).not.toHaveBeenCalled();
    // La modale doit se LIRE : le compte détaché, et les deux faits séparés du pavé.
    const dialog = screen.getByRole("dialog");
    expect(screen.getByText("Valider les leçons du chapitre")).toBeTruthy();
    expect(within(dialog).getByText("1")).toBeTruthy();
    expect(within(dialog).getByText(/Rien n'est généré/)).toBeTruthy();
    expect(within(dialog).getByText(/Provenance/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Valider les 1 leçons$/ }));
    await waitFor(() => expect(validateAllLessons).toHaveBeenCalledWith(9));
  });
});

describe("CouverturePage — nuancier de provenance (§F)", () => {
  it("les trois valeurs de `validated_by` produisent trois rendus distincts", async () => {
    const row = lesson(3, "Provenances", "ready", {
      cours: cell("validated", "parent"),
      quiz: cell("validated", "system"),
      fiche: cell("validated", "parent_bulk"),
      mindmap: cell("absent"),
    });
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([row]));
    const { container } = renderPage();
    await screen.findByText("Provenances");

    const classes = ["parent", "system", "parent_bulk"].map(
      (by) => container.querySelector(`[data-provenance="${by}"]`)?.className ?? "",
    );
    expect(new Set(classes).size).toBe(3);
  });

  it("`validated_by` à null sur un objet validé ne casse pas le rendu", async () => {
    const row = lesson(4, "Antérieure", "ready", {
      cours: cell("validated", null),
      quiz: cell("validated", null),
      fiche: cell("validated", null),
      mindmap: cell("validated", null),
    });
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([row]));
    const { container } = renderPage();
    await screen.findByText("Antérieure");

    const unknown = container.querySelector('[data-provenance="unknown"]');
    expect(unknown).not.toBeNull();
    // Le `title` vit sur l'enveloppe cliquable, pas sur la pastille : il couvre la même zone.
    expect(unknown?.closest("[title]")?.getAttribute("title")).toContain("provenance inconnue");
  });
});

describe("CouverturePage — colonnes notion-centrées", () => {
  it("la fraction ouvre le détail par notion, et dit laquelle manque", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");

    fireEvent.click(screen.getAllByText("1/3")[0]);
    expect(await screen.findByText("Notion couverte")).toBeTruthy();
    expect(screen.getByText("Notion nue")).toBeTruthy();
    // La notion déjà couverte n'offre pas de bouton de génération : on ne régénère pas ce qui
    // existe — mais elle mène à SES cartes, sur la page Cartes de révision.
    expect(screen.getAllByRole("button", { name: "Générer" })).toHaveLength(1);
    const covered = screen.getByRole("link", { name: /couverte/ });
    // La matière DOIT voyager : les sections sont repliées par défaut, sans elle la ligne
    // visée ne serait pas rendue du tout.
    expect(covered.getAttribute("href")).toBe("/cartes-revision?subject=1&focus=41");
  });

  it("les cartes se génèrent d'un clic, sur la notion choisie", async () => {
    vi.mocked(generateSkillCards).mockResolvedValue({} as never);
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");

    fireEvent.click(screen.getAllByText("1/3")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Générer" }));
    // `42` = la notion NUE, pas la première de la liste : la cible est bien celle du bouton.
    await waitFor(() => expect(generateSkillCards).toHaveBeenCalledWith(42));
  });

  it("les capsules ne se génèrent PAS d'un clic : lien vers le compositeur, avec la notion", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");

    fireEvent.click(screen.getAllByText("0/3")[0]);
    const links = await screen.findAllByRole("link", { name: /Composer/ });
    // `skill` DOIT voyager : sans lui la capsule ne serait rattachée à aucune notion et ne
    // compterait jamais dans cette matrice.
    for (const link of links) {
      const href = link.getAttribute("href") ?? "";
      expect(href).toContain("/capsules?");
      expect(href).toMatch(/skill=\d+/);
      expect(href).toContain("compose=1");
    }
    // Aucun bouton de génération directe pour les capsules — l'instruction est à Papa.
    expect(screen.queryByRole("button", { name: "Générer" })).toBeNull();
  });
});

describe("CouverturePage — bandeaux d'anomalie", () => {
  it("masqués quand leur compteur est nul", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");
    expect(screen.queryByText(/n'atteignent pas Massimo/)).toBeNull();
    expect(screen.queryByText(/orphelin/)).toBeNull();
  });

  it("affichés dès que le compteur est non nul", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(
      coverageWith([FIVE_STATES], { pending_count: 4, orphan_count: 2 }),
    );
    renderPage();
    await waitFor(() => expect(screen.getByText(/n'atteignent pas Massimo/)).toBeTruthy());
    expect(screen.getByText(/orphelin/)).toBeTruthy();
  });

  it("aucun agrégat de provenance n'est affiché (§F.2)", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");
    // Ni compteur, ni filtre, ni relance sur « validé en lot » / « jamais relu ».
    expect(screen.queryByText(/validés en lot/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /jamais relu/i })).toBeNull();
  });
});

describe("CouverturePage — pastilles de matière", () => {
  const MATHS = {
    id: 2,
    name: "Mathématiques",
    slug: "mathematiques",
    chapters: [{ id: 20, title: "Ch. A", lessons: [FIVE_STATES] }],
  };

  it("les matières SURVIVENT au filtrage serveur, qui n'en renvoie plus qu'une", async () => {
    // Le piège : `GET /coverage?subject_id=` restreint aussi `subjects`. Sans mémorisation de la
    // liste non filtrée, on ne pourrait plus passer d'une matière à l'autre sans repasser par
    // « Toutes ».
    const both = coverageWith([FIVE_STATES]);
    vi.mocked(fetchCoverage)
      .mockResolvedValueOnce({ ...both, subjects: [...both.subjects, MATHS] })
      .mockResolvedValue({ ...both, subjects: [MATHS] });

    renderPage();
    // Scopé au groupe de pastilles : l'en-tête de la matrice porte le même nom, et il apparaît
    // AVANT la pastille (la liste des matières est posée par un effet, un cran plus tard).
    await waitFor(() => expect(chips().getByRole("button", { name: /Mathématiques/ })).toBeTruthy());
    const mathsChip = chips().getByRole("button", { name: /Mathématiques/ });
    fireEvent.click(mathsChip);

    await waitFor(() => expect(mathsChip.getAttribute("aria-pressed")).toBe("true"));
    expect(chips().getByRole("button", { name: /Français/ })).toBeTruthy();
    expect(chips().getByRole("button", { name: /Toutes les matières/ })).toBeTruthy();
  });
});

describe("CouverturePage — expanders par matière", () => {
  function header(name = "Français") {
    return screen.getByRole("button", { name: new RegExp(`${name}.*leçon`) });
  }

  it("en vue d'ensemble tout est REPLIÉ, et l'en-tête rappelle les anomalies", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED, FIVE_STATES]));
    renderPage();
    await screen.findByText("Bloquée");

    expect(header().getAttribute("aria-expanded")).toBe("false");
    // Une leçon non validée, une périmée, une à relire — comptées sur la matière entière.
    expect(header().textContent).toContain("🔒 1");
    expect(header().textContent).toContain("⚠ 1");
    expect(header().textContent).toContain("⏳ 1");

    fireEvent.click(header());
    expect(header().getAttribute("aria-expanded")).toBe("true");
  });

  it("un filtre d'état DÉPLIE tout — on ne cache pas ce qui vient d'être demandé", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED, FIVE_STATES]));
    renderPage();
    await screen.findByText("Bloquée");
    expect(header().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: /Périmés \(/ }));
    await waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("true"));
  });

  it("changer de contexte rend la main au défaut, sans garder un repli devenu absurde", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([BLOCKED, FIVE_STATES]));
    renderPage();
    await screen.findByText("Bloquée");

    fireEvent.click(header()); // ouverture manuelle…
    expect(header().getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /À relire \(/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Tout \(/ }));
    // …oubliée au retour en vue d'ensemble : tout est replié à nouveau.
    await waitFor(() => expect(header().getAttribute("aria-expanded")).toBe("false"));
  });
});

describe("CouverturePage — KPI cliquables", () => {
  it("un KPI filtre la matrice sur son COMPLÉMENT, et un second clic la rouvre", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES, BLOCKED]));
    renderPage();
    await screen.findByText("Toutes les couleurs");

    const kpi = screen.getByRole("button", { name: /Leçons validées/ });
    expect(kpi.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(kpi);
    // « Leçons validées » ouvre les NON validées : la ligne bloquée reste, l'autre part.
    await waitFor(() => expect(screen.queryByText("Toutes les couleurs")).toBeNull());
    expect(screen.getByText("Bloquée")).toBeTruthy();
    expect(kpi.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(kpi);
    await waitFor(() => expect(screen.getByText("Toutes les couleurs")).toBeTruthy());
  });

  it("un KPI qui filtre n'annonce PAS `aria-expanded` — rien n'est déplié sous lui", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue(coverageWith([FIVE_STATES]));
    renderPage();
    await screen.findByText("Toutes les couleurs");
    expect(
      screen.getByRole("button", { name: /Cours rédigés/ }).hasAttribute("aria-expanded"),
    ).toBe(false);
  });
});

describe("CouverturePage — états", () => {
  it("aucune année active → message explicite, pas une matrice vide", async () => {
    vi.mocked(fetchCoverage).mockResolvedValue({
      school_year: null,
      totals: {
        lessons: 0,
        lessons_validated: 0,
        courses_written: 0,
        derivatives_percent: 0,
        pending_count: 0,
        stale_count: 0,
        orphan_count: 0,
      },
      subjects: [],
    });
    renderPage();
    await waitFor(() => expect(screen.getByText(/Aucune année scolaire active/)).toBeTruthy());
  });
});
