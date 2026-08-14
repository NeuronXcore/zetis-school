import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { FicheListItem, FicheTile } from "@zetis/types";

// L'écran 2 — une tuile par LEÇON, quatre états (`page-fiches.md`).
//
// Cette page n'avait AUCUN test de rendu avant le 2026-08-13, et c'est en s'en servant qu'on a
// découvert ce qu'elle ne montrait pas : une fiche commencée n'apparaissait nulle part, alors
// que le serveur la gardait parfaitement. Ces tests protègent la navigation, pas la mise en page.

const api = vi.hoisted(() => ({
  fetchSubjectFiches: vi.fn(),
  fetchFicheTilesIndex: vi.fn(),
  fetchFiche: vi.fn(),
  markFicheSeen: vi.fn(),
  fetchFichesSummary: vi.fn(),
}));
vi.mock("../lib/fiches", () => api);

const pont = vi.hoisted(() => ({ cardsFromFiche: vi.fn(), reworkFiche: vi.fn() }));
vi.mock("../lib/atelier", () => pont);

import { FicheSubjectPage } from "./FicheSubjectPage";

function tuile(p: Partial<FicheTile> & Pick<FicheTile, "lesson_id" | "title" | "etat">): FicheTile {
  return {
    chapter: "Grammaire",
    // ⚠️ L'IDENTIFIANT du chapitre est ce qui groupe (ADR-0057) : sans lui, la brique rangerait
    // tout sous « Sans chapitre » — et aucune de ces assertions ne s'en apercevrait.
    chapter_id: 1,
    subject_slug: "francais",
    subject: "Français",
    draft_id: null,
    fiche_id: null,
    zetis_fiche_id: null,
    seen: true,
    versions: 0,
    etapes_remplies: 0,
    points_choisis: 0,
    updated_at: null,
    ...p,
  };
}

const TUILES: FicheTile[] = [
  tuile({ lesson_id: 7, title: "La phrase complexe", etat: "commencee", draft_id: 42, points_choisis: 3, etapes_remplies: 2 }),
  tuile({ lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100, versions: 2 }),
  tuile({ lesson_id: 9, title: "Les temps", etat: "zetis", fiche_id: 200, zetis_fiche_id: 200 }),
  tuile({ lesson_id: 10, title: "La ponctuation", etat: "a_fabriquer" }),
];

const LISTE: FicheListItem[] = [
  { id: 100, lesson_id: 8, title: "Le récit", chapter: "Grammaire", subject_slug: "francais", seen: true },
  { id: 200, lesson_id: 9, title: "Les temps", chapter: "Grammaire", subject_slug: "francais", seen: true },
];

