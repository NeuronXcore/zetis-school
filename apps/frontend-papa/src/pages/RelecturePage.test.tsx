import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewQueue } from "@zetis/types";

vi.mock("../lib/reviewQueue", () => ({ fetchReviewQueue: vi.fn() }));
vi.mock("../lib/reviewActions", () => ({ reviewAction: vi.fn().mockResolvedValue(undefined) }));

import { fetchReviewQueue } from "../lib/reviewQueue";
import { reviewAction } from "../lib/reviewActions";
import { RelecturePage } from "./RelecturePage";

const QUEUE: ReviewQueue = {
  counts: { lesson: 2, fiche: 1, mindmap: 1, capsule: 1, chapter: 1, diagnostic: 1, total: 7 },
  subjects: [
    { id: 3, name: "Mathématiques", slug: "mathematiques" },
    { id: 5, name: "Français", slug: "francais" },
  ],
  items: [
    {
      kind: "lesson",
      id: 42,
      title: "Additionner des relatifs",
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      chapter_id: 9,
      chapter: "Nombres relatifs",
      lesson_id: 42,
      lesson: "Additionner des relatifs",
      created_at: null,
    },
    {
      kind: "fiche",
      id: 7,
      title: "Multiplier des relatifs",
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      chapter_id: 9,
      chapter: "Nombres relatifs",
      lesson_id: 43,
      lesson: "Multiplier des relatifs",
      created_at: null,
    },
    {
      kind: "capsule",
      id: 12,
      title: "Les relatifs en 3 minutes",
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      chapter_id: null,
      chapter: null,
      lesson_id: null,
      lesson: null,
      created_at: null,
    },
    {
      kind: "chapter",
      id: 9,
      title: "Théorème de Pythagore",
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      chapter_id: 9,
      chapter: "Théorème de Pythagore",
      lesson_id: null,
      lesson: null,
      created_at: null,
    },
    {
      // 6ᵉ famille (adr-0043). Ses TROIS `null` sont l'information : un diagnostic mesure une
      // matière, il n'a ni chapitre ni leçon. C'est ce qui le prive de lien d'ouverture tant que
      // la page `/diagnostics` ne sait pas ouvrir un objet précis (session C).
      kind: "diagnostic",
      id: 12,
      title: "Diagnostic — Mathématiques",
      subject_id: 3,
      subject: "Mathématiques",
      subject_slug: "mathematiques",
      chapter_id: null,
      chapter: null,
      lesson_id: null,
      lesson: null,
      created_at: null,
    },
  ],
};

