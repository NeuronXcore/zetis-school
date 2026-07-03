import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  generateLessonContent: vi.fn(),
}));

import {
  fetchActiveSchoolYear,
  fetchChapters,
  fetchLessons,
  generateChapters,
  generateLessonContent,
  patchLesson,
  rejectLesson,
  validateAllChapters,
  validateLesson,
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
    content: null,
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
  vi.mocked(generateLessonContent).mockReset();
  vi.mocked(validateLesson).mockReset();
  vi.mocked(rejectLesson).mockReset();
  vi.mocked(patchLesson).mockReset();
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

  it("édition d'une leçon avant validation : notions retirables/ajoutables → PATCH complet", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const draft = lesson({
      id: 1,
      chapter_id: 5,
      notions: [
        { skill_id: 7, name: "hypoténuse" },
        { skill_id: 8, name: "carrés des côtés" },
      ],
    });
    vi.mocked(fetchLessons).mockResolvedValue([draft]);
    vi.mocked(patchLesson).mockResolvedValue(draft);

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Modifier ${draft.title}` }),
    );

    // Relecture/correction de la proposition IA : retrait d'une notion, ajout d'une autre.
    fireEvent.click(
      screen.getByRole("button", { name: "Retirer la notion carrés des côtés" }),
    );
    fireEvent.change(screen.getByLabelText("Nouvelle notion"), {
      target: { value: "racine carrée" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer" }));

    // Le PATCH remplace le rattachement complet (les Skill ne sont jamais supprimées).
    await waitFor(() =>
      expect(vi.mocked(patchLesson)).toHaveBeenCalledWith(1, {
        title: draft.title,
        summary: null,
        notions: ["hypoténuse", "racine carrée"],
      }),
    );
  });

  it("modale cours : leçon sans contenu → Rédiger → markdown rendu (leçon remplacée en cache)", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const draft = lesson({ id: 1, chapter_id: 5 });
    vi.mocked(fetchLessons).mockResolvedValue([draft]);
    vi.mocked(generateLessonContent).mockResolvedValue(
      lesson({ id: 1, chapter_id: 5, content: "# Cours\n\nUn paragraphe de cours." }),
    );

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Lire le cours de ${draft.title}` }),
    );

    // État vide de la modale : pas encore de cours → CTA de rédaction locale.
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Pas encore de cours rédigé");
    fireEvent.click(within(dialog).getByRole("button", { name: "⚡ Rédiger le cours" }));

    // La réponse remplace la leçon dans le cache → la modale (dérivée) affiche le markdown.
    expect(await screen.findByText("Un paragraphe de cours.")).toBeInTheDocument();
    expect(vi.mocked(generateLessonContent)).toHaveBeenCalledWith(1);
    expect(
      within(screen.getByRole("dialog")).getByRole("button", { name: "↻ Régénérer le cours" }),
    ).toBeInTheDocument();
  });

  it("modale cours : leçon avec contenu → markdown direct ; erreur de rédaction verbatim", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const withContent = lesson({
      id: 1,
      chapter_id: 5,
      content: "# Déjà rédigé\n\nContenu existant du cours.",
    });
    vi.mocked(fetchLessons).mockResolvedValue([withContent]);
    vi.mocked(generateLessonContent).mockRejectedValue(
      new Error("Génération échouée : appel LLM échoué."),
    );

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Lire le cours de ${withContent.title}` }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Contenu existant du cours.");

    // Régénération en échec : detail backend verbatim DANS la modale, contenu conservé.
    fireEvent.click(within(dialog).getByRole("button", { name: "↻ Régénérer le cours" }));
    expect(
      await screen.findByText("Génération échouée : appel LLM échoué."),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent("Contenu existant du cours.");
  });

  it("modale cours : Valider sur place — badge à jour, modale ouverte, sans repasser par la liste", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const draft = lesson({ id: 1, chapter_id: 5, content: "# Cours\n\nTexte du cours." });
    // 1er fetch : draft ; re-fetch après validation : la même leçon validée.
    vi.mocked(fetchLessons)
      .mockResolvedValueOnce([draft])
      .mockResolvedValueOnce([{ ...draft, status: "validated" }]);
    vi.mocked(validateLesson).mockResolvedValue({ ...draft, status: "validated" });

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Lire le cours de ${draft.title}` }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Valider" }));

    expect(vi.mocked(validateLesson)).toHaveBeenCalledWith(1);
    // La modale reste ouverte, le badge se met à jour, les actions draft disparaissent.
    await waitFor(() =>
      expect(within(screen.getByRole("dialog")).getByText("Validé")).toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("dialog")).queryByRole("button", { name: "Valider" }),
    ).not.toBeInTheDocument();
  });

  it("modale cours : Rejeter sur place archive la leçon et ferme la modale", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const draft = lesson({ id: 1, chapter_id: 5, content: "# Cours\n\nTexte du cours." });
    vi.mocked(fetchLessons)
      .mockResolvedValueOnce([draft])
      .mockResolvedValueOnce([{ ...draft, status: "archived" }]);
    vi.mocked(rejectLesson).mockResolvedValue({ ...draft, status: "archived" });

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Lire le cours de ${draft.title}` }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Rejeter" }));

    expect(vi.mocked(rejectLesson)).toHaveBeenCalledWith(1);
    // Leçon archivée = hors du flux : la modale (dérivée de la liste) se ferme seule.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("lot « Rédiger les cours manquants » : validées sans cours seulement, séquentiel", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, title: "Sans cours A", status: "validated" }),
      lesson({ id: 2, chapter_id: 5, title: "Sans cours B", status: "validated" }),
      lesson({ id: 3, chapter_id: 5, title: "Déjà rédigée", status: "validated", content: "# X" }),
      lesson({ id: 4, chapter_id: 5, title: "Encore draft" }), // draft : hors lot
    ]);
    vi.mocked(generateLessonContent).mockImplementation((id: number) =>
      Promise.resolve(
        lesson({ id, chapter_id: 5, status: "validated", content: "# Cours généré" }),
      ),
    );

    render(<ProgrammePage />);
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));

    // Compteur = validées sans cours uniquement (2) — ni la rédigée, ni la draft.
    const batchBtn = await screen.findByRole("button", {
      name: "⚡ Rédiger les cours manquants (2)",
    });
    fireEvent.click(batchBtn);

    await waitFor(() =>
      expect(vi.mocked(generateLessonContent)).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(generateLessonContent)).toHaveBeenNthCalledWith(1, 1);
    expect(vi.mocked(generateLessonContent)).toHaveBeenNthCalledWith(2, 2);
    // Tout est rédigé : le bouton disparaît.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Rédiger les cours manquants/ }),
      ).not.toBeInTheDocument(),
    );
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
