// Saisie en lot — l'intitulé se choisit dans le référentiel (addendum ADR-0025 §13).
//
// Trois colonnes étaient déjà des menus (matière, chapitre, type) ; la quatrième était un champ
// texte vide, alors que ce que Papa y tape existe déjà en base. Ce fichier verrouille les deux
// règles qui rendent le changement sûr :
//   - la porte de sortie « ✏️ Autre » reste ouverte (un devoir n'est le titre d'aucun cours) ;
//   - **rien de ce que Papa a tapé n'est jamais effacé** (§13.4).
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type CurriculumChapter } from "@zetis/types";
import { AgendaBatchEntry, type SubjectOption } from "./AgendaBatchEntry";

const SUBJECTS: SubjectOption[] = [{ id: 7, name: "Mathématiques", sysId: 42 }];
const CHAPITRES: CurriculumChapter[] = [
  { id: 3, name: "Fractions" } as CurriculumChapter,
  { id: 4, name: "Géométrie" } as CurriculumChapter,
];
const COURS = [
  { id: 91, title: "Additionner des fractions" },
  { id: 92, title: "Comparer deux fractions" },
];

function renderGrid(
  over: Partial<React.ComponentProps<typeof AgendaBatchEntry>> = {},
  onSubmit = vi.fn().mockResolvedValue(undefined),
) {
  const utils = render(
    <AgendaBatchEntry
      subjects={SUBJECTS}
      chaptersBySys={{ 42: CHAPITRES }}
      chaptersLoading={new Set()}
      onNeedChapters={vi.fn()}
      lessonsByChapter={{ 3: COURS }}
      lessonsLoading={new Set()}
      onNeedLessons={vi.fn()}
      saving={false}
      onSubmit={onSubmit}
      {...over}
    />,
  );
  return { ...utils, onSubmit };
}

/** La grille rend 3 lignes vides : on travaille toujours sur la première. */
const premier = (nom: string) => screen.getAllByLabelText(nom)[0];

/** Amène la 1ʳᵉ ligne jusqu'au chapitre 3 (celui qui a des cours). */
function choisirMathsEtFractions() {
  fireEvent.change(premier("Matière"), { target: { value: "7" } });
  fireEvent.change(premier("Chapitre"), { target: { value: "3" } });
}

describe("AgendaBatchEntry — les types", () => {
  it("offre les QUATRE types, « Leçon à apprendre » en toutes lettres", () => {
    // La formulation longue est LE geste de l'addendum §14 : c'est l'ambiguïté du mot « devoir »
    // (exercices à faire ≠ cours à apprendre) qui a fait ajouter ce type.
    renderGrid();
    const options = [...(premier("Type") as HTMLSelectElement).options].map(
      (o) => o.textContent,
    );
    expect(options).toEqual([
      "Devoir",
      "Leçon à apprendre",
      "Contrôle",
      "Rendu",
    ]);
  });

  it("envoie `lecon` au serveur, pas le libellé", async () => {
    const { onSubmit } = renderGrid();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Le passé composé" },
    });
    fireEvent.change(premier("Date"), { target: { value: "2026-09-12" } });
    fireEvent.change(premier("Type"), { target: { value: "lecon" } });

    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ kind: "lecon" }),
      ]),
    );
  });
});

