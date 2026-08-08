import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiagnosticApercu, DiagnosticPortee, DiagnosticResult } from "@zetis/types";

vi.mock("../lib/diagnostic", () => ({
  fetchApercu: vi.fn(),
  fetchResultDetail: vi.fn(),
  fetchPortee: vi.fn(),
  generateDiagnostic: vi.fn(),
  rejectDiagnostic: vi.fn(),
}));

import { fetchApercu, fetchPortee, fetchResultDetail, rejectDiagnostic } from "../lib/diagnostic";
import { DiagnosticsPapaPage } from "./DiagnosticsPapaPage";

// Page Papa « Diagnostic » (adr-0043, session C).
//
// Les quatre verrous du chantier portent sur des confusions qui se réinstallent facilement :
// afficher un score qui n'existe pas, dériver la lacune du palier, recalculer le palier au lieu de
// le lire, et lisser une courbe qui doit rester un escalier.

const APERCU: DiagnosticApercu = {
  subjects: [
    { id: 3, name: "Mathématiques", slug: "mathematiques", a_un_diagnostic: true },
    { id: 5, name: "Français", slug: "francais", a_un_diagnostic: false },
  ],
  jauges: {
    matieres_mesurees: 1,
    matieres_total: 2,
    a_relire: 1,
    proposes_non_passes: 0,
    jamais_generees: 1,
    plus_ancienne_lecture: { subject: "Mathématiques", date: "2026-05-19T10:00:00Z", jours: 81 },
    lacunes_ouvertes: 2,
    lacunes_sans_contenu: 1,
    lots_declenches: 0,
  },
  rail: [
    {
      cle: "quiz-9",
      cran: "genere",
      quiz_id: 9,
      attempt_id: null,
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      date: "2026-08-06T09:00:00Z",
      notions_count: 8,
      score_percent: null,
      rang: null,
    },
    {
      cle: "attempt-4",
      cran: "passe",
      quiz_id: 7,
      attempt_id: 4,
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      date: "2026-05-19T10:00:00Z",
      notions_count: 8,
      score_percent: 70,
      rang: 2,
    },
  ],
  jamais_genere: [{ id: 5, name: "Français", slug: "francais" }],
};

const DETAIL: DiagnosticResult = {
  attempt_id: 4,
  quiz_id: 7,
  subject_id: 3,
  subject: "Mathématiques",
  score_percent: 70,
  completed_at: "2026-05-19T10:00:00Z",
  per_skill: [
    // 🔴 Le décor est construit pour que PALIER et LACUNE se contredisent deux fois. Sans ces deux
    // lignes, une page qui dériverait l'un de l'autre passerait le test sans qu'on le voie.
    { skill_id: 1, skill_name: "Comparer des relatifs", score: 100, status: "mastered", questions_count: 5 },
    { skill_id: 2, skill_name: "Symétrie centrale", score: 80, status: "solid", questions_count: 5 },
    { skill_id: 3, skill_name: "Proportionnalité", score: 40, status: "learning", questions_count: 5 },
    { skill_id: 4, skill_name: "Fractions", score: 60, status: "learning", questions_count: 5 },
  ],
  gaps: [
    // « en cours » (80 %) AVEC une lacune résolue — un score haut ne referme rien tout seul.
    { skill_id: 2, skill_name: "Symétrie centrale", severity: "medium", status: "resolved", content_state: "ok" },
    // « à renforcer » (40 %) avec une lacune ouverte SANS leçon.
    { skill_id: 3, skill_name: "Proportionnalité", severity: "high", status: "open", content_state: "aucune_lecon" },
    // ⚠️ « Fractions » est à 60 % — sous le seuil — et n'a AUCUNE lacune. Deux populations disjointes.
  ],
};

const PORTEE: DiagnosticPortee = {
  subject_id: 3,
  subject: "Mathématiques",
  attempts: [
    { attempt_id: 2, completed_at: "2026-03-31T10:00:00Z", score_percent: 60 },
    { attempt_id: 4, completed_at: "2026-05-19T10:00:00Z", score_percent: 70 },
  ],
  notions: [
    {
      skill_id: 1,
      skill_name: "Comparer des relatifs",
      points: [
        { attempt_id: 2, score: 50, questions_count: 2 },
        { attempt_id: 4, score: 100, questions_count: 5 },
      ],
      delta: 50,
    },
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <DiagnosticsPapaPage />
    </MemoryRouter>,
  );
}

