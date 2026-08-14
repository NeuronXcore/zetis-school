import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type ReviewChapterDue, type ReviewsSummary } from "@zetis/types";
import { RevisionPage } from "./RevisionPage";

const navigateMock = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (orig) => {
  const actual = await orig<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => navigateMock };
});

// ⚠️ La fabrique gagne `fetchReviewChapters` — **aucune assertion des sept tests ci-dessous n'est
// touchée**. C'est une addition de DÉCOR : sans elle, la page appellerait une fonction absente du
// mock et les sept planteraient sur un `TypeError`, pour une raison qui n'a rien à voir avec ce
// qu'elles mesurent. Le défaut `[]` leur fait décrire **exactement l'écran d'aujourd'hui** — c'est
// aussi la preuve de parité de cette slice.
vi.mock("../lib/reviews", () => ({
  fetchReviewsSummary: vi.fn(),
  fetchReviewChapters: vi.fn(),
}));
import { fetchReviewChapters, fetchReviewsSummary } from "../lib/reviews";

const SUMMARY: ReviewsSummary = {
  total_due: 27,
  flash_size: 5,
  new_count: 4,
  subjects: [
    { slug: "maths", name: "Maths", due_count: 20, new_count: 4, has_cards: true }, // > 15 → « 15+ »
    { slug: "svt", name: "SVT", due_count: 3, new_count: 0, has_cards: true },
    { slug: "espagnol", name: "Espagnol", due_count: 0, new_count: 0, has_cards: true }, // à jour ✓
    { slug: "histoire", name: "Histoire", due_count: 0, new_count: 0, has_cards: false }, // sans carte → grisé
  ],
};

function renderAt(path = "/revision") {
  render(
    <MemoryRouter initialEntries={[path]}>
      <RevisionPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateMock.mockReset();
  vi.mocked(fetchReviewsSummary).mockReset().mockResolvedValue(SUMMARY);
  vi.mocked(fetchReviewChapters).mockReset().mockResolvedValue([]);
});

