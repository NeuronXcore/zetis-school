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

/** Attend la fin du chargement, puis ouvre le panneau d'une notion.
 *
 *  ⚠️ Seul le PREMIER chapitre est ouvert au chargement : une notion des suivants n'est pas
 *  rendue tant qu'on ne l'a pas déplié. `chapitre` sert à ça. */
async function ouvrirNotion(nom: RegExp, chapitre?: RegExp) {
  if (chapitre) fireEvent.click(await screen.findByRole("button", { name: chapitre }));
  const ligne = await screen.findByRole("button", { name: nom });
  fireEvent.click(ligne);
  return ligne;
}

/** Le bouton d'ACTIVITÉ, et non le bouton « demander » voisin — dont le libellé accessible
 *  (« Demander Lire la fiche à Papa ») contient le même texte. */
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
    await ouvrirNotion(/Photosynthèse/);
    // « manque » est autorisé — « tout ce qui manque » est le libellé de la spec. Ce qui est
    // interdit, c'est le vocabulaire qui désigne l'enfant : manquant, raté, échec.
    expect(container.textContent).not.toMatch(/manquant|raté|échec|erreur|retard|nul/i);
  });

  it("affiche le plafond de session, JAMAIS l'arriéré", async () => {
    // ⚠️ TEST-VERROU. `due_count = 42` est l'arriéré : l'afficher serait la pression
    // quotidienne que `CLAUDE.md` interdit. `session_size = 8` est ce que la session servira.
    const { container } = renderPage();
    await screen.findByText(/8 cartes à revoir/);
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
    expect(screen.getByRole("button", { name: /Mitose/ })).toBeInTheDocument();
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
    await ouvrirNotion(/Photosynthèse/);
    expect(activite("Lire la fiche").className).toContain("from-zetis-accent");
    expect(activite("Voir le cours").className).not.toContain("from-zetis-accent");
  });

  it("une activité indisponible n'est pas cliquable et ne navigue nulle part", async () => {
    renderPage();
    await ouvrirNotion(/Photosynthèse/);
    const cours = activite("Voir le cours");
    expect(cours.hasAttribute("disabled")).toBe(true);
    fireEvent.click(cours);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("une activité disponible ouvre sa surface en PLEINE PAGE (jamais une modale)", async () => {
    // Amendement ADR-0017, tranché par la Galaxy de fait.
    renderPage();
    await ouvrirNotion(/Mitose/);
    fireEvent.click(activite("Voir le cours"));
    expect(navigateMock).toHaveBeenCalledWith("/subjects/svt/cours", undefined);
  });

  it("dit que quiz et révision ouvrent la MATIÈRE, sans promettre la notion", async () => {
    renderPage();
    await ouvrirNotion(/Mitose/);
    expect(activite("Me tester").textContent).toContain(
      "toute la matière",
    );
  });
});

// --- Demandes à Papa ---------------------------------------------------------------------

describe("MatiereDetailPage — demander à Papa", () => {
  it("« tout ce qui manque » = UN seul appel, avec les kinds DÉDUPLIQUÉS", async () => {
    // ⚠️ Sur Photosynthèse, `cours` ET `eli5` manquent, et tous deux se demandent comme
    // `cours`. Sans dédup, l'appel enverrait deux fois « cours » et le compteur dirait 7 —
    // alors que le vocabulaire n'a que 6 entrées.
    renderPage();
    await ouvrirNotion(/Photosynthèse/);

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
    await ouvrirNotion(/Mitose/);
    expect(screen.queryByRole("button", { name: /tout ce qui manque/ })).toBeNull();
  });

  it("une demande unitaire n'envoie QUE ce type-là, et la pastille passe en « demandé »", async () => {
    renderPage();
    await ouvrirNotion(/Racines/, /Nutrition végétale/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à Papa/ }));

    await waitFor(() => expect(createContentRequest).toHaveBeenCalledTimes(1));
    expect(createContentRequest).toHaveBeenCalledWith({ skill_id: 3, content_kinds: ["fiche"] });
    expect(await screen.findByRole("button", { name: /déjà demandé à Papa/ })).toBeInTheDocument();
  });

  it("le retour est « C'est noté pour Papa » — jamais « je te le prépare »", async () => {
    renderPage();
    await ouvrirNotion(/Racines/, /Nutrition végétale/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à Papa/ }));

    expect(await screen.findByText("C'est noté pour Papa")).toBeInTheDocument();
    expect(screen.getByText(/ne fabrique rien tout seul/)).toBeInTheDocument();
  });

  it("un échec réseau revient en arrière EN SILENCE, sans écran d'erreur", async () => {
    // Une demande perdue ne vaut pas un message d'échec chez un enfant : il retapera. Un
    // message, lui, se retient.
    vi.mocked(createContentRequest).mockRejectedValue(new Error("réseau"));
    const { container } = renderPage();
    await ouvrirNotion(/Racines/, /Nutrition végétale/);
    fireEvent.click(screen.getByRole("button", { name: /Demander Lire la fiche à Papa/ }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Demander Lire la fiche à Papa/ })).toBeInTheDocument(),
    );
    expect(container.textContent).not.toMatch(/erreur|échec|réessay/i);
  });
});

// --- Accessibilité -----------------------------------------------------------------------

describe("MatiereDetailPage — plancher d'accessibilité", () => {
  it("chaque notion porte son état dans son `aria-label`", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Mitose — Bien acquis" })).toBeInTheDocument();
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
    expect(chapitre.getAttribute("aria-expanded")).toBe("true");
    expect(chapitre.getAttribute("aria-controls")).toBe("chapitre-10");

    fireEvent.click(chapitre);
    expect(chapitre.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("button", { name: /Mitose/ })).toBeNull();
  });
});