function monter(entree = "/fiches/francais") {
  return render(
    <MemoryRouter initialEntries={[entree]}>
      <Routes>
        <Route path="/fiches/:slug" element={<FicheSubjectPage />} />
        <Route path="/fiches/:slug/:lessonId/atelier" element={<div>atelier-de-la-lecon</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.fetchSubjectFiches.mockResolvedValue(LISTE);
  api.fetchFicheTilesIndex.mockResolvedValue(TUILES);
  api.markFicheSeen.mockResolvedValue(undefined);
  pont.reworkFiche.mockResolvedValue({ id: 300 });
});

describe("FicheSubjectPage — l'écran 2", () => {
  it("montre une fiche COMMENCÉE, que la liste fiche-centrée ne pouvait pas afficher", async () => {
    // 🔴 Le défaut qui a motivé cet écran : un brouillon n'est pas une fiche, il n'apparaissait
    // donc nulle part — le travail interrompu était perdu de vue.
    monter();
    expect(await screen.findByText("La phrase complexe")).toBeInTheDocument();
    expect(screen.getByText(/Commencée/)).toBeInTheDocument();
    expect(screen.getByText(/tu en as choisi 3/)).toBeInTheDocument();
  });

  it("montre les quatre états", async () => {
    monter();
    await screen.findByText("La phrase complexe");
    for (const pastille of [/Commencée/, /Ta fiche/, /Fiche ZETIS/, /À fabriquer/]) {
      expect(screen.getByText(pastille)).toBeInTheDocument();
    }
  });

  it("n'écrit AUCUN reproche sur une fiche commencée", async () => {
    // `CLAUDE.md` § Gamification : aucun décompte de jours, aucun « inachevé », aucun retard.
    monter();
    await screen.findByText("La phrase complexe");
    for (const interdit of [/inachev/i, /abandonn/i, /en retard/i, /il te manque/i, /jours/i]) {
      expect(screen.queryByText(interdit)).not.toBeInTheDocument();
    }
  });

  it("emmène à l'atelier depuis une fiche commencée", async () => {
    monter();
    fireEvent.click(await screen.findByText("La phrase complexe"));
    expect(await screen.findByText("atelier-de-la-lecon")).toBeInTheDocument();
  });

  it("emmène à l'atelier depuis une leçon à fabriquer", async () => {
    monter();
    fireEvent.click(await screen.findByText("La ponctuation"));
    expect(await screen.findByText("atelier-de-la-lecon")).toBeInTheDocument();
  });

  it("ouvre la FICHE — pas l'atelier — quand elle existe", async () => {
    api.fetchFiche.mockResolvedValue({
      id: 200,
      lesson_id: 9,
      title: "Les temps",
      chapter: "Grammaire",
      subject_slug: "francais",
      validation_status: "validated",
      seen: true,
      spec: {
        title: "Les temps",
        subject: "Français",
        level: "4e",
        essentiel: "Un essentiel.",
        definitions: [],
        points_cles: [],
        erreurs_a_eviter: [],
      },
    });
    monter();
    fireEvent.click(await screen.findByText("Les temps"));

    await waitFor(() => expect(api.fetchFiche).toHaveBeenCalledWith(200));
    expect(screen.queryByText("atelier-de-la-lecon")).not.toBeInTheDocument();
  });

  it("laisse le corrigé de ZETIS à un clic sur SA propre fiche", async () => {
    // §3 révisé : rien n'est verrouillé. Seul change ce qui s'ouvre en PREMIER.
    api.fetchFicheTilesIndex.mockResolvedValue([
      tuile({ lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100, zetis_fiche_id: 200 }),
    ]);
    monter();
    expect(await screen.findByText(/Voir la fiche de ZETIS/)).toBeInTheDocument();
  });
});


// ── Le pont fiche → cartes (addendum ADR-0015 §13) ──────────────────────────────

function ouvrirSaFiche(definitions: { terme: string; definition: string }[]) {
  api.fetchFicheTilesIndex.mockResolvedValue([
    tuile({ lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100 }),
  ]);
  api.fetchFiche.mockResolvedValue({
    id: 100,
    lesson_id: 8,
    title: "Le récit",
    chapter: "Grammaire",
    subject_slug: "francais",
    validation_status: "personal",
    seen: true,
    spec: {
      title: "Le récit",
      subject: "Français",
      level: "4e",
      essentiel: "Un essentiel.",
      definitions,
      points_cles: [],
      erreurs_a_eviter: [],
    },
  });
  monter();
}

describe("FicheSubjectPage — le pont vers les cartes", () => {
  it("dit les DEUX nombres, pas seulement celui qui flatte", async () => {
    // 🔴 Une carte a besoin d'une NOTION ; les termes venus du gras du cours n'en ont pas.
    // Annoncer « 2 cartes » pour en créer 1 serait le défaut de la file de relecture.
    pont.cardsFromFiche.mockResolvedValue({ cartes: 1, termes_sans_notion: ["péripétie"] });
    ouvrirSaFiche([
      { terme: "Narrateur", definition: "Celui qui raconte." },
      { terme: "péripétie", definition: "Un rebondissement." },
    ]);
    fireEvent.click(await screen.findByText("Le récit"));

    fireEvent.click(await screen.findByText(/Ajouter à mes cartes/));
    expect(await screen.findByText(/1 carte ajoutée/)).toBeInTheDocument();
    expect(screen.getByText(/1 mot sans notion derrière/)).toBeInTheDocument();
  });

  it("laisse le bouton INERTE quand il n'y a rien à ponter", async () => {
    // 🔴 Un SEUL bouton — celui que `FicheCard` porte depuis l'ADR-0015 §6. En ajouter un
    // second en dessous donnait deux boutons au même emoji pour le même geste, dont un mort :
    // vu à l'écran le 2026-08-13, et invisible à tous les tests.
    ouvrirSaFiche([]);
    fireEvent.click(await screen.findByText("Le récit"));
    const bouton = await screen.findByText(/Ajouter à mes cartes/);
    expect(bouton.closest("button")).toBeDisabled();
    fireEvent.click(bouton);
    expect(pont.cardsFromFiche).not.toHaveBeenCalled();
  });

  it("reste INERTE sur une fiche de ZETIS — le pont §6 est toujours stub", async () => {
    ouvrirLaFicheDeZetis();
    fireEvent.click(await screen.findByText("Les temps"));
    const bouton = await screen.findByText(/Ajouter à mes cartes/);
    expect(bouton.closest("button")).toBeDisabled();
  });
});

// ── La datation relative (ADR-0054 §3) ──────────────────────────────────────────

describe("FicheSubjectPage — la datation de la tuile", () => {
  function ilYA(jours: number) {
    const d = new Date();
    d.setDate(d.getDate() - jours);
    return d.toISOString();
  }

  it("date SA fiche, en relatif, dans la phrase de la spec", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue([
      tuile({
        lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100,
        versions: 2, updated_at: ilYA(5),
      }),
    ]);
    monter();
    expect(await screen.findByText("2 versions · la dernière il y a 5 jours")).toBeInTheDocument();
  });

  it("date aussi une fiche en UNE version, sans jamais parler de versions", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue([
      tuile({
        lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100,
        versions: 1, updated_at: ilYA(1),
      }),
    ]);
    monter();
    expect(await screen.findByText("tu l'as écrite hier — à relire")).toBeInTheDocument();
  });

  it("🔴 ne date JAMAIS la fiche de ZETIS — même si le serveur envoie une date", async () => {
    // La règle est tenue au RENDU, pas seulement par un serveur qui n'envoie rien : « il y a
    // 4 mois » sur un contenu généré ne peut que saper la confiance dans un contenu juste.
    api.fetchFicheTilesIndex.mockResolvedValue([
      tuile({
        lesson_id: 9, title: "Les temps", etat: "zetis", fiche_id: 200,
        updated_at: ilYA(120),
      }),
    ]);
    monter();
    await screen.findByText("Les temps");
    expect(screen.queryByText(/il y a/)).not.toBeInTheDocument();
    expect(screen.getByText("à lire")).toBeInTheDocument();
  });

  it("retombe sur le texte d'avant quand la date manque — jamais « Invalid Date »", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue([
      tuile({
        lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100,
        versions: 2, updated_at: null,
      }),
    ]);
    monter();
    expect(await screen.findByText("2 versions · la dernière est la tienne")).toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date|NaN/)).not.toBeInTheDocument();
  });
});

