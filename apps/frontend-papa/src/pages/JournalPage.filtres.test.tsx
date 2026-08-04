// Tri et filtre du Journal — les verrous de la page Papa (addendum ADR-0034).
//
// Chacun ferme un mode d'échec nommé dans l'ADR, pas une variante de couverture :
//
// 1. **aucun filtre à l'ouverture** — une page déjà filtrée cache son contenu à celui qui a oublié
//    qu'il l'avait filtrée, et c'est le mode d'échec nommé ;
// 2. **le filtrage part au SERVEUR** — filtrer les lots déjà chargés répondrait « rien en maths »
//    alors que les lots de maths sont page 4 ;
// 3. **un lot retenu est rendu ENTIER** — le filtre choisit quels lots on regarde, jamais ce qu'on
//    voit d'un lot ;
// 4. **les critères ACTIFS ne se replient jamais** — un filtre qui se cache est un journal court
//    sans explication ;
// 5. **l'état vide est BAVARD** — un vide muet est indiscernable d'une panne ;
// 6. **le tri non chronologique se signale et se défait d'un geste**.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { type Journal, type JournalRun } from "@zetis/types";
import { JournalPage } from "./JournalPage";

vi.mock("../lib/journal", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/journal")>()),
  fetchJournal: vi.fn(),
  previewRemoval: vi.fn(),
  removePiece: vi.fn(),
}));
vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
  fetchChapters: vi.fn(),
}));
import { fetchJournal } from "../lib/journal";
import { fetchActiveSchoolYear, fetchChapters } from "../lib/curriculum";

const RUN: JournalRun = {
  id: 7,
  status: "done",
  trigger: "manual",
  authorized_by: "parent_direct",
  zetis_mode: "manuel",
  zetis_mode_source: "capture",
  chapter_id: 3,
  total_notions: 4,
  done_notions: 4,
  current_skill_id: null,
  current_skill_name: null,
  created_at: "2026-08-02T18:00:00Z",
  started_at: "2026-08-02T18:01:00Z",
  finished_at: "2026-08-02T18:14:00Z",
  events: [],
  pieces: (["cours", "fiche", "mindmap", "quiz"] as const).map((kind, i) => ({
    kind,
    id: 40 + i,
    label: `Pièce ${kind}`,
    validated_by: "parent_bulk" as const,
    target: null,
    skill_id: 12,
    skill_name: "Additionner des fractions",
    consumed: false,
  })),
};

const JOURNAL: Journal = { runs: [RUN], has_more: false, total: 1 };

function renderPage(url = "/journal") {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <JournalPage />
    </MemoryRouter>,
  );
}

/** Les paramètres de filtre du DERNIER appel — l'index 0 supposerait qu'il n'y en a qu'un. */
function dernierFiltre(): URLSearchParams {
  const appels = vi.mocked(fetchJournal).mock.calls;
  return appels[appels.length - 1]?.[2] ?? new URLSearchParams();
}

beforeEach(() => {
  vi.mocked(fetchJournal).mockReset().mockResolvedValue(JOURNAL);
  vi.mocked(fetchActiveSchoolYear).mockResolvedValue({
    id: 1,
    label: "2026-2027",
    level: "4e",
    subjects: [
      { id: 11, subject_id: 2, subject_name: "Mathématiques", subject_slug: "maths", subject_icon: null, status: "active" },
      { id: 12, subject_id: 3, subject_name: "Français", subject_slug: "francais", subject_icon: null, status: "active" },
    ],
  });
  vi.mocked(fetchChapters).mockResolvedValue([]);
});

