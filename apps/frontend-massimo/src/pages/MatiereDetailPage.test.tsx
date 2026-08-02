import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReviewsSummary, SubjectPanoply } from "@zetis/types";
import { MatiereDetailPage } from "./MatiereDetailPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

// `PanoplyError` est utilisée en `instanceof` par le hook : le mock doit fournir une VRAIE
// classe, sinon le 404 ne serait jamais reconnu et la page afficherait un état vide muet.
vi.mock("../lib/panoply", () => ({
  PanoplyError: class PanoplyError extends Error {
    constructor(public status: number) {
      super(`Erreur ${status}`);
    }
  },
  fetchSubjectPanoply: vi.fn(),
  createContentRequest: vi.fn(),
}));
vi.mock("../lib/reviews", () => ({ fetchReviewsSummary: vi.fn() }));

import { PanoplyError, createContentRequest, fetchSubjectPanoply } from "../lib/panoply";
import { fetchReviewsSummary } from "../lib/reviews";

// SVT : deux chapitres, trois notions, chacune choisie pour un cas précis.
const PANOPLY: SubjectPanoply = {
  subject: { subject_id: 1, name: "SVT", slug: "svt" },
  chapters: [
    {
      chapter_id: 10,
      title: "La cellule",
      notions: [
        {
          // Panoplie COMPLÈTE → aucun bouton « tout ce qui manque ».
          skill_id: 1,
          name: "Mitose",
          status: "solid",
          actions: [
            { kind: "cours", available: true, lesson_id: 3 },
            { kind: "eli5", available: true },
            { kind: "fiche", available: true, fiche_id: 5 },
            { kind: "capsule", available: true, capsule_id: 6 },
            { kind: "mindmap", available: true, mindmap_id: 7 },
            { kind: "revision", available: true },
            { kind: "quiz", available: true, quiz_id: 8 },
          ],
        },
        {
          // Le cours (PREMIER de la liste) manque, la fiche existe → l'accent doit aller à
          // la fiche, et « tout ce qui manque » doit DÉDUPLIQUER cours+eli5.
          skill_id: 2,
          name: "Photosynthèse",
          status: "weak",
          actions: [
            { kind: "cours", available: false },
            { kind: "eli5", available: false },
            { kind: "fiche", available: true, fiche_id: 9 },
            { kind: "capsule", available: false },
            { kind: "mindmap", available: false },
            { kind: "revision", available: false },
            { kind: "quiz", available: false },
          ],
        },
      ],
    },
    {
      chapter_id: 20,
      title: "Nutrition végétale",
      notions: [
        {
          skill_id: 3,
          name: "Racines",
          status: "unknown",
          actions: [
            { kind: "cours", available: true, lesson_id: 4 },
            { kind: "eli5", available: true },
            { kind: "fiche", available: false },
            { kind: "capsule", available: false },
            { kind: "mindmap", available: false },
            { kind: "revision", available: false },
            { kind: "quiz", available: false },
          ],
        },
      ],
    },
  ],
};

const SUMMARY: ReviewsSummary = {
  total_due: 42,
  flash_size: 5,
  new_count: 3,
  subjects: [
    // ⚠️ `due_count` volontairement ÉNORME et distinct de `session_size` : c'est ce qui rend
    // le test-verrou capable de voir la différence.
    { slug: "svt", name: "SVT", due_count: 42, new_count: 3, session_size: 8, has_cards: true },
  ],
};

function renderPage(slug = "svt") {
  return render(
    <MemoryRouter initialEntries={[`/subjects/${slug}`]}>
      <Routes>
        <Route path="/subjects/:slug" element={<MatiereDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Déplie un chapitre, puis ouvre le panneau d'une de ses notions.
 *
 *  ⚠️ TOUS les chapitres sont repliés au chargement (décision du 2026-08-01) : aucune notion
 *  n'est dans le DOM tant qu'on n'a pas déplié son chapitre. D'où le paramètre obligatoire. */
async function ouvrirNotion(chapitre: RegExp, nom: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name: chapitre }));
  const ligne = await screen.findByRole("button", { name: nom });
  fireEvent.click(ligne);
  return ligne;
}

