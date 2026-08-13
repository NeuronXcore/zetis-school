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
  fetchSubjectFicheTiles: vi.fn(),
  fetchFiche: vi.fn(),
  markFicheSeen: vi.fn(),
  fetchFichesSummary: vi.fn(),
}));
vi.mock("../lib/fiches", () => api);

import { FicheSubjectPage } from "./FicheSubjectPage";

function tuile(p: Partial<FicheTile> & Pick<FicheTile, "lesson_id" | "title" | "etat">): FicheTile {
  return {
    chapter: "Grammaire",
    subject_slug: "francais",
    draft_id: null,
    fiche_id: null,
    zetis_fiche_id: null,
    seen: true,
    versions: 0,
    etapes_remplies: 0,
    points_choisis: 0,
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

function monter() {
  return render(
    <MemoryRouter initialEntries={["/fiches/francais"]}>
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
  api.fetchSubjectFicheTiles.mockResolvedValue(TUILES);
  api.markFicheSeen.mockResolvedValue(undefined);
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
    api.fetchSubjectFicheTiles.mockResolvedValue([
      tuile({ lesson_id: 8, title: "Le récit", etat: "ma_fiche", fiche_id: 100, zetis_fiche_id: 200 }),
    ]);
    monter();
    expect(await screen.findByText(/Voir la fiche de ZETIS/)).toBeInTheDocument();
  });
});
