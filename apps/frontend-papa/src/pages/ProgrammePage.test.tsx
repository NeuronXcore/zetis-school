import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type ActiveSchoolYear, type CurriculumChapter } from "@zetis/types";
import { ProgrammePage } from "./ProgrammePage";

// Un test de rendu par état de page (liste / vide / erreur), API mockée.

vi.mock("../lib/curriculum", () => ({
  fetchActiveSchoolYear: vi.fn(),
  fetchChapters: vi.fn(),
  generateChapters: vi.fn(),
  createManualChapter: vi.fn(),
  patchChapter: vi.fn(),
  deleteChapter: vi.fn(),
  reorderChapters: vi.fn(),
}));

import { fetchActiveSchoolYear, fetchChapters, generateChapters } from "../lib/curriculum";

const YEAR: ActiveSchoolYear = {
  id: 1,
  label: "2026-2027",
  level: "4e",
  subjects: [
    { id: 10, subject_id: 1, subject_name: "Mathématiques", subject_slug: "mathematiques", status: "active" },
    { id: 11, subject_id: 2, subject_name: "Français", subject_slug: "francais", status: "active" },
  ],
};

function chapter(over: Partial<CurriculumChapter>): CurriculumChapter {
  return {
    id: 1,
    school_year_subject_id: 10,
    name: "Nombres relatifs",
    description: null,
    period: null,
    status: "planned",
    sort_order: 0,
    source: "generated",
    validation_status: "pending",
    program_version: "2020",
    themes: null,
    suggested_class: null,
    repartition: null,
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchActiveSchoolYear).mockReset();
  vi.mocked(fetchChapters).mockReset();
});

describe("ProgrammePage", () => {
  it("état liste : pills + chapitres avec badges source et validation", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 1, name: "Nombres relatifs" }),
      chapter({
        id: 2,
        name: "Programmation Scratch",
        source: "manual",
        validation_status: "validated",
        program_version: null,
        sort_order: 1,
      }),
    ]);

    render(<ProgrammePage />);

    expect(await screen.findByText("Nombres relatifs")).toBeInTheDocument();
    expect(screen.getByText("Programme · cycle 4 — 4e")).toBeInTheDocument();
    // Pills de matières (année active), première matière sélectionnée par défaut.
    expect(screen.getByRole("tab", { name: "Mathématiques" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Français" })).toBeInTheDocument();
    // Deux badges par ligne : source + validation.
    expect(screen.getByText("IA")).toBeInTheDocument();
    expect(screen.getByText("À valider")).toBeInTheDocument();
    expect(screen.getByText("Manuel")).toBeInTheDocument();
    expect(screen.getByText("Validé")).toBeInTheDocument();
    // Actions selon l'état : Valider/Rejeter seulement sur le chapitre pending.
    expect(screen.getAllByRole("button", { name: "Valider" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Rejeter" })).toHaveLength(1);
  });

  it("état vide : EmptyState avec les deux CTA (Générer / Ajouter)", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([]);

    render(<ProgrammePage />);

    expect(
      await screen.findByText("Aucun chapitre pour cette matière"),
    ).toBeInTheDocument();
    // Deux CTA du EmptyState + les deux boutons du header.
    expect(screen.getAllByRole("button", { name: /Générer/ }).length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: /Ajouter/ }).length).toBeGreaterThanOrEqual(2);
  });

  it("pendant la génération : barre de progression estimée avec %, liste inchangée", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([chapter({ id: 1, name: "Nombres relatifs" })]);
    vi.mocked(generateChapters).mockReturnValue(new Promise(() => {})); // appel long en cours

    render(<ProgrammePage />);
    fireEvent.click((await screen.findAllByRole("button", { name: /Générer/ }))[0]);

    // Barre estimée (pattern capsules) : label + pourcentage live, bouton en loading.
    expect(await screen.findByText(/ZETIS génère les chapitres/)).toBeInTheDocument();
    expect(screen.getByText(/%$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Génération en cours/ })).toBeDisabled();
    // La liste reste affichée pendant l'appel.
    expect(screen.getByText("Nombres relatifs")).toBeInTheDocument();
  });

  it("état erreur : message backend verbatim + bouton réessayer", async () => {
    vi.mocked(fetchActiveSchoolYear).mockRejectedValue(
      new Error("Aucune année scolaire active."),
    );

    render(<ProgrammePage />);

    expect(await screen.findByText("Aucune année scolaire active.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});