/** Le bouton d'ACTIVITÉ, et non le bouton « demander » voisin — dont le libellé accessible
 *  (« Demander Lire la fiche à ZETIS ») contient le même texte. */
function activite(label: string) {
  return screen.getByRole("button", { name: new RegExp(`^${label}`) });
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchSubjectPanoply).mockReset().mockResolvedValue(PANOPLY);
  vi.mocked(fetchReviewsSummary).mockReset().mockResolvedValue(SUMMARY);
  vi.mocked(createContentRequest).mockReset().mockResolvedValue({ requested: [] });
});

// --- Verrous de doctrine (ADR-0024 §5) ---------------------------------------------------

describe("MatiereDetailPage — ce que la page ne dit JAMAIS", () => {
  it("n'affiche ni niveau, ni XP, ni pourcentage, ni barre de progression", async () => {
    // La version d'avant ce chantier ouvrait sur « Niveau 5 · 320 XP ». La progression, c'est
    // la Galaxy ; cette page décrit un CATALOGUE, elle ne note pas Massimo.
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/niveau|\bxp\b|%|mastery|score/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("n'affiche AUCUN rouge et AUCUN or (l'or est réservé à « ZETIS parle »)", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.innerHTML).not.toMatch(/red-|rose-|ffcf47/i);
  });

  it("ne formule jamais une absence comme un échec", async () => {
    const { container } = renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    // « manque » est autorisé — « tout ce qui manque » est le libellé de la spec. Ce qui est
    // interdit, c'est le vocabulaire qui désigne l'enfant : manquant, raté, échec.
    expect(container.textContent).not.toMatch(/manquant|raté|échec|erreur|retard|nul/i);
  });

  it("affiche le plafond de session, JAMAIS l'arriéré", async () => {
    // ⚠️ TEST-VERROU. `due_count = 42` est l'arriéré : l'afficher serait la pression
    // quotidienne que `CLAUDE.md` interdit. `session_size = 8` est ce que la session servira.
    const { container } = renderPage();
    await screen.findByLabelText("8 cartes à revoir en SVT");
    expect(container.textContent).not.toContain("42");
  });

  it("ne rend PAS la carte de révision quand il n'y a rien à revoir", async () => {
    // « Jamais rendue à vide » : une carte à zéro serait un reproche déguisé.
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      ...SUMMARY,
      subjects: [{ ...SUMMARY.subjects[0], due_count: 0, session_size: 0 }],
    });
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/à revoir/);
  });
});

// --- En-tête et états --------------------------------------------------------------------

