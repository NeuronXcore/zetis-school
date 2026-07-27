import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { type StudentCours } from "@zetis/types";
import { CoursPage } from "./CoursPage";

// Page Cours (élève) : chapitres/leçons validés servis par l'API élève, lecture du
// markdown, leçon sans cours = « bientôt disponible » (jamais de vocabulaire d'atelier).

vi.mock("../lib/cours", () => ({
  fetchStudentCours: vi.fn(),
  fetchStudentLessonCours: vi.fn(),
}));
vi.mock("../lib/quiz", () => ({ fetchSubjectQuizzes: vi.fn() }));

import { fetchStudentCours, fetchStudentLessonCours } from "../lib/cours";
import { fetchSubjectQuizzes } from "../lib/quiz";

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

beforeEach(() => {
  vi.mocked(fetchStudentCours).mockReset().mockResolvedValue(COURS);
  vi.mocked(fetchStudentLessonCours).mockReset();
  vi.mocked(fetchSubjectQuizzes).mockReset().mockResolvedValue([]);
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/subjects/francais/cours"]}>
      <Routes>
        <Route path="/subjects/:slug/cours" element={<CoursPage />} />
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