describe("Journal — le filtre", () => {
  it("🔒 n'est actif à l'OUVERTURE sur aucun critère", async () => {
    // Une page qui s'ouvrirait déjà filtrée cacherait son contenu à celui qui a oublié qu'il
    // l'avait filtrée. C'est le mode d'échec nommé par l'addendum, pas une préférence.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect([...dernierFiltre().keys()]).toEqual([]);
    expect(screen.queryByRole("button", { name: "Tout effacer" })).not.toBeInTheDocument();
  });

  it("🔒 part au SERVEUR, il ne trie pas les lots déjà chargés", async () => {
    // ⚠️ Le défaut que ce verrou ferme ne ressemble pas à un défaut : une page vide, crédible,
    // et fausse, parce que les lots cherchés sont page 4.
    renderPage();
    await screen.findByText(/Lot #7/);

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(await screen.findByRole("button", { name: /Fiche/ }));

    await waitFor(() => expect(dernierFiltre().getAll("piece")).toEqual(["fiche"]));
  });

  it("🔒 garde le lot ENTIER : filtrer sur Fiche n'enlève ni le cours ni le quiz", async () => {
    // Le filtre choisit quels lots on regarde, jamais ce qu'on voit d'un lot. Masquer les autres
    // pièces ferait dire au Journal que le lot n'a produit que ça — un registre rend compte entier.
    renderPage("/journal?piece=fiche");
    await screen.findByText(/Lot #7/);
    fireEvent.click(screen.getByText(/Voir le contenu du lot/));

    for (const attendu of ["Pièce cours", "Pièce fiche", "Pièce mindmap", "Pièce quiz"]) {
      expect(screen.getByText(attendu)).toBeInTheDocument();
    }
  });

  it("🔒 un critère ACTIF ne peut pas se cacher : le bouton porte son compte", async () => {
    // Les contrôles se replient ; les critères actifs, jamais. Sans ce compte, un journal court
    // n'aurait aucune explication visible.
    renderPage("/journal?piece=fiche&statut=done");
    await screen.findByText(/Lot #7/);

    const plus = screen.getByRole("button", { expanded: false });
    expect(plus).toHaveTextContent("2");
    // Et la ligne de synthèse, elle, est là quoi qu'il arrive.
    expect(screen.getByRole("button", { name: "Tout effacer" })).toBeInTheDocument();
  });

  it("🔒 quand il ne garde RIEN, il dit pourquoi", async () => {
    // Un filtre qui rend vide sans s'expliquer est indiscernable d'une panne — c'est le signal
    // d'échec nommé par l'ADR. Deux causes existent par construction : elles sont nommées.
    vi.mocked(fetchJournal).mockResolvedValue({ runs: [], has_more: false, total: 0 });
    renderPage("/journal?piece=mindmap");

    expect(await screen.findByText(/Aucun lot ne correspond/)).toBeInTheDocument();
    expect(screen.getByText(/bloqués avant de produire quoi que ce soit/)).toBeInTheDocument();
    expect(screen.getByText(/antérieurs au détail par pièce/)).toBeInTheDocument();
  });

  it("un journal vide SANS filtre ne raconte pas d'histoire de filtre", async () => {
    // La contre-épreuve : si l'explication s'affichait toujours, elle ne dirait rien.
    vi.mocked(fetchJournal).mockResolvedValue({ runs: [], has_more: false, total: 0 });
    renderPage();

    expect(await screen.findByText(/Aucun lot de production pour l'instant/)).toBeInTheDocument();
    expect(screen.queryByText(/Aucun lot ne correspond/)).not.toBeInTheDocument();
  });

  it("survit à une année scolaire injoignable", async () => {
    // Un journal qui tomberait parce que ses pastilles de matière n'ont pas chargé serait pire
    // que des pastilles absentes.
    vi.mocked(fetchActiveSchoolYear).mockRejectedValue(new Error("réseau"));
    renderPage();
    expect(await screen.findByText(/Lot #7/)).toBeInTheDocument();
  });
});

describe("Journal — le tri", () => {
  it("🔒 signale qu'il n'est plus chronologique, et se défait d'un GESTE", async () => {
    // L'avertissement a été donné et accepté au cadrage : *un journal qui n'est plus chronologique
    // cesse d'être un journal*. C'est la seule protection qui reste.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(screen.queryByText(/n'est plus dans l'ordre chronologique/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Trier par" }), {
      target: { value: "matiere" },
    });

    expect(await screen.findByText(/n'est plus dans l'ordre chronologique/)).toBeInTheDocument();
    await waitFor(() => expect(dernierFiltre().get("tri")).toBe("matiere"));

    fireEvent.click(screen.getByRole("button", { name: /Revenir à l'ordre du temps/ }));
    await waitFor(() => expect(dernierFiltre().get("tri")).toBeNull());
    expect(screen.queryByText(/n'est plus dans l'ordre chronologique/)).not.toBeInTheDocument();
  });

  it("le tri par défaut ne s'écrit PAS dans l'URL", async () => {
    // Une URL propre est une URL sans filtre : y écrire le défaut ferait croire à un réglage.
    renderPage();
    await screen.findByText(/Lot #7/);
    expect(dernierFiltre().get("sens")).toBeNull();
    expect(dernierFiltre().get("tri")).toBeNull();
  });
});