describe("MatiereDetailPage — en-tête et états", () => {
  it("compte le CATALOGUE : 2 chapitres · 3 notions", async () => {
    renderPage();
    expect(await screen.findByText(/2 chapitres · 3 notions/)).toBeInTheDocument();
  });

  it("le décompte ne bouge PAS quand on filtre", async () => {
    // Sinon la recherche donnerait l'impression que la matière rétrécit.
    renderPage();
    await screen.findByText(/2 chapitres · 3 notions/);
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    expect(screen.getByText(/2 chapitres · 3 notions/)).toBeInTheDocument();
  });

  it("404 : la matière n'existe pas, avec un retour vers les Matières", async () => {
    vi.mocked(fetchSubjectPanoply).mockRejectedValue(new PanoplyError(404));
    renderPage("latin");
    expect(await screen.findByText(/n'existe pas encore/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Matières/ }).getAttribute("href")).toBe("/matieres");
  });

  it("matière sans rien de validé : état POSITIF, pas une erreur", async () => {
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({ ...PANOPLY, chapters: [] });
    const { container } = renderPage();
    expect(await screen.findByText(/arrivent bientôt/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/erreur|vide|aucun contenu/i);
  });

  it("une panne du résumé de révision n'emporte pas la page", async () => {
    // `allSettled` et jamais `all` : Massimo doit voir sa matière, même dégradée.
    vi.mocked(fetchReviewsSummary).mockRejectedValue(new Error("réseau"));
    renderPage();
    expect(await screen.findByRole("heading", { name: "SVT" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /La cellule/ }));
    expect(screen.getByRole("button", { name: /Mitose/ })).toBeInTheDocument();
  });
});

// --- La bande « ce que ZETIS a pour cette matière » ---------------------------------------

describe("MatiereDetailPage — ce que ZETIS a pour la matière", () => {
  it("annonce chaque type de contenu, avec son compte", async () => {
    // Fixture SVT : Mitose a tout (cours l.3, fiche 5, capsule 6, mindmap 7, quiz 8),
    // Photosynthèse a une fiche (9), Racines un cours (leçon 4). Plus 8 cartes à revoir.
    renderPage();
    expect(await screen.findByLabelText("2 cours en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("2 fiches en SVT")).toBeInTheDocument();
    // Regex : la capsule n'est pas ouvrable depuis ici, son libellé porte donc un suffixe.
    expect(screen.getByLabelText(/1 capsule en SVT/)).toBeInTheDocument();
    expect(screen.getByLabelText("1 carte en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("1 quiz en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("8 cartes à revoir en SVT")).toBeInTheDocument();
  });

  it("compte des RESSOURCES, pas des notions — deux notions d'une même leçon font UNE fiche", async () => {
    // ⚠️ LE test de ce lot. Plusieurs notions partagent la même leçon, donc la même fiche et le
    // même cours : le serveur renvoie le MÊME `fiche_id` sur chacune. Sans déduplication, le
    // compte serait gonflé d'autant de fois que la leçon enseigne de notions.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 10,
          title: "La cellule",
          notions: [1, 2, 3].map((skill_id) => ({
            skill_id,
            name: `Notion ${skill_id}`,
            status: "weak" as const,
            actions: [
              // Même leçon, même fiche : trois notions, UNE ressource de chaque.
              { kind: "cours" as const, available: true, lesson_id: 77 },
              { kind: "fiche" as const, available: true, fiche_id: 88 },
            ],
          })),
        },
      ],
    });
    renderPage();

    expect(await screen.findByLabelText("1 cours en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("1 fiche en SVT")).toBeInTheDocument();
    // Le piège qu'on évite : « 3 cours · 3 fiches ».
    expect(screen.queryByLabelText(/3 cours/)).toBeNull();
    expect(screen.queryByLabelText(/3 fiches/)).toBeNull();
  });

  it("les types adressables sont des liens vers leur surface MATIÈRE", async () => {
    renderPage();
    const lien = (label: string) => screen.getByLabelText(label).getAttribute("href");
    await screen.findByLabelText("2 cours en SVT");

    expect(lien("2 cours en SVT")).toBe("/subjects/svt/cours");
    expect(lien("2 fiches en SVT")).toBe("/fiches/svt");
    expect(lien("1 carte en SVT")).toBe("/mindmaps/svt");
    expect(lien("8 cartes à revoir en SVT")).toBe("/revision?subject=svt&from=svt");
  });

  it("le quiz ouvre les quiz DE LA MATIÈRE, pas la grille de toutes", async () => {
    // ⚠️ Régression signalée le 2026-08-01 : « le KPI 1 quiz ne marche pas ». Le compte était
    // juste, mais la pastille ne menait nulle part — `/quiz` gardait la matière en état
    // interne. Un lien profond `?subject=` a été ajouté à `QuizPage`.
    renderPage();
    const quiz = await screen.findByLabelText("1 quiz en SVT");
    expect(quiz.getAttribute("href")).toBe("/quiz?subject=svt&from=svt");
  });

  it("une pastille non ouvrable est visiblement INERTE, jamais muette", async () => {
    // La capsule n'a aucune route par matière (`/capsules` est global). Elle doit donc se
    // distinguer à l'œil — sinon elle se lit comme une panne, ce qui est EXACTEMENT ce qui
    // s'est produit avec le quiz : ressembler à un lien sans en être un est un bug d'UI.
    renderPage();
    const capsule = await screen.findByLabelText(/1 capsule en SVT/);

    expect(capsule.tagName).not.toBe("A");
    expect(capsule.className).toContain("border-dashed");
    // Et l'`aria-label` le DIT, au lieu de laisser un lecteur d'écran deviner.
    expect(capsule.getAttribute("aria-label")).toContain("pas encore ouvrable");
    expect(capsule.textContent).toContain("1");
  });

  it("un type sans rien n'a PAS de pastille", async () => {
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 10,
          title: "La cellule",
          notions: [
            {
              skill_id: 1,
              name: "Mitose",
              status: "weak",
              actions: [{ kind: "cours", available: true, lesson_id: 3 }],
            },
          ],
        },
      ],
    });
    renderPage();

    expect(await screen.findByLabelText("1 cours en SVT")).toBeInTheDocument();
    expect(screen.queryByLabelText(/fiche/)).toBeNull();
    expect(screen.queryByLabelText(/capsule/)).toBeNull();
    expect(screen.queryByLabelText(/quiz/)).toBeNull();
  });

  it("la bande DISPARAÎT quand la matière n'a encore rien", async () => {
    // Une matière vide n'affiche pas six zéros : ce serait dresser la liste de ce qui manque.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({ ...PANOPLY, chapters: [] });
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      ...SUMMARY,
      subjects: [{ ...SUMMARY.subjects[0], due_count: 0, session_size: 0 }],
    });
    renderPage();

    await screen.findByText(/arrivent bientôt/);
    expect(screen.queryByLabelText(/en SVT/)).toBeNull();
  });

  it("les nombres ne bougent PAS pendant une recherche", async () => {
    // La bande décrit la MATIÈRE, pas les résultats : elle est calculée sur les chapitres
    // bruts, jamais sur les chapitres filtrés.
    renderPage();
    await screen.findByLabelText("2 fiches en SVT");
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    expect(screen.getByLabelText("2 fiches en SVT")).toBeInTheDocument();
    expect(screen.getByLabelText("2 cours en SVT")).toBeInTheDocument();
  });

  it("ELI5 n'est PAS dans la bande — ce n'est pas un produit du catalogue", async () => {
    // Il ne stocke rien : il se génère à la volée. Le compter n'aurait aucun sens, et le
    // serveur ne lui donne d'ailleurs aucun identifiant.
    renderPage();
    await screen.findByLabelText("2 cours en SVT");
    expect(screen.queryByLabelText(/explication/)).toBeNull();
  });
});