/** La ligne d'une notion DANS le tableau de la station ①.
 *
 *  ⚠️ Scopé au `<table>`, et pas cherché dans la page entière : une notion est légitimement nommée
 *  à TROIS endroits — le tableau, sa carte de lacune, et la portée. Une requête globale rendrait
 *  « found multiple elements » et, pire, pourrait un jour trouver la bonne par accident. */
function ligneDeNotion(nom: string): HTMLElement {
  const table = document.querySelector("table")!;
  return within(table as HTMLElement).getByText(nom).closest("tr")!;
}

/** La station ② — les cartes de lacune, avec leurs badges et leurs gestes. */
function station(titre: string): HTMLElement {
  return screen.getByText(titre).closest("section")!;
}

describe("DiagnosticsPapaPage", () => {
  beforeEach(() => {
    // ⚠️ Sans ce reset, les compteurs d'appels s'ADDITIONNENT d'un test à l'autre : le fichier
    // n'active pas `clearMocks`, et `mockResolvedValue` ne remet pas l'historique à zéro. Deux
    // assertions de ce fichier comptent les appels — elles seraient fausses dès le second test.
    vi.clearAllMocks();
    vi.mocked(fetchApercu).mockResolvedValue(structuredClone(APERCU));
    vi.mocked(fetchResultDetail).mockResolvedValue(structuredClone(DETAIL));
    vi.mocked(fetchPortee).mockResolvedValue(structuredClone(PORTEE));
  });

  // ================================================================================================
  // VERROU 1 — aucun score pour un diagnostic non passé
  // ================================================================================================

  it("🔴 n'affiche AUCUN score pour un diagnostic non passé", async () => {
    // Le rail porte un diagnostic `genere` : il n'a jamais été passé, donc aucun score n'existe.
    // Le serveur sert `null` et non `0` exprès ; la page ne doit pas le rendre pour autant.
    vi.mocked(fetchApercu).mockResolvedValue({
      ...structuredClone(APERCU),
      rail: [structuredClone(APERCU.rail[0])],
    });
    renderPage();

    const ligne = (await screen.findByText("Mathématiques", { selector: "p" })).closest("button")!;

    expect(within(ligne).getByText("à relire")).toBeTruthy();
    expect(within(ligne).queryByText(/%/)).toBeNull();
    // …et le panneau non plus : ni score, ni palier, ni lacune.
    // ⚠️ Localisé par le CORPS du panneau, pas par son sur-titre : celui-ci reprend désormais la
    // mention du rail (« chez toi · à relire », adr-0045 Décision 6) et changerait encore si la
    // formulation bougeait. Le corps, lui, dit ce que le panneau EST.
    await screen.findByText(/attend ta relecture/);
    expect(screen.queryByText(/Ce qui a été mesuré/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+\s*%/);
  });

  // ================================================================================================
  // VERROU 2 — palier et lacune ne se dérivent PAS l'un de l'autre
  // ================================================================================================

  it("🔴 affiche une notion « à renforcer » SANS lacune ouverte, et l'inverse", async () => {
    renderPage();
    await screen.findByText("Ce qui a été mesuré");

    // « Fractions » : 60 %, sous le seuil, palier « à renforcer », et AUCUNE lacune. Une page qui
    // dériverait la colonne Lacune du score afficherait « ouverte » ici.
    const fractions = ligneDeNotion("Fractions");
    expect(within(fractions).getByText("à renforcer")).toBeTruthy();
    expect(within(fractions).getByText("—")).toBeTruthy();

    // « Symétrie centrale » : 80 %, palier « en cours », et une lacune RÉSOLUE. L'inverse exact —
    // un bon score ne referme pas une lacune, une lacune refermée ne remonte pas le palier.
    const symetrie = ligneDeNotion("Symétrie centrale");
    expect(within(symetrie).getByText("en cours")).toBeTruthy();
    expect(within(symetrie).getByText("résolue")).toBeTruthy();
  });

  // ================================================================================================
  // VERROU 3 — le palier vient du serveur, il n'est pas recalculé
  // ================================================================================================

  it("🔴 fait apparaître le palier « acquise » pour une notion ≥ 90", async () => {
    // C'est le palier que l'ancienne page perdait : elle recoloriait depuis le score avec ses
    // propres bornes (70/40), donc 95 % et 72 % s'affichaient identiques.
    renderPage();
    await screen.findByText("Ce qui a été mesuré");

    const ligne = ligneDeNotion("Comparer des relatifs");
    expect(within(ligne).getByText("acquise")).toBeTruthy();
    // Et le vocabulaire bancal n'apparaît nulle part.
    expect(document.body.textContent).not.toMatch(/fragile|solide/i);
  });

  // ================================================================================================
  // VERROU 4 — la portée est un ESCALIER, jamais une courbe
  // ================================================================================================

  it("🔴 trace la portée en marches, sans aucune courbe", async () => {
    renderPage();
    await screen.findByText(/La portée/);

    const traces = Array.from(document.querySelectorAll("svg path"));
    expect(traces.length).toBeGreaterThan(0);
    for (const trace of traces) {
      const d = trace.getAttribute("d") ?? "";
      // `C`/`S`/`Q`/`T` = courbes de Bézier. Leur absence EST l'invariant : une interpolation
      // douce inventerait des points intermédiaires que personne n'a mesurés.
      expect(d).not.toMatch(/[CSQTAcsqta]/);
      expect(d).toMatch(/^M .* L /);
    }
  });

  it("dit la granularité MIXTE au lieu de comparer en silence", async () => {
    // Le décor porte une passation à 2 questions et une à 5 : les marches n'ont pas la même
    // hauteur d'une colonne à l'autre, et la page doit le dire.
    renderPage();
    await screen.findByText(/Granularité mixte/);
  });

  it("remplace la portée par son absence expliquée à une seule passation", async () => {
    vi.mocked(fetchPortee).mockResolvedValue({ ...structuredClone(PORTEE), notions: [] });
    renderPage();

    await screen.findByText(/Un point ne fait pas une pente/);
    expect(document.querySelector("svg path")).toBeNull();
  });

  // ================================================================================================
  // Ce que la page S'INTERDIT
  // ================================================================================================

  it("dit que la 4ᵉ jauge vaut zéro par décision, jamais comme une panne", async () => {
    renderPage();
    // ⚠️ Titre et détail réécrits le 2026-08-08 : la relecture humaine n'a pas compris la carte
    // (« lots de production » = vocabulaire interne, « voir ③ » = pointeur mort depuis le haut de
    // la page). Le VERROU est inchangé — zéro par décision, jamais une panne.
    const titre = await screen.findByText(/Ce qu'une mesure a fait produire à ZETIS/);

    // ⚠️ Scopé à la CARTE : « c'est une décision » est désormais écrit à deux endroits — ici et
    // dans la station ③. C'est voulu (les deux disent la même chose), mais une requête globale
    // rendrait « found multiple elements ».
    expect(within(titre.closest("div")!).getByText(/c'est une décision/)).toBeTruthy();
    // La station ③ présente un MUR : elle explique, elle ne regrette pas.
    await screen.findByText(/c'est une décision, pas une panne/);
    expect(document.body.textContent).not.toMatch(/pas encore implémenté|à venir|dommage/i);
  });

  // ================================================================================================
  // Les focus du bandeau (adr-0045, Décisions 1 à 4)
  //
  // ⚠️ Le verrou CENTRAL de ce chantier ne vit pas ici mais dans `components/diagnostic/focus.test.ts` :
  // il exige une matière **générée et jamais passée**, que le décor de ce fichier n'a pas — ici
  // `matieres_total − matieres_mesurees = 2 − 1 = 1` et `jamais_generees = 1` tombent d'accord par
  // accident. Un décor dégénéré ne peut rien distinguer.
  // ================================================================================================

  it("🔴 la 4ᵉ jauge n'est JAMAIS cliquable, et elle dit POURQUOI sur la carte", async () => {
    renderPage();
    const titre = await screen.findByText(/Ce qu'une mesure a fait produire à ZETIS/);

    // La rendre cliquable ferait chercher une population qui n'existe pas, puis demander
    // l'ouverture d'un déclencheur écarté en connaissance de cause.
    expect(titre.closest("button")).toBeNull();
    // 🔴 Et la raison vit SUR la carte, sans renvoi. La version précédente disait « voir ③ » —
    // une section qu'on ne voit qu'après avoir sélectionné une passation passée et scrollé. La
    // relecture humaine a répondu « je ne comprends pas la 4ᵉ » : un pointeur mort n'explique rien.
    expect(within(titre.closest("div")!).getByText(/c'est une décision/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/voir ③/);
  });

  it("🔴 un focus actif dit ce qu'il montre ET comment en sortir", async () => {
    renderPage();
    const jauge = await screen.findByRole("button", {
      name: /Matières mesurées au moins une fois/,
    });

    fireEvent.click(jauge);

    // Un filtre NOMMÉ, jamais une troncature : sans cette phrase, des lignes disparaîtraient en
    // silence et la page ferait croire à une couverture complète.
    expect(screen.getByText(/matière dont ZETIS ne sait rien/)).toBeTruthy();
    expect(screen.getByText(/Tout revoir/)).toBeTruthy();
    expect(jauge.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByText(/Tout revoir/));
    expect(screen.queryByText(/matière dont ZETIS ne sait rien/)).toBeNull();
  });

  it("🔴 l'état vide d'un rail FILTRÉ n'emprunte pas la phrase d'un dépôt vide", async () => {
    renderPage();
    await screen.findByText("Jamais généré");

    // Le décor a deux diagnostics de Mathématiques. Un focus sur les matières non mesurées les
    // écarte tous les deux — mais le dépôt, lui, n'est pas vide.
    fireEvent.click(screen.getByRole("button", { name: /Matières mesurées au moins une fois/ }));

    expect(screen.getByText(/Aucun diagnostic ici/)).toBeTruthy();
    expect(screen.queryByText(/Aucun diagnostic pour l'instant/)).toBeNull();
  });

  it("🔴 la pastille dit « générées », jamais « mesurées »", async () => {
    renderPage();
    await screen.findByText(/Matières mesurées au moins une fois/);

    // `jamais_generees` compte les matières SANS AUCUN QUIZ ; le titre de la jauge compte celles
    // ayant une TENTATIVE. Deux populations, deux mots — les confondre rendait l'addition fausse
    // à l'écran.
    expect(screen.getByRole("button", { name: /jamais générée/ })).toBeTruthy();
    expect(screen.queryByText(/jamais mesurée/)).toBeNull();
  });

  it("le bloc « Jamais généré » subit la pastille de matière comme le rail", async () => {
    renderPage();
    await screen.findByText("Jamais généré");
    // ⚠️ Scopé au bloc : « Français » est légitimement écrit AUSSI dans les pastilles de matière.
    // Une requête globale rendrait « found multiple elements » — et pourrait un jour trouver la
    // bonne par accident.
    const bloc = screen.getByText("Jamais généré").parentElement!;
    expect(within(bloc).getByText("Français")).toBeTruthy();

    // Il faisait exception jusqu'ici : la page le passait BRUT là où le rail était filtré.
    fireEvent.click(screen.getByRole("button", { name: "Mathématiques" }));

    expect(screen.queryByText("Jamais généré")).toBeNull();
  });

  // ================================================================================================
  // Les crans non passés (adr-0045, Décisions 5 et 6)
  // ================================================================================================

  /** Un rail réduit à une seule ligne : la page la sélectionne donc d'office. */
  function railDe(cran: "genere" | "propose") {
    const base = structuredClone(APERCU.rail[0]);
    vi.mocked(fetchApercu).mockResolvedValue({
      ...structuredClone(APERCU),
      rail: [{ ...base, cle: `quiz-${cran}`, cran, quiz_id: 42 }],
    });
  }

  it("🔴 le cran « généré » porte DEUX actions", async () => {
    railDe("genere");
    renderPage();
    await screen.findByText(/attend ta relecture/);

    expect(screen.getByText(/Ouvrir dans la file de relecture/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refuser ce lot" })).toBeTruthy();
  });

  it("🔴 le cran « proposé » n'est plus un CUL-DE-SAC", async () => {
    railDe("propose");
    renderPage();
    await screen.findByText(/Aucune tentative n'a été enregistrée/);

    // Il n'avait AUCUNE action — pas une seule : le lien était rendu sous `{genere && …}`.
    // ⚠️ Une seule, et pas deux : « Voir la page de Massimo → » est DIFFÉRÉE (403 `require_child`).
    expect(screen.getByRole("button", { name: "Retirer la proposition" })).toBeTruthy();
    expect(screen.queryByText(/Voir la page de Massimo/)).toBeNull();
  });

  it("le sur-titre du panneau reprend MOT POUR MOT la mention du rail", async () => {
    railDe("propose");
    renderPage();
    await screen.findByText(/Aucune tentative n'a été enregistrée/);

    // Une ligne sélectionnée et son panneau ne doivent pas se nommer différemment.
    expect(screen.getAllByText("chez Massimo").length).toBeGreaterThanOrEqual(2);
  });

  it("🔴 aucun compte de jours d'attente, nulle part à l'écran", async () => {
    railDe("propose");
    renderPage();
    await screen.findByText(/Aucune tentative n'a été enregistrée/);

    // Un décompte de non-fait ne décroît que par le travail et grossit pendant une absence
    // (`CLAUDE.md` §gamification). La DATE de proposition dit le même fait sans la dette.
    // ⚠️ Porté sur le TEXTE RENDU et non sur une constante : un verrou lexical sur `CRAN_TEXTE`
    // ne verrait pas un compte calculé au moment du rendu.
    expect(document.body.textContent).not.toMatch(/depuis \d+|il y a \d+|\d+ jours? d'attente/i);
  });

  it("🔴 un diagnostic PASSÉ n'offre jamais de retrait", async () => {
    // Décor NON DÉGÉNÉRÉ : une passation ET un proposé. Sans le second, l'absence de bouton ne
    // prouverait rien — il n'y aurait simplement aucun cran non passé dans la page.
    vi.mocked(fetchApercu).mockResolvedValue({
      ...structuredClone(APERCU),
      rail: [
        structuredClone(APERCU.rail[1]),
        { ...structuredClone(APERCU.rail[0]), cle: "quiz-99", cran: "propose", quiz_id: 99 },
      ],
    });
    renderPage();
    await screen.findByText("Ce qui a été mesuré");

    // Une mesure existante ne se cache pas : le rail la garde au 3ᵉ cran quel que soit son statut.
    expect(screen.queryByRole("button", { name: "Retirer la proposition" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Refuser ce lot" })).toBeNull();
  });

  it("le retrait demande confirmation, puis appelle reject sur le bon quiz", async () => {
    railDe("propose");
    renderPage();
    await screen.findByText(/Aucune tentative n'a été enregistrée/);

    fireEvent.click(screen.getByRole("button", { name: "Retirer la proposition" }));
    // Rien n'est parti tant que le dialogue n'est pas confirmé.
    expect(rejectDiagnostic).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(within(screen.getByRole("dialog")).getByText("Retirer la proposition"));
    await waitFor(() => expect(rejectDiagnostic).toHaveBeenCalledWith(42));
  });

  it("sépare les deux badges de lacune sans contenu", async () => {
    renderPage();
    await screen.findByText("Ce qui a été ouvert");

    // `aucune leçon` commande de PRODUIRE ; `cours en brouillon` commanderait de VALIDER. Le décor
    // ne porte que le premier : on vérifie que le geste correspond au badge, pas un libellé
    // générique qui vaudrait pour les deux.
    const ouvertes = station("Ce qui a été ouvert");
    expect(within(ouvertes).getByText("aucune leçon")).toBeTruthy();
    expect(within(ouvertes).getByText(/Produire le quiz de cette notion/)).toBeTruthy();
    // …et le geste de l'AUTRE badge n'apparaît nulle part : les deux ne se confondent pas.
    expect(within(ouvertes).queryByText(/Valider le cours/)).toBeNull();
  });

  it("état vide : aucune passation, aucun score inventé", async () => {
    vi.mocked(fetchApercu).mockResolvedValue({
      ...structuredClone(APERCU),
      rail: [],
      jauges: { ...structuredClone(APERCU.jauges), matieres_mesurees: 0, plus_ancienne_lecture: null },
    });
    renderPage();

    await screen.findByText(/Rien à lire pour l'instant/);
    expect(screen.getByText(/Aucun diagnostic pour l'instant/)).toBeTruthy();
    expect(fetchResultDetail).not.toHaveBeenCalled();
  });

  it("les matières sans diagnostic restent listées, sans compteur", async () => {
    renderPage();
    await screen.findByText("Jamais généré");

    const bloc = screen.getByText("Jamais généré").parentElement!;
    expect(within(bloc).getByText("Français")).toBeTruthy();
    expect(within(bloc).getByText("aucun diagnostic")).toBeTruthy();
  });

  it("ne recharge PAS le détail quand la sélection ne change pas", async () => {
    renderPage();
    await waitFor(() => expect(fetchResultDetail).toHaveBeenCalledTimes(1));
    // Un second appel ici signalerait un effet qui se redéclenche sur une identité d'objet plutôt
    // que sur une valeur — le défaut qui fait clignoter un panneau sous le curseur.
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchResultDetail).toHaveBeenCalledTimes(1);
  });
});
