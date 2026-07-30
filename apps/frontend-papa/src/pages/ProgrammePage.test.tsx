import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  type ActiveSchoolYear,
  type CurriculumChapter,
  type CurriculumLesson,
} from "@zetis/types";
import { ProgrammePage } from "./ProgrammePage";

/** La page lit ses paramètres d'URL (lien profond « débloquer cette leçon » venu de la
 *  Couverture) : elle exige donc un Router, comme dans l'app réelle. `route` permet de
 *  tester le ciblage. */
function renderPage(route = "/programme") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <ProgrammePage />
    </MemoryRouter>,
  );
}

// Un test de rendu par état de page (liste / vide / erreur), API mockée.

// L'éditeur riche (Lexical) est hostile à jsdom et lazy-loadé : mock en textarea —
// même contrat { initialMarkdown, onChange }, le lazy est neutralisé au passage.
vi.mock("../components/programme/LessonContentEditor", () => ({
  default: ({
    initialMarkdown,
    onChange,
  }: {
    initialMarkdown: string;
    onChange: (markdown: string) => void;
  }) => (
    <textarea
      aria-label="Éditeur de cours"
      defaultValue={initialMarkdown}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Le panneau « Demandes de Massimo » fetch au montage : mocké vide → invisible ici.
vi.mock("../lib/notionRequests", () => ({
  fetchNotionRequests: vi.fn().mockResolvedValue([]),
  resolveNotionRequest: vi.fn(),
}));

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
  extendLessons: vi.fn(),
  fetchLessons: vi.fn(),
  generateLessons: vi.fn(),
  createManualLesson: vi.fn(),
  patchLesson: vi.fn(),
  validateLesson: vi.fn(),
  rejectLesson: vi.fn(),
  deleteLesson: vi.fn(),
  reorderLessons: vi.fn(),
  generateLessonContent: vi.fn(),
  generateSkillsBackfill: vi.fn(),
  confirmSkillsBackfill: vi.fn(),
  fetchOrphanNotions: vi.fn(() => Promise.resolve([])),
  deleteOrphanNotion: vi.fn(),
}));

import {
  extendLessons,
  fetchActiveSchoolYear,
  fetchChapters,
  fetchLessons,
  generateChapters,
  generateLessonContent,
  generateLessons,
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
    { id: 10, subject_id: 1, subject_name: "Mathématiques", subject_slug: "mathematiques", subject_icon: "➗", status: "active" },
    { id: 11, subject_id: 2, subject_name: "Français", subject_slug: "francais", subject_icon: "📖", status: "active" },
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
    content_created_at: null,
    content_created_by: null,
    content_updated_at: null,
    content_updated_by: null,
    notions: [],
    ...over,
  };
}