// --- Témoin « chapitre déjà alimenté » ---------------------------------------------------

describe("MatiereDetailPage — quels chapitres ont déjà de quoi travailler", () => {
  it("un chapitre alimenté annonce COMBIEN de ses notions sont prêtes", async () => {
    // « La cellule » : Mitose (panoplie complète) + Photosynthèse (une fiche) → 2 prêtes.
    // « Nutrition végétale » : Racines (cours + ELI5) → 1 prête.
    renderPage();
    const cellule = await screen.findByRole("button", { name: /La cellule/ });
    expect(cellule.textContent).toContain("2 notions");
    expect(cellule.textContent).toContain("2 prêtes");
    expect(screen.getByRole("button", { name: /Nutrition végétale/ }).textContent).toContain(
      "1 prête",
    );
  });

  it("c'est un COMPTE, jamais un ratio — un « 2 sur 3 » serait un score", async () => {
    // ⚠️ TEST-VERROU (ADR-0024 §5). La Galaxy compte des étoiles allumées, elle ne note pas
    // Massimo ; cet en-tête suit la même règle. Un dénominateur transformerait le témoin en
    // barre de progression déguisée.
    const { container } = renderPage();
    await screen.findByRole("button", { name: /La cellule/ });
    expect(container.textContent).not.toMatch(/\bsur \d|\d\s*\/\s*\d|%/);
  });

  it("un chapitre sans RIEN de prêt reste identique aux autres — ni témoin, ni grisé", async () => {
    // L'absence de contenu est l'état du catalogue de Papa, pas un manque de l'enfant. Un
    // chapitre entier atténué se lirait comme un reproche.
    vi.mocked(fetchSubjectPanoply).mockResolvedValue({
      ...PANOPLY,
      chapters: [
        {
          chapter_id: 30,
          title: "Respiration",
          notions: [
            {
              skill_id: 9,
              name: "Poumons",
              status: "unknown",
              actions: [
                { kind: "cours", available: false },
                { kind: "eli5", available: false },
                { kind: "fiche", available: false },
                { kind: "capsule", available: false },
                { kind: "mindmap", available: false },
                { kind: "revision", available: false },
                { kind: "quiz", available: false },
              ],
            },
          ],
        },
      ],
    });
    renderPage();

    const chapitre = await screen.findByRole("button", { name: /Respiration/ });
    expect(chapitre.textContent).toContain("1 notion");
    expect(chapitre.textContent).not.toMatch(/prête/);
    // Aucune atténuation : il se rend comme n'importe quel autre chapitre.
    expect(chapitre.className).not.toMatch(/opacity|grayscale/);
  });

  it("pendant une recherche, le témoin décrit ce qui est TROUVÉ", async () => {
    // Les deux nombres de l'en-tête doivent parler du même ensemble, sinon ils se
    // contredisent : « 1 notion · 2 prêtes » n'aurait aucun sens.
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });

    const cellule = screen.getByRole("button", { name: /La cellule/ });
    expect(cellule.textContent).toContain("1 notion");
    expect(cellule.textContent).toContain("1 prête");
  });
});