describe("RevisionPage — écran des decks", () => {
  it("plafonne le badge à « 15+ » au-delà de 15", async () => {
    renderAt();
    // La matière Maths (20 dues) plafonne à « 15+ » ; SVT (3) reste exact.
    const maths = await screen.findByRole("button", { name: /Maths/ });
    expect(within(maths).getByText("15+")).toBeInTheDocument();
    expect(within(screen.getByRole("button", { name: /SVT/ })).getByText("3")).toBeInTheDocument();
  });

  it("badge « ✨ new » sur les decks contenant des cartes fraîchement générées", async () => {
    renderAt();
    const maths = await screen.findByRole("button", { name: /Maths/ });
    expect(within(maths).getByText(/new/)).toBeInTheDocument(); // maths new_count=4
    expect(
      within(screen.getByRole("button", { name: /SVT/ })).queryByText(/new/),
    ).not.toBeInTheDocument(); // svt new_count=0
  });

  it("matière à jour : « à jour ✓ », non cliquable (pas de bouton)", async () => {
    renderAt();
    await screen.findByText("Espagnol");
    expect(screen.getByText("à jour ✓")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Espagnol/ })).not.toBeInTheDocument();
    // Les matières avec des cartes dues restent cliquables.
    expect(screen.getByRole("button", { name: /Maths/ })).toBeInTheDocument();
  });

  it("matière sans carte : grisée « à venir » / « pas encore de cartes », non cliquable", async () => {
    renderAt();
    await screen.findByText("Histoire");
    expect(screen.getByText("à venir")).toBeInTheDocument();
    expect(screen.getByText("pas encore de cartes")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Histoire/ })).not.toBeInTheDocument();
  });

  it("état zéro global : message bienveillant, aucun CTA de révision", async () => {
    vi.mocked(fetchReviewsSummary).mockResolvedValue({
      total_due: 0,
      flash_size: 0,
      new_count: 0,
      subjects: [{ slug: "maths", name: "Maths", due_count: 0, new_count: 0, has_cards: true }],
    });
    renderAt();
    expect(await screen.findByText(/Tout est frais dans ta mémoire/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mélange/ })).not.toBeInTheDocument();
  });

  it("deep link ?subject= lance la session matière avec `replace` (pas de boucle au retour)", async () => {
    renderAt("/revision?subject=maths");
    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith(
        "/revision/session",
        expect.objectContaining({
          replace: true,
          state: expect.objectContaining({ deck: { subject: "maths" }, label: "Maths" }),
        }),
      ),
    );
  });

  it("ignore ?subject= inconnu (pas de session lancée)", async () => {
    renderAt("/revision?subject=latin");
    await screen.findByText("Maths");
    expect(navigateMock).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// VERROU DU CONTRE-POIDS — le chapitre entre, mais au TROISIÈME rang (ADR-0057 §5)
// ─────────────────────────────────────────────────────────────────────────────────────
//
// 🔴 **Ce verrou en REMPLACE un autre, et il ne le supprime pas.** Jusqu'au 2026-08-14, un verrou
// de dépôt lisait le source de cette page et interdisait toute occurrence du mot « chapitre » :
// la Décision 1 de l'`adr-0049` avait retenu la seule porte de l'agenda et ÉCARTÉ le drill-in
// permanent, au motif du *blocked practice*. Ce verrou disait lui-même comment il mourait —
// *« si elle devient souhaitable un jour, c'est un ADR qui l'ouvre, pas un test qu'on supprime »*.
//
// L'`adr-0057` §9(1) EST cet ADR : la porte s'ouvre, sur deux faits neufs (la portée n'avait
// jamais été jugée — rang 153 sur 159 —, et le coût a baissé). Mais **l'objection n'est pas
// levée, elle est BORNÉE par le §5** : les mélanges restent le rituel, la matière ensuite, le
// chapitre au troisième rang. C'est cette borne-là que le verrou garde désormais. Il change
// d'objet ; la protection ne disparaît pas.

const CHAPITRES: ReviewChapterDue[] = [
  { chapter_id: 1, name: "Zébu", subject: "Maths", subject_slug: "maths", session_size: 8 },
  { chapter_id: 2, name: "Alphabet", subject: "Maths", subject_slug: "maths", session_size: 3 },
  { chapter_id: 9, name: "Cellules", subject: "SVT", subject_slug: "svt", session_size: 2 },
];

/** ⚠️ **Il y a DEUX contrôles « Maths » sur cet écran**, et c'est voulu : le disque de « Par
 *  matière » LANCE la session de la matière, l'en-tête de « Par chapitre » DÉPLIE ses chapitres.
 *  Toute recherche de bouton doit donc être portée par sa section, sinon elle est ambiguë — et
 *  une assertion ambiguë finirait par mesurer l'autre contrôle sans le dire. */
function sectionChapitres(): HTMLElement {
  return screen.getByText("Par chapitre").closest("section") as HTMLElement;
}

describe("VERROU du contre-poids — le chapitre reste au troisième rang", () => {
  it("🔒 les MÉLANGES restent en tête, avant les matières", async () => {
    // *« Les mélanges restent le rituel, en haut et plus grands comme aujourd'hui »* (§5). Le
    // signal n° 2 de l'ADR est que les sessions par chapitre deviennent majoritaires ; la
    // hiérarchie de l'écran est ce qui le retient.
    vi.mocked(fetchReviewChapters).mockResolvedValue(CHAPITRES);
    const { container } = render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");

    // (Le hero SRS porte son propre h2 — on ne retient que les titres de sections.)
    const titres = [...container.querySelectorAll("h2")]
      .map((n) => n.textContent)
      .filter((t) => t === "Mélanges" || t === "Par matière" || t === "Par chapitre");
    expect(titres).toEqual(["Mélanges", "Par matière", "Par chapitre"]);
  });

  it("🔒 aucun chapitre n'est atteignable sans avoir déplié sa matière", async () => {
    // 🔴 La moitié qui compte est la SECONDE. Prise seule, « aucun chapitre à l'arrivée » serait
    // verte sur une page qui n'en porterait aucun — c'est-à-dire sur le code d'avant ce chantier.
    // C'est le dépliage qui rend l'assertion mesurable.
    vi.mocked(fetchReviewChapters).mockResolvedValue(CHAPITRES);
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");

    expect(screen.queryByText("Zébu")).not.toBeInTheDocument();
    expect(screen.queryByText("Cellules")).not.toBeInTheDocument();

    // La matière se déplie — et c'est le SEUL chemin vers ses chapitres.
    fireEvent.click(within(sectionChapitres()).getByRole("button", { name: /Maths/ }));
    expect(screen.getByText("Zébu")).toBeInTheDocument();
    expect(screen.getByText("Alphabet")).toBeInTheDocument();
    // Déplier Maths ne déplie pas SVT : chaque matière garde sa porte.
    expect(screen.queryByText("Cellules")).not.toBeInTheDocument();
  });

  it("🔒 la surface ne recompte RIEN : elle rend ce que le serveur a servi", async () => {
    // §6 — *« le serveur décide de la servabilité, jamais le client »*. Un chapitre servi est
    // affiché, quel que soit son nombre : c'est le serveur qui a déjà écarté les vides.
    vi.mocked(fetchReviewChapters).mockResolvedValue([
      { chapter_id: 4, name: "Fractions", subject: "Maths", subject_slug: "maths", session_size: 1 },
    ]);
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");
    const entete = within(sectionChapitres()).getByRole("button", { name: /Maths/ });
    // Le nombre est NOMMÉ : « 1 chapitre », pas un « 1 » nu qui se lirait comme une carte.
    expect(entete).toHaveTextContent("1 chapitre");
    fireEvent.click(entete);
    expect(screen.getByText("Fractions")).toBeInTheDocument();
  });
});

describe("RevisionPage — matière → chapitre + recherche (ADR-0057)", () => {
  beforeEach(() => {
    vi.mocked(fetchReviewChapters).mockResolvedValue(CHAPITRES);
  });

  it("🔒 les MATIÈRES suivent le curriculum, comme la grille juste au-dessus", async () => {
    // 🔴 Défaut trouvé à l'écran le 2026-08-14 : les étagères se rangeaient par NOM (Anglais,
    // Français, Mathématiques, SVT) pendant que « Par matière » suivait `Subject.sort_order`.
    // Deux listes des mêmes matières, deux ordres, à deux cents pixels l'une de l'autre.
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");

    const entetes = within(sectionChapitres())
      .getAllByRole("button")
      .map((b) => b.textContent ?? "");
    // Le serveur sert Maths avant SVT ; l'alphabétique les inverserait.
    expect(entetes[0]).toContain("Maths");
    expect(entetes[1]).toContain("SVT");
  });

  it("🔒 garde l'ordre du PROGRAMME, pas l'alphabétique", async () => {
    // Le serveur rend « Zébu » avant « Alphabet » (`Chapter.sort_order`). La brique trie par NOM
    // par défaut — la page lui passe l'ordre d'apparition. Sans `chapterOrder`, « Alphabet »
    // remonterait en tête et l'année scolaire se lirait à l'envers.
    const { container } = render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");
    fireEvent.click(within(sectionChapitres()).getByRole("button", { name: /Maths/ }));

    const noms = [...container.querySelectorAll("p")]
      .map((n) => n.textContent)
      .filter((t) => t === "Zébu" || t === "Alphabet");
    expect(noms).toEqual(["Zébu", "Alphabet"]);
  });

  it("🔒 la recherche traverse les matières, et le clic LANCE la session du chapitre", async () => {
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher un chapitre/), {
      target: { value: "cellules" },
    });
    const section = within(sectionChapitres());
    expect(section.getByText("Cellules")).toBeInTheDocument();
    // On sait d'où vient le résultat : l'en-tête d'étagère le nomme. ⚠️ La matière n'est PAS
    // répétée sur la tuile — elle l'était, et sous « Français » elle s'écrivait quatre fois
    // (défaut vu à l'écran, jamais par un test).
    expect(section.getByRole("button", { name: /SVT/ })).toBeInTheDocument();
    expect(section.queryByText("Zébu")).not.toBeInTheDocument();

    // 🔴 Ici « emmener » (§9(3)) ne demande AUCUNE adresse : la destination est une session, pas
    // une page. Le clic lance le deck du chapitre, quelle que soit la matière ouverte.
    fireEvent.click(screen.getByText("Cellules"));
    expect(navigateMock).toHaveBeenCalledWith(
      "/revision/session",
      expect.objectContaining({
        state: expect.objectContaining({ deck: { chapter: 9 }, label: "Cellules" }),
      }),
    );
  });

  it("🔒 un mot qui ne trouve rien nomme ce qu'on cherchait", async () => {
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Par chapitre");

    fireEvent.change(screen.getByPlaceholderText(/Rechercher un chapitre/), {
      target: { value: "zzzz" },
    });
    expect(screen.getByText(/Aucun chapitre ne correspond à « zzzz »/)).toBeInTheDocument();
  });

  it("aucun chapitre offrable : la section n'existe pas du tout", async () => {
    // Pas de section vide, pas de « bientôt » : le §6 vaut aussi pour le niveau au-dessus.
    vi.mocked(fetchReviewChapters).mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={["/revision"]}>
        <RevisionPage />
      </MemoryRouter>,
    );
    await screen.findByText("Maths");
    expect(screen.queryByText("Par chapitre")).not.toBeInTheDocument();
  });
});
