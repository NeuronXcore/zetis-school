import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useParams } from "react-router-dom";
import { type FicheTile, type StudentCours } from "@zetis/types";
import { CoursPage } from "./CoursPage";

// Page Cours (élève) : chapitres/leçons validés servis par l'API élève, lecture du
// markdown, leçon sans cours = « bientôt disponible » (jamais de vocabulaire d'atelier).

vi.mock("../lib/cours", () => ({
  fetchStudentCours: vi.fn(),
  fetchStudentLessonCours: vi.fn(),
}));
vi.mock("../lib/quiz", () => ({ fetchSubjectQuizzes: vi.fn() }));
vi.mock("../lib/fiches", () => ({ fetchSubjectFicheTiles: vi.fn() }));

import { fetchStudentCours, fetchStudentLessonCours } from "../lib/cours";
import { fetchSubjectQuizzes } from "../lib/quiz";
import { fetchSubjectFicheTiles } from "../lib/fiches";

const COURS: StudentCours = {
  subject_id: 1,
  subject_name: "Français",
  subject_slug: "francais",
  level: "4e",
  chapters: [
    {
      id: 1,
      name: "Lecture et compréhension",
      description: null,
      lessons: [
        {
          id: 1,
          title: "Lire et comprendre un texte narratif",
          summary: "Identifier le narrateur.",
          has_content: true,
        },
        { id: 2, title: "Résumer un texte lu", summary: null, has_content: false },
      ],
    },
  ],
};

function tuileMaFiche(lessonId: number, ficheId: number): FicheTile {
  return {
    lesson_id: lessonId,
    title: "Lire et comprendre un texte narratif",
    chapter: "Lecture et compréhension",
    subject_slug: "francais",
    etat: "ma_fiche",
    draft_id: null,
    fiche_id: ficheId,
    zetis_fiche_id: null,
    seen: true,
    versions: 1,
    etapes_remplies: 0,
    points_choisis: 0,
    updated_at: null,
  };
}

beforeEach(() => {
  vi.mocked(fetchStudentCours).mockReset().mockResolvedValue(COURS);
  vi.mocked(fetchStudentLessonCours).mockReset();
  vi.mocked(fetchSubjectQuizzes).mockReset().mockResolvedValue([]);
  vi.mocked(fetchSubjectFicheTiles).mockReset().mockResolvedValue([]);
});

/** Témoin de destination : on vérifie OÙ le bouton mène, query comprise. */
function Temoin() {
  const loc = useLocation();
  return <div>{`destination:${loc.pathname}${loc.search}`}</div>;
}

function AtelierTemoin() {
  const { lessonId } = useParams();
  return <div>{`atelier-lecon-${lessonId}`}</div>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/subjects/francais/cours"]}>
      <Routes>
        <Route path="/subjects/:slug/cours" element={<CoursPage />} />
        <Route path="/fiches/:slug" element={<Temoin />} />
        <Route path="/fiches/:slug/:lessonId/atelier" element={<AtelierTemoin />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CoursPage", () => {
  it("liste les leçons validées : Lire → pour celles avec cours, « bientôt » sinon", async () => {
    renderPage();

    expect(await screen.findByText("📘 Cours — Français")).toBeInTheDocument();
    // Premier chapitre avec leçons déplié d'office.
    expect(screen.getByText(/Lire et comprendre un texte narratif/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lire →" })).toBeInTheDocument();
    expect(screen.getByText("bientôt disponible")).toBeInTheDocument();
    // Aucun vocabulaire d'atelier côté élève.
    expect(screen.queryByText(/À valider|Valider|IA|Manuel/)).not.toBeInTheDocument();
    expect(vi.mocked(fetchStudentCours)).toHaveBeenCalledWith("francais");
  });

  it("Lire → ouvre le cours en markdown, retour aux leçons", async () => {
    vi.mocked(fetchStudentLessonCours).mockResolvedValue({
      id: 1,
      title: "Lire et comprendre un texte narratif",
      summary: null,
      content: "# Mon cours\n\nUn paragraphe pour Massimo.",
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Lire →" }));

    expect(await screen.findByText("Un paragraphe pour Massimo.")).toBeInTheDocument();
    expect(vi.mocked(fetchStudentLessonCours)).toHaveBeenCalledWith(1);

    fireEvent.click(screen.getByRole("button", { name: "← Retour aux leçons" }));
    expect(await screen.findByRole("button", { name: "Lire →" })).toBeInTheDocument();
  });

  it("affiche le bouton 🎯 Quiz sur une leçon qui a un quiz", async () => {
    vi.mocked(fetchSubjectQuizzes).mockResolvedValue([
      { quiz_id: 9, title: "Quiz — Lire et comprendre", lesson_id: 1, questions: [] },
    ]);
    renderPage();
    // Le bouton apparaît après le fetch non bloquant des quiz de la matière.
    expect(await screen.findByRole("button", { name: /Quiz/ })).toBeInTheDocument();
  });
});

// ── La 3ᵉ porte : cours → SA fiche (ADR-0054 §1) ────────────────────────────────

describe("CoursPage — la 3ᵉ porte", () => {
  it("🔴 n'envoie PAS à l'atelier quand sa fiche est FINIE — c'est ce qui l'effaçait", async () => {
    // Le bouton était inconditionnel : sur une leçon déjà fichée il ouvrait l'atelier, qui
    // fabriquait un brouillon VIDE en v2 masquant la fiche finie. Massimo perdait son travail
    // en cliquant sur un bouton qui promettait de le faire. Ce test est le désamorçage.
    vi.mocked(fetchSubjectFicheTiles).mockResolvedValue([tuileMaFiche(1, 100)]);
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: /Ma fiche/ }));
    expect(await screen.findByText("destination:/fiches/francais?fiche=100")).toBeInTheDocument();
    expect(screen.queryByText(/atelier-lecon/)).not.toBeInTheDocument();
  });

  it("dit « ✍️ Ma fiche » quand elle existe, « 🧩 En faire ma fiche » sinon", async () => {
    vi.mocked(fetchSubjectFicheTiles).mockResolvedValue([tuileMaFiche(1, 100)]);
    renderPage();
    expect(await screen.findByRole("button", { name: /✍️ Ma fiche/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /En faire ma fiche/ })).not.toBeInTheDocument();
  });

  it("envoie à l'atelier quand aucune fiche personnelle n'existe", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /En faire ma fiche/ }));
    expect(await screen.findByText("atelier-lecon-1")).toBeInTheDocument();
  });

  it("retombe sur « En faire ma fiche » si `fiche-tiles` échoue — la page reste entière", async () => {
    // Chargement NON bloquant, comme les quiz : la porte disparaît, le cours reste lisible.
    vi.mocked(fetchSubjectFicheTiles).mockRejectedValue(new Error("réseau"));
    renderPage();
    expect(await screen.findByRole("button", { name: /En faire ma fiche/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lire →" })).toBeInTheDocument();
  });

  it("ne traite PAS un brouillon commencé comme une fiche finie", async () => {
    // `commencee` → l'atelier est la bonne destination : `openDraft` retrouve SON brouillon et
    // ne fabrique aucune version. La mine n'existe que sur `ma_fiche`.
    vi.mocked(fetchSubjectFicheTiles).mockResolvedValue([
      { ...tuileMaFiche(1, 100), etat: "commencee", draft_id: 51, fiche_id: null },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /En faire ma fiche/ }));
    expect(await screen.findByText("atelier-lecon-1")).toBeInTheDocument();
  });
});