// --- Recherche ---------------------------------------------------------------------------

describe("MatiereDetailPage — recherche locale", () => {
  it("« photosynthese » trouve « Photosynthèse » et fait DISPARAÎTRE les autres chapitres", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });

    expect(screen.getByRole("button", { name: /Photosynthèse/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Racines/ })).toBeNull();
    // Le chapitre sans trouvaille ne se contente pas de se replier : il sort de la vue.
    expect(screen.queryByText("Nutrition végétale")).toBeNull();
    expect(screen.getByText(/1 notion trouvée/)).toBeInTheDocument();
  });

  it("surligne la correspondance dans le nom, accent compris", async () => {
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "photosynthese" },
    });
    const mark = container.querySelector("mark");
    // Le texte surligné est l'ORIGINAL accentué : la carte d'offsets fait son travail.
    expect(mark?.textContent).toBe("Photosynthèse");
  });

  it("`Échap` efface la recherche et restaure l'arbre", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    const champ = screen.getByLabelText("Cherche une notion");
    fireEvent.change(champ, { target: { value: "photosynthese" } });
    expect(screen.queryByText("Nutrition végétale")).toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(await screen.findByText("Nutrition végétale")).toBeInTheDocument();
    expect((champ as HTMLInputElement).value).toBe("");
  });

  it("aucun résultat : message de renvoi vers le chat, jamais un échec", async () => {
    renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    fireEvent.change(screen.getByLabelText("Cherche une notion"), {
      target: { value: "zzz" },
    });
    expect(screen.getByText(/Rien avec ce mot-là en SVT/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "chat" }).getAttribute("href")).toBe("/chat");
  });

  it("au chargement, le compteur ne dit PAS « 0 notion trouvée »", async () => {
    // « Rien de cherché » n'est pas « zéro trouvé » : ce serait un échec inventé.
    const { container } = renderPage();
    await screen.findByRole("heading", { name: "SVT" });
    expect(container.textContent).not.toMatch(/trouvée/);
  });
});

// --- Panoplie et panneau -----------------------------------------------------------------

