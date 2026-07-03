import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  type ActiveSchoolYear,
  type CurriculumChapter,
  type CurriculumLesson,
} from "@zetis/types";
import { type Subject, type SubjectDetail } from "../lib/subjects";
import { MatieresPapaPage } from "./MatieresPage";

// Test-verrou de la section « Chapitres de l'année active » : la page Matières montre
// les MÊMES chapitres par matière que la page Programme (lecture seule, badges).

vi.mock("../lib/subjects", () => ({
  fetchSubjects: vi.fn(),
  fetchSubjectDetail: vi.fn(),
  createSubject: vi.fn(),
  createTheme: vi.fn(),
  createChapter: vi.fn(),
}));

vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
  fetchChapters: vi.fn(),
  fetchLessons: vi.fn(),
}));

import { fetchSubjectDetail, fetchSubjects } from "../lib/subjects";
import { fetchActiveSchoolYear, fetchChapters, fetchLessons } from "../lib/curriculum";

const MATHS: Subject = {
  id: 2,
  name: "Mathématiques",
  slug: "mathematiques",
  color: null,
  icon: null,
  sort_order: 0,
  is_active: true,
  theme_count: 0,
  chapter_count: 0,
};

const MATHS_DETAIL: SubjectDetail = { ...MATHS, themes: [] };

const YEAR: ActiveSchoolYear = {
  id: 1,
  label: "2026-2027",
  level: "4e",
  subjects: [
    {
      id: 10,
      subject_id: 2,
      subject_name: "Mathématiques",
      subject_slug: "mathematiques",
      status: "active",
    },
  ],
};

function chapter(over: Partial<CurriculumChapter>): CurriculumChapter {
  return {
    id: 1,
    school_year_subject_id: 10,
    name: "Fractions",
    description: null,
    period: null,
    status: "planned",
    sort_order: 0,
    source: "generated",
    validation_status: "validated",
    program_version: "2020",
    themes: null,
    suggested_class: null,
    repartition: null,
    ...over,
  };
}

function lesson(over: Partial<CurriculumLesson>): CurriculumLesson {
  return {
    id: 1,
    chapter_id: 1,
    title: "Simplification et comparaison de fractions",
    summary: null,
    content: null,
    status: "validated",
    created_by: "ai",
    sort_order: 0,
    program_version: "2020",
    content_created_at: null,
    content_created_by: null,
    content_updated_at: null,
    content_updated_by: null,
    notions: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchSubjects).mockReset().mockResolvedValue([MATHS]);
  vi.mocked(fetchSubjectDetail).mockReset().mockResolvedValue(MATHS_DETAIL);
  vi.mocked(fetchActiveSchoolYear).mockReset().mockResolvedValue(YEAR);
  vi.mocked(fetchChapters).mockReset();
  vi.mocked(fetchLessons).mockReset();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <MatieresPapaPage />
    </MemoryRouter>,
  );
}

describe("MatieresPapaPage — chapitres de l'année active", () => {
  it("sélection d'une matière → mêmes chapitres que Programme, avec badges, lecture seule", async () => {
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 1, name: "Fractions" }),
      chapter({
        id: 2,
        name: "Programmation Scratch",
        source: "manual",
        sort_order: 1,
        program_version: null,
      }),
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Mathématiques/ }));

    expect(await screen.findByText("Fractions")).toBeInTheDocument();
    expect(screen.getByText("Programmation Scratch")).toBeInTheDocument();
    // Les chapitres du référentiel sont chargés via le school_year_subject_id de l'année.
    expect(vi.mocked(fetchChapters)).toHaveBeenCalledWith(10);
    // Badges source + validation, comme dans Programme.
    expect(screen.getByText("IA")).toBeInTheDocument();
    expect(screen.getByText("Manuel")).toBeInTheDocument();
    expect(screen.getAllByText("Validé")).toHaveLength(2);
    // Lecture seule : l'édition vit dans Programme.
    expect(screen.getByRole("link", { name: "Gérer dans Programme" })).toHaveAttribute(
      "href",
      "/programme",
    );
  });

  it("dépliage d'un chapitre → leçons validées seules, cours en lecture seule (modale sans actions)", async () => {
    vi.mocked(fetchChapters).mockResolvedValue([chapter({ id: 1, name: "Fractions" })]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({
        id: 1,
        title: "Simplification et comparaison de fractions",
        content: "# Cours de fractions\n\nContenu du cours validé.",
        content_created_at: "2026-07-01T08:00:00Z",
        content_created_by: "ai",
        content_updated_at: "2026-07-02T09:30:00Z",
        content_updated_by: "parent",
      }),
      lesson({ id: 2, title: "Leçon encore draft", status: "draft" }),
      lesson({ id: 3, title: "Sans cours rédigé", content: null }),
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Mathématiques/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Fractions/ }));

    // Seules les validées apparaissent ; celle sans cours est signalée, pas cliquable.
    expect(
      await screen.findByText(/Simplification et comparaison de fractions/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Leçon encore draft/)).not.toBeInTheDocument();
    expect(screen.getByText("cours en préparation")).toBeInTheDocument();
    expect(vi.mocked(fetchLessons)).toHaveBeenCalledWith(1);

    // Lecture du cours : modale SANS aucune action (ni Rédiger, ni Valider/Rejeter).
    fireEvent.click(
      screen.getByRole("button", {
        name: "Lire le cours de Simplification et comparaison de fractions",
      }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Contenu du cours validé.");
    expect(within(dialog).queryByRole("button", { name: /Rédiger|Régénérer/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Valider" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Rejeter" })).toBeNull();
    // La provenance du cours reste visible en lecture seule — mais pas l'édition.
    expect(dialog).toHaveTextContent(/Rédigé le .+ par IA/);
    expect(dialog).toHaveTextContent(/Modifié le .+ par admin/);
    expect(within(dialog).queryByRole("button", { name: /Modifier le cours|Écrire/ })).toBeNull();
  });

  it("matière hors année active → pas de section référentiel, pas de fetch chapitres", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue({ ...YEAR, subjects: [] });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: /Mathématiques/ }));

    expect(await screen.findByText(/Aucun thème pour l'instant/)).toBeInTheDocument();
    expect(screen.queryByText(/Chapitres de l'année active/)).not.toBeInTheDocument();
    expect(vi.mocked(fetchChapters)).not.toHaveBeenCalled();
  });
});