// ── La porte du §1 (ADR-0054) ───────────────────────────────────────────────────

function ouvrirLaFicheDeZetis() {
  api.fetchFicheTilesIndex.mockResolvedValue([
    tuile({ lesson_id: 9, title: "Les temps", etat: "zetis", fiche_id: 200 }),
  ]);
  api.fetchFiche.mockResolvedValue({
    id: 200, lesson_id: 9, title: "Les temps", chapter: "Grammaire",
    subject_slug: "francais", validation_status: "validated", seen: true,
    spec: {
      title: "Les temps", subject: "Français", level: "4e", essentiel: "Un essentiel.",
      definitions: [{ terme: "Imparfait", definition: "Un temps du passé." }],
      points_cles: [], erreurs_a_eviter: [],
    },
  });
  monter();
}

describe("FicheSubjectPage — la porte du §1", () => {
  // 🔴 « En faire ma fiche » n'est PAS « La retravailler » : la fiche de ZETIS n'est pas à lui.
  // Un libellé commun laisserait croire qu'il édite le contenu de ZETIS (§2 de l'addendum).
  // ⚠️ Deux `it` et non un seul : monter les deux écrans dans le même test laisse les DEUX
  // rendus dans le document, et le `queryByText` négatif trouve alors celui d'avant.

  it("sur SA fiche, la porte dit « La retravailler » — et rien d'autre", async () => {
    ouvrirSaFiche([]);
    fireEvent.click(await screen.findByText("Le récit"));
    expect(await screen.findByText(/La retravailler/)).toBeInTheDocument();
    expect(screen.queryByText(/En faire ma fiche/)).not.toBeInTheDocument();
  });

  it("sur la fiche de ZETIS, la porte dit « En faire ma fiche » — et rien d'autre", async () => {
    ouvrirLaFicheDeZetis();
    fireEvent.click(await screen.findByText("Les temps"));
    expect(await screen.findByText(/En faire ma fiche/)).toBeInTheDocument();
    expect(screen.queryByText(/La retravailler/)).not.toBeInTheDocument();
  });

  it("🔴 appelle `rework` AVANT de naviguer — l'ORDRE est la fonctionnalité", async () => {
    // Naviguer d'abord laisserait `openDraft` fabriquer un brouillon VIDE en version N+1
    // (`open_or_get_draft` ne pré-remplit que le décor) : Massimo cliquerait « retravailler »
    // et trouverait une page blanche à la place de son travail. C'est le défaut 4 déjà observé
    // à l'écran, et cette porte est précisément ce qui ne doit pas le rejouer.
    let liberer: (v: unknown) => void = () => {};
    pont.reworkFiche.mockReturnValue(
      new Promise((r) => {
        liberer = r;
      }),
    );
    ouvrirSaFiche([]);
    fireEvent.click(await screen.findByText("Le récit"));
    fireEvent.click(await screen.findByText(/La retravailler/));

    await waitFor(() => expect(pont.reworkFiche).toHaveBeenCalledWith(100));
    expect(screen.queryByText("atelier-de-la-lecon")).not.toBeInTheDocument();

    liberer({ id: 300 });
    expect(await screen.findByText("atelier-de-la-lecon")).toBeInTheDocument();
  });

  it("n'appelle JAMAIS `rework` sur une fiche de ZETIS — il n'y a rien à reprendre", async () => {
    ouvrirLaFicheDeZetis();
    fireEvent.click(await screen.findByText("Les temps"));
    fireEvent.click(await screen.findByText(/En faire ma fiche/));

    expect(await screen.findByText("atelier-de-la-lecon")).toBeInTheDocument();
    expect(pont.reworkFiche).not.toHaveBeenCalled();
  });

  it("🔴 ne navigue PAS quand `rework` échoue — et le dit", async () => {
    // Partir quand même serait le pire des deux mondes : l'atelier créerait alors la v2 vide
    // qu'on vient d'éviter. Ne rien faire ET le dire vaut mieux que faire la mauvaise chose.
    pont.reworkFiche.mockRejectedValue(new Error("réseau"));
    ouvrirSaFiche([]);
    fireEvent.click(await screen.findByText("Le récit"));
    fireEvent.click(await screen.findByText(/La retravailler/));

    expect(await screen.findByText(/Réessaie dans un moment/)).toBeInTheDocument();
    expect(screen.queryByText("atelier-de-la-lecon")).not.toBeInTheDocument();
  });

  it("🔴 `?fiche=<id>` ouvre CETTE fiche — c'est la seule adresse qu'elle ait", async () => {
    // Sans ce lien, la fiche n'est qu'un état interne de cette page : rien, nulle part, ne peut
    // y renvoyer. C'est ce qui empêchait la 3ᵉ porte du §1 d'exister.
    api.fetchFiche.mockResolvedValue({
      id: 200, lesson_id: 9, title: "Les temps", chapter: "Grammaire",
      subject_slug: "francais", validation_status: "validated", seen: true,
      spec: {
        title: "Les temps", subject: "Français", level: "4e", essentiel: "Un essentiel.",
        definitions: [], points_cles: [], erreurs_a_eviter: [],
      },
    });
    monter("/fiches/francais?fiche=200");

    await waitFor(() => expect(api.fetchFiche).toHaveBeenCalledWith(200));
    // ⚠️ Viser la PORTE, pas « D'après ton cours » : ce badge existe DEUX fois dans le document
    // — le pied de la carte, et le rendu A5 hors écran que l'export photographie.
    expect(await screen.findByText(/En faire ma fiche/)).toBeInTheDocument();
  });

  it("reste sur la liste si `?fiche=` désigne une fiche introuvable", async () => {
    // Lien vieilli, fiche dévalidée : Massimo atterrit sur sa matière, jamais sur une erreur.
    monter("/fiches/francais?fiche=999999");
    expect(await screen.findByText("La phrase complexe")).toBeInTheDocument();
    expect(api.fetchFiche).not.toHaveBeenCalled();
  });

  it("n'écrit aucun reproche sur la porte", async () => {
    // `CLAUDE.md` § pédagogie : « La retravailler » ne doit jamais se lire « recommence, c'était
    // raté » — l'ADR §« signal » nomme ce risque explicitement.
    ouvrirSaFiche([]);
    fireEvent.click(await screen.findByText("Le récit"));
    await screen.findByText(/La retravailler/);
    for (const interdit of [/recommence/i, /raté/i, /corrige/i, /erreur/i, /mauvais/i]) {
      expect(screen.queryByText(interdit)).not.toBeInTheDocument();
    }
  });
});