describe("MatiereDetailPage — panoplie", () => {
  it("rend les 7 pastilles, l'état plein/creux suivant `available`", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nutrition végétale/ }));
    const ligne = await screen.findByRole("button", { name: /Racines/ });
    const pastilles = within(ligne).getAllByRole("img");
    expect(pastilles).toHaveLength(7);
    expect(pastilles.filter((p) => (p.getAttribute("aria-label") ?? "").includes("bientôt")))
      .toHaveLength(5);
  });

  it("l'accent va à la première activité FAISABLE, pas à la première de la liste", async () => {
    // Sur Photosynthèse, `cours` est le premier kind mais il est indisponible : l'accent doit
    // aller à la fiche. Une action mise en avant doit pouvoir être faite.
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    expect(activite("Lire la fiche").className).toContain("from-zetis-accent");
    expect(activite("Voir le cours").className).not.toContain("from-zetis-accent");
  });

  it("une activité indisponible n'est pas cliquable et ne navigue nulle part", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);
    const cours = activite("Voir le cours");
    expect(cours.hasAttribute("disabled")).toBe(true);
    fireEvent.click(cours);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("une activité disponible ouvre sa surface en PLEINE PAGE (jamais une modale)", async () => {
    // Amendement ADR-0017, tranché par la Galaxy de fait.
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    fireEvent.click(activite("Voir le cours"));
    expect(navigateMock).toHaveBeenCalledWith("/subjects/svt/cours", undefined);
  });

  it("dit que quiz et révision ouvrent la MATIÈRE, sans promettre la notion", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    expect(activite("Me tester").textContent).toContain(
      "toute la matière",
    );
  });
});

// --- Demandes de contenu -----------------------------------------------------------------

describe("MatiereDetailPage — demander à ZETIS", () => {
  it("« tout ce qui manque » = UN seul appel, avec les kinds DÉDUPLIQUÉS", async () => {
    // ⚠️ Sur Photosynthèse, `cours` ET `eli5` manquent, et tous deux se demandent comme
    // `cours`. Sans dédup, l'appel enverrait deux fois « cours » et le compteur dirait 7 —
    // alors que le vocabulaire n'a que 6 entrées.
    renderPage();
    await ouvrirNotion(/La cellule/, /Photosynthèse/);

    const bouton = screen.getByRole("button", { name: /tout ce qui manque \(5\)/ });
    fireEvent.click(bouton);

    await waitFor(() => expect(createContentRequest).toHaveBeenCalledTimes(1));
    expect(createContentRequest).toHaveBeenCalledWith({
      skill_id: 2,
      content_kinds: ["cours", "capsule", "mindmap", "card", "quiz"],
    });
  });

  it("le bouton « tout ce qui manque » est ABSENT quand la panoplie est complète", async () => {
    renderPage();
    await ouvrirNotion(/La cellule/, /Mitose/);
    expect(screen.queryByRole("button", { name: /tout ce qui manque/ })).toBeNull();
  });

  it("une demande unitaire n'envoie QUE ce type-là, et la pastille passe en « demandé »", async () => {
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    await waitFor(() => expect(createContentRequest).toHaveBeenCalledTimes(1));
    expect(createContentRequest).toHaveBeenCalledWith({ skill_id: 3, content_kinds: ["fiche"] });
    expect(await screen.findByRole("button", { name: /déjà demandé à ZETIS/ })).toBeInTheDocument();
  });

  it("le retour dit qu'une demande est ENREGISTRÉE, sans promettre de contenu", async () => {
    // « C'est noté par ZETIS » ne promet ni qui traitera la demande ni quand — vrai que le
    // contenu vienne de Papa ou, demain, de ZETIS lui-même.
    //
    // ⚠️ Ce test vérifiait aussi la phrase « ZETIS transmet la demande. Il ne fabrique rien
    // tout seul. », retirée le 2026-08-01 : ZETIS produira bientôt du contenu, et la phrase
    // serait devenue fausse. Ce qui reste interdit, lui, est toujours vérifié ci-dessous.
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    expect(await screen.findByText("C'est noté par ZETIS")).toBeInTheDocument();
  });

  it("ne promet JAMAIS de préparer le contenu, ni délai, ni statut", async () => {
    // Le garde-fou qui survit au retrait de la phrase fixe. Une promesse non tenue, ça se
    // retient : ZETIS enregistre, il n'annonce pas de livraison.
    const { container } = renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));
    await screen.findByText("C'est noté par ZETIS");

    expect(container.textContent).not.toMatch(
      /je te le prépare|je m'en occupe|en cours de|bientôt prêt|d'ici|dans \d|en attente/i,
    );
  });

  it("la demande porte l'orange électrique — teinte ET halo", async () => {
    // L'orange `zetis-request` distingue le geste de demande des actions faisables (indigo /
    // cyan). Ce n'est pas une couleur d'alerte : demander est la seule chose que Massimo
    // puisse faire face à un contenu absent, donc c'est positif.
    //
    // ⚠️ Le HALO fait partie de la décision, pas de la décoration. La teinte n'a presque
    // aucune marge (l'or est à 18°, le rouge est banni) : « électrique » se dit donc par la
    // LUEUR, comme partout ailleurs dans l'app. Sans `shadow-request`, l'orange redevient un
    // aplat saturé qui lit « attention » au lieu de « demande ».
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);

    const demander = screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ });
    expect(demander.className).toContain("zetis-request");
    expect(demander.className).toContain("shadow-request");

    const tout = screen.getByRole("button", { name: /tout ce qui manque/ });
    expect(tout.className).toContain("zetis-request");
    expect(tout.className).toContain("shadow-request");

    // Une activité DISPONIBLE ne porte jamais l'orange : elle n'est pas à demander.
    expect(activite("Voir le cours").className).not.toContain("zetis-request");
  });

  it("une fois demandé, le bouton s'APAISE — il n'appelle plus", async () => {
    // Le halo attire vers un geste à faire. Le geste fait, il n'a plus lieu d'être : garder la
    // lueur ferait clignoter une demande déjà transmise, donc réclamer deux fois.
    renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    const demande = await screen.findByRole("button", { name: /déjà demandé à ZETIS/ });
    expect(demande.className).toContain("zetis-request");
    expect(demande.className).not.toContain("shadow-request");
  });

  it("un échec réseau revient en arrière EN SILENCE, sans écran d'erreur", async () => {
    // Une demande perdue ne vaut pas un message d'échec chez un enfant : il retapera. Un
    // message, lui, se retient.
    vi.mocked(createContentRequest).mockRejectedValue(new Error("réseau"));
    const { container } = renderPage();
    await ouvrirNotion(/Nutrition végétale/, /Racines/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Demander Lire la fiche à ZETIS/ })).toBeInTheDocument(),
    );
    expect(container.textContent).not.toMatch(/erreur|échec|réessay/i);
  });
});