beforeEach(() => {
  vi.mocked(fetchActiveSchoolYear).mockReset();
  vi.mocked(fetchChapters).mockReset();
  vi.mocked(fetchLessons).mockReset();
  vi.mocked(extendLessons).mockReset();
  vi.mocked(generateLessons).mockReset();
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

    renderPage();

    expect(await screen.findByText("Nombres relatifs")).toBeInTheDocument();
    expect(screen.getByText("Programme · cycle 4 — 4e")).toBeInTheDocument();
    // Pills de matières (année active), première matière sélectionnée par défaut.
    expect(screen.getByRole("tab", { name: "Mathématiques" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Français" })).toBeInTheDocument();
    // Emoji de la matière devant le nom — aria-hidden : le nom accessible reste propre.
    expect(screen.getByRole("tab", { name: "Mathématiques" })).toHaveTextContent("➗");
    expect(screen.getByRole("tab", { name: "Français" })).toHaveTextContent("📖");
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

    renderPage();

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

    renderPage();
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

    renderPage();
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

  it("lien profond : sélectionne la matière, déplie le chapitre, cible la leçon", async () => {
    // Le parcours « débloquer » depuis la Couverture. Le lien porte le subject_id (2 =
    // Français) ; la page doit le traduire en school_year_subject_id (11) toute seule —
    // sinon elle afficherait Mathématiques, sélectionnée par défaut.
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Lecture et compréhension", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, title: "Comprendre l'implicite", status: "draft" }),
    ]);

    renderPage("/programme?subject=2&chapter=5&lesson=1");

    // Le chapitre est déplié D'OFFICE : la leçon visée est visible sans un clic de plus.
    await waitFor(() => expect(vi.mocked(fetchLessons)).toHaveBeenCalledWith(5));
    const row = await screen.findByText("Comprendre l'implicite");
    expect(row).toBeTruthy();
    // La matière du lien a bien été sélectionnée (fetch des chapitres du sysId 11).
    expect(vi.mocked(fetchChapters)).toHaveBeenCalledWith(11);
  });

  it("sans paramètres, aucun chapitre n'est déplié d'office", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Lecture et compréhension", validation_status: "validated" }),
    ]);

    renderPage();
    await screen.findByText("Lecture et compréhension");
    expect(vi.mocked(fetchLessons)).not.toHaveBeenCalled();
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

    renderPage();
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

    renderPage();
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

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Lire le cours de ${draft.title} (cours non rédigé)`,
      }),
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

    renderPage();
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

    renderPage();
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

    renderPage();
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

    renderPage();
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

  it("lot chapitre : continue après un échec isolé, résumé dans le bandeau", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, title: "Sans cours A", status: "validated" }),
      lesson({ id: 2, chapter_id: 5, title: "Sans cours B", status: "validated" }),
    ]);
    vi.mocked(generateLessonContent).mockImplementation((id: number) =>
      id === 1
        ? Promise.reject(new Error("Appel LLM échoué."))
        : Promise.resolve(lesson({ id, chapter_id: 5, status: "validated", content: "# OK" })),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "⚡ Rédiger les cours manquants (2)" }),
    );

    // L'échec de la leçon 1 n'arrête pas le lot : la 2 est quand même rédigée.
    await waitFor(() =>
      expect(vi.mocked(generateLessonContent)).toHaveBeenCalledTimes(2),
    );
    expect(
      await screen.findByText(/Rédaction en échec pour 1 cours : « Sans cours A » — Appel LLM échoué\./),
    ).toBeInTheDocument();
    // La rédigée sort du compteur : il ne reste que la leçon en échec.
    expect(
      screen.getByRole("button", { name: "⚡ Rédiger les cours manquants (1)" }),
    ).toBeInTheDocument();
  });

  it("lot chapitre : coupe-circuit après 3 échecs consécutifs, le reste jamais tenté", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue(
      [1, 2, 3, 4].map((id) =>
        lesson({ id, chapter_id: 5, title: `Sans cours ${id}`, status: "validated" }),
      ),
    );
    vi.mocked(generateLessonContent).mockRejectedValue(
      new Error("Moteur local indisponible."),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "⚡ Rédiger les cours manquants (4)" }),
    );

    expect(
      await screen.findByText(/Arrêt après 3 échecs consécutifs\./),
    ).toBeInTheDocument();
    // Coupe-circuit : la 4e leçon n'est jamais tentée.
    expect(vi.mocked(generateLessonContent)).toHaveBeenCalledTimes(3);
    expect(screen.getByText(/Rédaction en échec pour 3 cours/)).toBeInTheDocument();
  });

  it("modale cours : « Écrire à la main » → éditeur → Enregistrer → PATCH content ciblé", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const draft = lesson({ id: 1, chapter_id: 5 }); // content null
    vi.mocked(fetchLessons).mockResolvedValue([draft]);
    vi.mocked(patchLesson).mockResolvedValue(
      lesson({
        id: 1,
        chapter_id: 5,
        content: "# Écrit à la main\n\nMon cours.",
        content_created_at: "2026-07-03T10:00:00Z",
        content_created_by: "parent",
        content_updated_at: "2026-07-03T10:00:00Z",
        content_updated_by: "parent",
      }),
    );

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: `Lire le cours de ${draft.title} (cours non rédigé)`,
      }),
    );

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "✎ Écrire à la main" }));
    const editor = await within(dialog).findByLabelText("Éditeur de cours");
    fireEvent.change(editor, { target: { value: "# Écrit à la main\n\nMon cours." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    // PATCH ciblé, puis la modale (dérivée du cache) affiche le cours + provenance.
    await waitFor(() =>
      expect(vi.mocked(patchLesson)).toHaveBeenCalledWith(1, {
        content: "# Écrit à la main\n\nMon cours.",
      }),
    );
    expect(await screen.findByText("Mon cours.")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveTextContent(/Rédigé le .+ par admin/);
    // Remplacement ciblé dans le cache : pas de re-fetch de la liste.
    expect(vi.mocked(fetchLessons)).toHaveBeenCalledTimes(1);
  });

  it("modale cours : « Modifier le cours » → Annuler jette le brouillon sans sauver", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const withContent = lesson({
      id: 1,
      chapter_id: 5,
      content: "# Cours\n\nTexte original.",
      content_created_at: "2026-07-01T08:00:00Z",
      content_created_by: "ai",
      content_updated_at: "2026-07-01T08:00:00Z",
      content_updated_by: "ai",
    });
    vi.mocked(fetchLessons).mockResolvedValue([withContent]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: `Lire le cours de ${withContent.title}` }),
    );

    const dialog = await screen.findByRole("dialog");
    // Provenance : premier write IA, jamais modifié → pas de ligne « Modifié ».
    expect(dialog).toHaveTextContent(/Rédigé le .+ par IA/);
    expect(dialog).not.toHaveTextContent(/Modifié le/);

    fireEvent.click(within(dialog).getByRole("button", { name: "✎ Modifier le cours" }));
    const editor = await within(dialog).findByLabelText("Éditeur de cours");
    fireEvent.change(editor, { target: { value: "# Cours\n\nTexte trafiqué." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Annuler" }));

    // Rien n'est sauvé, l'original est réaffiché.
    expect(vi.mocked(patchLesson)).not.toHaveBeenCalled();
    expect(await screen.findByText("Texte original.")).toBeInTheDocument();
  });

  it("modale cours : provenance avec fallback quand l'audit est absent (cours pré-migration)", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, content: "# Vieux cours sans audit." }),
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /Lire le cours de/ }),
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Rédigé (date inconnue)");
  });

  it("icône 📖 : indicateur d'état du cours (rédigé vs non rédigé)", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, title: "Avec cours", content: "# Cours" }),
      lesson({ id: 2, chapter_id: 5, title: "Sans cours" }),
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));

    // L'état du cours est porté par le label ET le tooltip du bouton de lecture.
    const withContent = await screen.findByRole("button", {
      name: "Lire le cours de Avec cours",
    });
    expect(withContent).toHaveAttribute("title", "Cours rédigé");
    const withoutContent = screen.getByRole("button", {
      name: "Lire le cours de Sans cours (cours non rédigé)",
    });
    expect(withoutContent).toHaveAttribute("title", "Cours non rédigé");
  });

  it("« ➕ Ajouter des leçons (ZETIS) » : complète la liste sans passer par la passe 2", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    const existing = lesson({ id: 1, chapter_id: 5, title: "Leçon déjà là", status: "validated" });
    vi.mocked(fetchLessons).mockResolvedValue([existing]);
    // La réponse EST la liste complète : existante conservée + ajout ZETIS.
    vi.mocked(extendLessons).mockResolvedValue([
      existing,
      lesson({ id: 2, chapter_id: 5, title: "Leçon complémentaire", sort_order: 1 }),
    ]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "➕ Ajouter des leçons (ZETIS)" }),
    );

    expect(await screen.findByText("Leçon complémentaire")).toBeInTheDocument();
    expect(screen.getByText("Leçon déjà là")).toBeInTheDocument();
    expect(vi.mocked(extendLessons)).toHaveBeenCalledWith(5);
    expect(vi.mocked(generateLessons)).not.toHaveBeenCalled();
  });

  it("« ➕ Ajouter des leçons » : absent si le chapitre n'a encore aucune leçon", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));

    // L'entrée en matière reste la passe 2 ; l'extension n'a de sens qu'avec de l'existant.
    expect(
      await screen.findByRole("button", { name: "⚡ Proposer des leçons" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Ajouter des leçons \(ZETIS\)/ }),
    ).not.toBeInTheDocument();
  });

  it("chapitre déplié : refermable depuis le BAS du panneau (« Replier le chapitre »)", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([lesson({ id: 1, chapter_id: 5 })]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Théorème de Pythagore" }));
    expect(await screen.findByRole("button", { name: "+ Ajouter une leçon" })).toBeInTheDocument();

    // Après un long défilement, le titre est hors écran : le pied du panneau replie aussi.
    fireEvent.click(
      screen.getByRole("button", { name: "Replier Théorème de Pythagore" }),
    );
    expect(
      screen.queryByRole("button", { name: "+ Ajouter une leçon" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Théorème de Pythagore" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("chapitre pending déplié : pas de bouton « Proposer des leçons »", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 6, name: "Proportionnalité" }), // generated + pending
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([]);

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Proportionnalité" }));

    // Le panneau est bien là (ajout manuel possible), mais pas la passe 2.
    expect(
      await screen.findByRole("button", { name: "+ Ajouter une leçon" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "⚡ Proposer des leçons" }),
    ).not.toBeInTheDocument();
  });

  it("lot matière « Proposer les leçons » : skip des chapitres avec leçons, rapport final", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
      chapter({ id: 6, name: "Fractions", validation_status: "validated", sort_order: 1 }),
      chapter({ id: 7, name: "Proportionnalité", sort_order: 2 }), // pending : hors lot
    ]);
    // Scan frais : le chapitre 6 a déjà des leçons → sauté (jamais écrasé).
    vi.mocked(fetchLessons).mockImplementation((chapterId: number) =>
      Promise.resolve(chapterId === 6 ? [lesson({ id: 9, chapter_id: 6 })] : []),
    );
    vi.mocked(generateLessons).mockResolvedValue([lesson({ id: 20, chapter_id: 5 })]);

    renderPage();
    await screen.findByText("Théorème de Pythagore");
    fireEvent.click(
      screen.getByRole("button", { name: "⚡ Proposer les leçons (chapitres sans leçons)" }),
    );

    // Seul le chapitre validé SANS leçons est généré ; le pending n'est même pas scanné.
    await waitFor(() => expect(vi.mocked(generateLessons)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(generateLessons)).toHaveBeenCalledWith(5);
    expect(vi.mocked(fetchLessons)).not.toHaveBeenCalledWith(7);
    expect(
      await screen.findByText(/Leçons proposées pour 1 chapitre \(1 chapitre sauté/),
    ).toBeInTheDocument();
  });

  it("lot matière « Proposer les leçons » : continue après un échec isolé et le rapporte", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
      chapter({ id: 6, name: "Fractions", validation_status: "validated", sort_order: 1 }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([]);
    vi.mocked(generateLessons).mockImplementation((chapterId: number) =>
      chapterId === 5
        ? Promise.reject(new Error("Appel LLM échoué."))
        : Promise.resolve([lesson({ id: 21, chapter_id: 6 })]),
    );

    renderPage();
    await screen.findByText("Théorème de Pythagore");
    fireEvent.click(
      screen.getByRole("button", { name: "⚡ Proposer les leçons (chapitres sans leçons)" }),
    );

    // L'échec du chapitre 5 n'arrête pas le lot : le 6 est quand même généré.
    await waitFor(() => expect(vi.mocked(generateLessons)).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText(/Leçons proposées pour 1 chapitre/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Théorème de Pythagore — Appel LLM échoué\./),
    ).toBeInTheDocument();
  });

  it("lot matière « Rédiger tous les cours manquants » : cibles inter-chapitres, séquentiel", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
      chapter({ id: 6, name: "Proportionnalité", sort_order: 1 }), // pending : scanné quand même
    ]);
    vi.mocked(fetchLessons).mockImplementation((chapterId: number) =>
      Promise.resolve(
        chapterId === 5
          ? [
              lesson({ id: 1, chapter_id: 5, title: "Sans cours A", status: "validated" }),
              lesson({ id: 2, chapter_id: 5, title: "Déjà rédigée", status: "validated", content: "# X" }),
              lesson({ id: 3, chapter_id: 5, title: "Encore draft" }),
            ]
          : [lesson({ id: 4, chapter_id: 6, title: "Sans cours B", status: "validated" })],
      ),
    );
    vi.mocked(generateLessonContent).mockImplementation((id: number) =>
      Promise.resolve(lesson({ id, status: "validated", content: "# Cours généré" })),
    );

    renderPage();
    await screen.findByText("Théorème de Pythagore");
    fireEvent.click(
      screen.getByRole("button", { name: "⚡ Rédiger tous les cours manquants" }),
    );

    // Validées sans cours des DEUX chapitres, dans l'ordre de la liste.
    await waitFor(() =>
      expect(vi.mocked(generateLessonContent)).toHaveBeenCalledTimes(2),
    );
    expect(vi.mocked(generateLessonContent)).toHaveBeenNthCalledWith(1, 1);
    expect(vi.mocked(generateLessonContent)).toHaveBeenNthCalledWith(2, 4);
    expect(await screen.findByText(/2 cours rédigés\./)).toBeInTheDocument();
  });

  it("lot matière en cours : progression réelle, annulation, boutons verrouillés", async () => {
    vi.mocked(fetchActiveSchoolYear).mockResolvedValue(YEAR);
    vi.mocked(fetchChapters).mockResolvedValue([
      chapter({ id: 5, name: "Théorème de Pythagore", validation_status: "validated" }),
    ]);
    vi.mocked(fetchLessons).mockResolvedValue([
      lesson({ id: 1, chapter_id: 5, title: "Sans cours A", status: "validated" }),
      lesson({ id: 2, chapter_id: 5, title: "Sans cours B", status: "validated" }),
    ]);
    // 1re rédaction contrôlée : on annule pendant qu'elle est en cours.
    let resolveFirst!: (l: CurriculumLesson) => void;
    vi.mocked(generateLessonContent).mockImplementationOnce(
      () => new Promise((resolve) => { resolveFirst = resolve; }),
    );

    renderPage();
    await screen.findByText("Théorème de Pythagore");
    fireEvent.click(
      screen.getByRole("button", { name: "⚡ Rédiger tous les cours manquants" }),
    );

    // Progression réelle x/N + verrou global pendant le lot.
    expect(
      await screen.findByText(/Rédaction des cours : 1\/2 — « Sans cours A »/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "⚡ Générer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "✓ Tout valider" })).toBeDisabled();

    // Annulation : l'élément en cours se termine, la suite non.
    fireEvent.click(
      screen.getByRole("button", { name: "Annuler après l'élément en cours" }),
    );
    resolveFirst(lesson({ id: 1, status: "validated", content: "# Cours" }));

    expect(await screen.findByText(/Lot annulé après 1\/2\./)).toBeInTheDocument();
    expect(vi.mocked(generateLessonContent)).toHaveBeenCalledTimes(1);
    // Fermeture du rapport → les boutons de lot réapparaissent.
    fireEvent.click(screen.getByRole("button", { name: "Fermer le rapport" }));
    expect(
      screen.getByRole("button", { name: "⚡ Rédiger tous les cours manquants" }),
    ).toBeEnabled();
  });

  it("état erreur : message backend verbatim + bouton réessayer", async () => {
    vi.mocked(fetchActiveSchoolYear).mockRejectedValue(
      new Error("Aucune année scolaire active."),
    );

    renderPage();

    expect(await screen.findByText("Aucune année scolaire active.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeInTheDocument();
  });
});