describe("AgendaBatchEntry — l'intitulé", () => {
  it("propose les cours du chapitre dès qu'il est choisi", () => {
    renderGrid();
    // Avant le chapitre : un champ texte, comme avant ce chantier.
    expect(premier("Intitulé").tagName).toBe("INPUT");

    choisirMathsEtFractions();

    const champ = premier("Intitulé");
    expect(champ.tagName).toBe("SELECT");
    expect(
      screen.getAllByRole("option", { name: "Additionner des fractions" }),
    ).not.toHaveLength(0);
    expect(
      screen.getAllByRole("option", { name: /Autre \(texte libre\)/ }),
    ).not.toHaveLength(0);
  });

  it("envoie le titre TEL QUEL, et l'id de la leçon choisie", async () => {
    // Le `label` reste du texte brut (§13.3 / ADR-0025 §8) ; le `lesson_id` s'y ajoute depuis le
    // §15 — c'est lui qui ouvrira le cours chez Massimo. Deux informations, deux rôles : l'une
    // s'affiche, l'autre pointe.
    const { onSubmit } = renderGrid();
    choisirMathsEtFractions();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Comparer deux fractions" },
    });
    fireEvent.change(premier("Date"), { target: { value: "2026-09-12" } });

    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        {
          label: "Comparer deux fractions",
          due_on: "2026-09-12",
          subject_id: 7,
          chapter_id: 3,
          lesson_id: 92,
          kind: "devoir",
        },
      ]),
    );
  });

  it("VERROU §15 — changer de chapitre LÂCHE la leçon pointée", async () => {
    // Sans ça, un intitulé choisi dans le chapitre A resterait rattaché à SA leçon après un
    // passage au chapitre B : le serveur refuserait en 422, et avant lui l'écran aurait menti.
    const { onSubmit } = renderGrid({ lessonsByChapter: { 3: COURS, 4: [] } });
    choisirMathsEtFractions();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Comparer deux fractions" },
    });

    fireEvent.change(premier("Chapitre"), { target: { value: "4" } });
    fireEvent.change(premier("Date"), { target: { value: "2026-09-12" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        // Le texte survit (§13.4), la leçon non — elle appartenait à l'autre chapitre.
        expect.objectContaining({
          label: "Comparer deux fractions",
          chapter_id: 4,
          lesson_id: null,
        }),
      ]),
    );
  });

  it("texte libre = aucune leçon pointée", async () => {
    const { onSubmit } = renderGrid();
    choisirMathsEtFractions();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "__zetis_free_text__" },
    });
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Relire la leçon et refaire les exercices du cahier" },
    });
    fireEvent.change(premier("Date"), { target: { value: "2026-09-12" } });

    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({ lesson_id: null }),
      ]),
    );
  });

  it("« ✏️ Autre » rend un champ texte, et c'est ce texte qui part", async () => {
    // Le cas MAJORITAIRE d'un devoir : un devoir s'énonce par des consignes, pas par un titre de cours.
    const { onSubmit } = renderGrid();
    choisirMathsEtFractions();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "__zetis_free_text__" },
    });

    expect(premier("Intitulé").tagName).toBe("INPUT");
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Relire la leçon et refaire les exercices du cahier" },
    });
    fireEvent.change(premier("Date"), { target: { value: "2026-09-12" } });

    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));
    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          label: "Relire la leçon et refaire les exercices du cahier",
        }),
      ]),
    );
  });

  it("VERROU §13.4 — un texte tapé AVANT le chapitre survit au choix du chapitre", () => {
    // La seule transition capable de faire perdre une saisie. Papa relève l'ENT : il tape
    // l'énoncé, puis se souvient de rattacher le chapitre. Basculer en menu à ce moment-là
    // effacerait la seule chose qu'il ait écrite.
    renderGrid();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Relire la leçon et refaire les exercices du cahier" },
    });

    choisirMathsEtFractions();

    const champ = premier("Intitulé") as HTMLInputElement;
    expect(champ.tagName).toBe("INPUT");
    expect(champ.value).toBe(
      "Relire la leçon et refaire les exercices du cahier",
    );
  });

  it("change de matière SANS effacer l'intitulé déjà saisi", () => {
    // Changer de matière invalide le chapitre (il appartenait à l'autre matière) — pas le texte.
    renderGrid();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Rendu de l'exposé" },
    });
    fireEvent.change(premier("Matière"), { target: { value: "7" } });

    expect((premier("Intitulé") as HTMLInputElement).value).toBe(
      "Rendu de l'exposé",
    );
  });

  it("n'offre pas de menu sur un chapitre sans aucun cours validé", () => {
    // Conséquence assumée de §13.2. Un menu qu'on ouvre pour n'y rien trouver se lit comme une
    // panne : on rend le champ texte, et la ligne reste enregistrable.
    renderGrid({ lessonsByChapter: { 3: [] } });
    choisirMathsEtFractions();

    expect(premier("Intitulé").tagName).toBe("INPUT");
    expect(
      screen.queryByRole("option", { name: /Autre \(texte libre\)/ }),
    ).toBeNull();
  });

  it("demande les cours du chapitre une seule fois, au moment où il est choisi", () => {
    const onNeedLessons = vi.fn();
    renderGrid({ lessonsByChapter: {}, onNeedLessons });

    choisirMathsEtFractions();
    expect(onNeedLessons).toHaveBeenCalledWith(3);
    expect(onNeedLessons).toHaveBeenCalledTimes(1);
  });

  it("« ↩ choisir un cours » ramène au menu, en le disant", () => {
    renderGrid();
    fireEvent.change(premier("Intitulé"), {
      target: { value: "Relire la leçon" },
    });
    choisirMathsEtFractions();

    fireEvent.click(
      screen.getAllByRole("button", { name: /choisir un cours/ })[0],
    );
    const champ = premier("Intitulé") as HTMLSelectElement;
    expect(champ.tagName).toBe("SELECT");
    // Il VIDE le champ, et son libellé le dit. Garder le texte pendant que le menu afficherait
    // son placeholder mettrait l'écran en désaccord avec ce qui sera enregistré.
    expect(champ.value).toBe("");
  });
});