// --- Accessibilité -----------------------------------------------------------------------

describe("MatiereDetailPage — plancher d'accessibilité", () => {
  it("chaque notion porte son état dans son `aria-label`", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /La cellule/ }));
    expect(screen.getByRole("button", { name: "Mitose — Bien acquis" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Nutrition végétale/ }));
    expect(screen.getByRole("button", { name: "Racines — À découvrir" })).toBeInTheDocument();
  });

  it("chaque pastille de panoplie dit ce qu'elle est, et si c'est pour bientôt", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Nutrition végétale/ }));
    const ligne = await screen.findByRole("button", { name: /Racines/ });
    expect(within(ligne).getByLabelText("Lire la fiche — bientôt")).toBeInTheDocument();
    expect(within(ligne).getByLabelText("Voir le cours — disponible")).toBeInTheDocument();
  });

  it("l'accordéon annonce son état et ce qu'il contrôle", async () => {
    renderPage();
    const chapitre = await screen.findByRole("button", { name: /La cellule/ });
    // Replié à l'ouverture : la page présente la MATIÈRE, pas le contenu d'un chapitre choisi
    // pour Massimo. C'est lui qui décide où il entre.
    expect(chapitre.getAttribute("aria-expanded")).toBe("false");
    expect(chapitre.getAttribute("aria-controls")).toBe("chapitre-10");
    expect(screen.queryByRole("button", { name: /Mitose/ })).toBeNull();

    fireEvent.click(chapitre);
    expect(chapitre.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /Mitose/ })).toBeInTheDocument();
  });
});