// ── Matière → chapitre + recherche (ADR-0057, slice Fiches) ───────────────────

describe("FicheSubjectPage — les tuiles se rangent, et la recherche traverse", () => {
  const DEUX_CHAPITRES: FicheTile[] = [
    // ⚠️ Décor à DEUX chapitres dans la MÊME matière — sans ça, un regroupement qui les
    // fusionnerait resterait invisible : le groupe unique porterait le nom du premier.
    // Le sabotage est resté VERT sur ce motif en slice Quiz.
    tuile({ lesson_id: 7, title: "La phrase complexe", etat: "a_fabriquer", chapter: "Zébu", chapter_id: 1 }),
    tuile({ lesson_id: 8, title: "Le récit", etat: "a_fabriquer", chapter: "Alphabet", chapter_id: 2 }),
    tuile({
      lesson_id: 30,
      title: "Le théorème de Pythagore",
      etat: "a_fabriquer",
      chapter: "Géométrie",
      chapter_id: 9,
      subject_slug: "mathematiques",
      subject: "Mathématiques",
    }),
  ];

  it("🔒 range les tuiles sous LEURS chapitres", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue(DEUX_CHAPITRES);
    monter();

    expect(await screen.findByText("Zébu")).toBeInTheDocument();
    expect(screen.getByText("Alphabet")).toBeInTheDocument();
    expect(screen.getByText("La phrase complexe")).toBeInTheDocument();
  });

  it("🔒 garde l'ordre du PROGRAMME, pas l'alphabétique", async () => {
    // 🔴 Le serveur rend « Zébu » avant « Alphabet » (Chapter.sort_order) : cette progression a
    // un sens que le dictionnaire n'a pas. La brique trie par NOM par défaut — la page lui passe
    // l'ordre d'apparition. Sans la prop `chapterOrder`, « Alphabet » remonterait en tête.
    api.fetchFicheTilesIndex.mockResolvedValue(DEUX_CHAPITRES);
    const { container } = monter();
    await screen.findByText("Zébu");

    const titres = [...container.querySelectorAll("p")]
      .map((n) => n.textContent)
      .filter((t) => t === "Zébu" || t === "Alphabet");
    expect(titres).toEqual(["Zébu", "Alphabet"]);
  });

  it("🔒 la recherche traverse les matières, et le clic EMMÈNE là où la tuile vit", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue(DEUX_CHAPITRES);
    monter();
    await screen.findByText("La phrase complexe");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher une leçon/), {
      target: { value: "pythagore" },
    });

    // La tuile de Maths apparaît sous SA matière, depuis la page de Français…
    expect(screen.getByText("Le théorème de Pythagore")).toBeInTheDocument();
    expect(screen.getByText("Mathématiques")).toBeInTheDocument();
    expect(screen.queryByText("La phrase complexe")).not.toBeInTheDocument();
    // …et l'atelier ouvert est bien celui de SA leçon, dans SA matière.
    fireEvent.click(screen.getByText("Le théorème de Pythagore"));
    expect(screen.getByText("atelier-de-la-lecon")).toBeInTheDocument();
  });

  it("🔒 un mot qui ne trouve rien nomme ce qu'on cherchait", async () => {
    api.fetchFicheTilesIndex.mockResolvedValue(DEUX_CHAPITRES);
    monter();
    await screen.findByText("La phrase complexe");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher une leçon/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/Aucune leçon ne correspond à « zzzz »/)).toBeInTheDocument();
  });
});
