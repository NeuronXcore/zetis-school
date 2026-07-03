import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  type ActiveSchoolYear,
  type CurriculumChapter,
  type CurriculumLesson,
} from "@zetis/types";
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
  validateAllChapters: vi.fn(),
  validateAllActiveYear: vi.fn(),
  fetchLessons: vi.fn(),
  generateLessons: vi.fn(),
  createManualLesson: vi.fn(),
  patchLesson: vi.fn(),
  validateLesson: vi.fn(),
  rejectLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderLessons: vi.fn(),
}));

import {
  fetchActiveSchoolYear,
  fetchChapters,
  fetchLessons,
  generateChapters,
  validateAllChapters,
} from "../lib/curriculum";

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

function lesson(over: Partial<CurriculumLesson>): CurriculumLesson {
  return {
    id: 1,
    chapter_id: 1,
    title: "Découvrir la relation dans le triangle rectangle",
    summary: null,
    status: "draft",
    created_by: "ai",
    sort_order: 0,
    program_version: "2020",
    notions: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchActiveSchoolYear).mockReset();
  vi.mocked(fetchChapters).mockReset();
  vi.mocked(fetchLessons).mockReset();
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

  it("validation par lot : bouton → modal avec compte → confirmation → API + notice", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 1, name: "Nombres relatifs" }), // pending
      chapter({ id: 2, name: "Fractions", validation_status: "rejected" }),
    ]);
    vi.mocked(validateAllChapters).mockResolvedValue({ validated_count: 1 });

    render(<ProgrammePage />);
    await screen.findByText("Nombres relatifs"); // liste chargée → pendingCount à jour
    const btn = screen.getByRole("button", { name: "✓ Tout valider" });
    expect(btn).toBeEnabled(); // 1 pending → actif
    fireEvent.click(btn);

    // Modal : portée matière par défaut, avec le compte exact des pending (pas les rejetés).
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Cette matière — Mathématiques (1 chapitre en attente)");
    expect(dialog).toHaveTextContent("Les chapitres rejetés et manuels ne sont pas modifiés");

    fireEvent.click(within(dialog).getByRole("button", { name: "Valider" }));
    expect(await screen.findByText("1 chapitre validé.")).toBeInTheDocument();
    expect(vi.mocked(validateAllChapters)).toHaveBeenCalledWith(10);
  });

  it("dépliage : leçons chargées à la demande, archived masquée, notions en chips", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({
        id: 1,
        chapter_id: 5,
        notions: [
          { skill_id: 7, name: "hypoténuse" },
          { skill_id: 8, name: "carrés des côtés" },
        ],
      }),
      lesson({ id: 2, chapter_id: 5, title: "Leçon écartée", status: "archived" }),
    ]);

    render(<ProgrammePage />);
    // Aucun fetch de leçons au chargement de la page (paresseux).
    await screen.findByText("Théorème de Pythagore");
    expect(vi.mocked(fetchLessons)).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Théorème de Pythagore" }));

    expect(
      await screen.findByText("Découvrir la relation dans le triangle rectangle"),
    ).toBeInTheDocument();
    expect(vi.mocked(fetchLessons)).toHaveBeenCalledWith(5);
    // Leçon archivée : hors du flux, jamais affichée.
    expect(screen.queryByText("Leçon écartée")).not.toBeInTheDocument();
    // Notions en chips lecture seule.
    expect(screen.getByText("hypoténuse")).toBeInTheDocument();
    expect(screen.getByText("carrés des côtés")).toBeInTheDocument();
    // Chapitre validé → « Proposer des leçons » visible (même condition que le 409 backend).
    expect(
      screen.getByRole("button", { name: "⚡ Proposer des leçons" }),
    ).toBeInTheDocument();
  });

  it("chapitre pending déplié : pas de bouton « Proposer des leçons »", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 6, name: "Proportionnalité" }), // generated + pending
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([]);

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Proportionnalité" }));

    // Le panneau est bien là (ajout manuel possible), mais pas la passe 2.
    expect(
      await screen.findByRole("button", { name: "+ Ajouter une leçon" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "⚡ Proposer des leçons" }),
    ).not.toBeInTheDocument();
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