function renderPage(entree = "/relecture") {
  return render(
    <MemoryRouter initialEntries={[entree]}>
      <Routes>
        <Route path="/relecture" element={<RelecturePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("RelecturePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchReviewQueue).mockResolvedValue(QUEUE);
    vi.mocked(reviewAction).mockResolvedValue(undefined);
  });

  it("groupe les contenus par famille, sans les entrelacer", async () => {
    renderPage();

    await screen.findByText("Additionner des relatifs");
    const familles = screen.getAllByRole("heading", { hidden: true });
    expect(familles.length).toBeGreaterThan(0);
    expect(screen.getByText("Les relatifs en 3 minutes")).toBeTruthy();
    expect(screen.getByText("Théorème de Pythagore")).toBeTruthy();
  });

  it("lit ?kind= au chargement et le passe au serveur", async () => {
    renderPage("/relecture?kind=fiche");

    await waitFor(() =>
      expect(fetchReviewQueue).toHaveBeenCalledWith({ subjectId: null, kind: "fiche" }),
    );
    expect(screen.getByRole("button", { name: /Fiches/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("retombe sur « Tout » quand ?kind= est inconnu, sans blanchir la page", async () => {
    // Un lien périmé ne doit pas rendre une page vide qu'on croirait cassée.
    renderPage("/relecture?kind=quiz");

    await waitFor(() =>
      expect(fetchReviewQueue).toHaveBeenCalledWith({ subjectId: null, kind: null }),
    );
    // `/^Tout/` seul attraperait aussi « Toutes les matières » de SubjectFilterChips.
    expect(screen.getByRole("button", { name: /^Tout · \d+$/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("🔴 filtrer n'effondre AUCUN compteur de pastille", async () => {
    // Leçon déjà payée deux fois (filterCounts, allSubjects) : des pastilles qui tombent à zéro
    // obligent à repasser par « Tout » pour savoir ce qui reste ailleurs.
    vi.mocked(fetchReviewQueue).mockResolvedValue({
      ...QUEUE,
      items: QUEUE.items.filter((item) => item.kind === "fiche"),
    });
    renderPage("/relecture?kind=fiche");

    await screen.findByText("Multiplier des relatifs");
    expect(screen.getByRole("button", { name: /Cours · 2/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Capsules · 1/ })).toBeTruthy();
    // La 6ᵉ famille tient la même règle que les cinq autres — elle n'est pas un cas à part.
    expect(screen.getByRole("button", { name: /Diagnostics · 1/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Tout · 7$/ })).toBeTruthy();
  });

  it("valider retire la ligne sans recharger la file", async () => {
    renderPage();
    await screen.findByText("Multiplier des relatifs");
    const appelsAvant = vi.mocked(fetchReviewQueue).mock.calls.length;

    const ligne = screen.getByText("Multiplier des relatifs").closest("li")!;
    fireEvent.click(within(ligne).getByRole("button", { name: "Valider" }));

    await waitFor(() => expect(reviewAction).toHaveBeenCalledWith("fiche", "validate", 7));
    await waitFor(() => expect(screen.queryByText("Multiplier des relatifs")).toBeNull());
    // Les autres lignes ne bougent pas, et la file ne se relit pas sous le curseur.
    expect(screen.getByText("Additionner des relatifs")).toBeTruthy();
    expect(vi.mocked(fetchReviewQueue).mock.calls.length).toBe(appelsAvant);
  });

  it("rejeter demande confirmation avant d'agir", async () => {
    renderPage();
    await screen.findByText("Multiplier des relatifs");

    const ligne = screen.getByText("Multiplier des relatifs").closest("li")!;
    fireEvent.click(within(ligne).getByRole("button", { name: "Rejeter" }));

    // Le geste n'est pas parti : un rejet se confirme, une validation non (elle est réversible
    // par régénération).
    expect(reviewAction).not.toHaveBeenCalled();
    const dialogue = await screen.findByRole("dialog");
    expect(within(dialogue).getByText(/n'atteindra pas Massimo/)).toBeTruthy();
    fireEvent.click(within(dialogue).getByRole("button", { name: "Rejeter" }));
    await waitFor(() => expect(reviewAction).toHaveBeenCalledWith("fiche", "reject", 7));
  });

  it("rétablit la ligne et dit pourquoi quand le verdict échoue", async () => {
    vi.mocked(reviewAction).mockRejectedValueOnce(new Error("Le serveur a refusé"));
    renderPage();
    await screen.findByText("Multiplier des relatifs");

    const ligne = screen.getByText("Multiplier des relatifs").closest("li")!;
    fireEvent.click(within(ligne).getByRole("button", { name: "Valider" }));

    await screen.findByText("Le serveur a refusé");
    await waitFor(() => expect(screen.getByText("Multiplier des relatifs")).toBeTruthy());
  });

  it("sort vers la page de pilotage de chaque type", async () => {
    renderPage();
    await screen.findByText("Les relatifs en 3 minutes");

    const capsule = screen.getByText("Les relatifs en 3 minutes").closest("li")!;
    expect(within(capsule).getByRole("link", { name: "Voir →" })).toHaveAttribute(
      "href",
      "/capsules?subject=3&focus=12",
    );
    const chapitre = screen.getByText("Théorème de Pythagore").closest("li")!;
    expect(within(chapitre).getByRole("link", { name: "Voir →" })).toHaveAttribute(
      "href",
      "/programme?subject=3&chapter=9",
    );
  });

  it("affiche un fil PARTIEL sans le combler pour un chapitre", async () => {
    renderPage();
    await screen.findByText("Théorème de Pythagore");

    const chapitre = screen.getByText("Théorème de Pythagore").closest("li")!;
    // Le fil s'arrête à la matière : le chapitre EST le titre, le répéter ne dirait rien de plus.
    expect(within(chapitre).getByText("Mathématiques")).toBeTruthy();
  });

  it("ne répète pas le titre dans le fil", () => {
    // Vu à l'écran : le titre d'un cours est celui de sa leçon, celui d'une fiche est emprunté à
    // la sienne — le fil affichait donc deux fois la même chose, l'une sous l'autre.
    renderPage();

    return screen.findByText("Additionner des relatifs").then(() => {
      const cours = screen.getByText("Additionner des relatifs").closest("li")!;
      expect(within(cours).getByText("Mathématiques › Nombres relatifs")).toBeTruthy();
    });
  });

  it("écrit l'état vide au lieu de féliciter", async () => {
    vi.mocked(fetchReviewQueue).mockResolvedValue({
      counts: { lesson: 0, fiche: 0, mindmap: 0, capsule: 0, chapter: 0, diagnostic: 0, total: 0 },
      subjects: [],
      items: [],
    });
    renderPage();

    await screen.findByText(/Rien n'attend de relecture/);
    expect(screen.queryByText(/bravo|félicitations|🎉/i)).toBeNull();
  });

  describe("🔴 ce que la page s'interdit (adr-0039 §7)", () => {
    it("n'affiche aucune barre de progression ni aucun pourcentage", async () => {
      renderPage();
      await screen.findByText("Additionner des relatifs");

      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(document.body.textContent).not.toMatch(/\d+\s*%/);
      expect(document.body.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
    });

    it("n'offre AUCUNE validation en lot", async () => {
      // « Valider les 6 » serait l'agrégat de provenance que page-couverture.md §F.2 refuse,
      // déplacé d'une page.
      renderPage();
      await screen.findByText("Additionner des relatifs");

      const boutons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
      expect(boutons.some((label) => /tout valider|tout relire|valider les/i.test(label))).toBe(
        false,
      );
    });

    it("n'offre AUCUN contrôle de tri", async () => {
      // « Le plus vieux d'abord » est un reproche daté. L'ordre vient du serveur.
      renderPage();
      await screen.findByText("Additionner des relatifs");

      const boutons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
      expect(boutons.some((label) => /trier|ancienneté|plus récent/i.test(label))).toBe(false);
      expect(screen.queryByRole("combobox")).toBeNull();
    });

    it("n'offre ni Éditer, ni Régénérer, ni Supprimer — relire n'est pas produire", async () => {
      renderPage();
      await screen.findByText("Additionner des relatifs");

      const boutons = screen.getAllByRole("button").map((b) => b.textContent ?? "");
      expect(boutons.some((label) => /Éditer|Régénérer|Supprimer/i.test(label))).toBe(false);
    });
  });
});
