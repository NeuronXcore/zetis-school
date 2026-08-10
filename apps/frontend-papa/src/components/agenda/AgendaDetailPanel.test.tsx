// Panneau de détail d'une échéance (ADR-0025 §2, ADR-0035).
//
// Le chapitre n'était éditable QU'À LA SAISIE EN LOT jusqu'au 2026-08-03 : un item mal saisi — ou
// saisi par Massimo, qui n'a aucun sélecteur — restait définitivement stérile, alors que l'API
// l'acceptait déjà (`AgendaItemPatch.chapter_id`, `_PARENT_EDITABLE`). C'est le préalable pratique
// des deux portes : la production automatique et le Commander de missions.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type AgendaItemPilot, type CurriculumChapter } from "@zetis/types";
import { AgendaDetailPanel } from "./AgendaDetailPanel";
import { type SubjectOption } from "./AgendaBatchEntry";

const SUBJECTS: SubjectOption[] = [{ id: 7, name: "Mathématiques", sysId: 42 }];
const CHAPITRES: CurriculumChapter[] = [
  { id: 3, name: "Fractions" } as CurriculumChapter,
  { id: 4, name: "Géométrie" } as CurriculumChapter,
];

function item(overrides: Partial<AgendaItemPilot> = {}): AgendaItemPilot {
  return {
    id: 1,
    label: "Contrôle de maths",
    subject: { id: 7, name: "Mathématiques", icon: null } as never,
    subject_id: 7,
    chapter_id: null,
    lesson_id: null,
    due_on: "2026-08-10",
    kind: "controle",
    created_by: "parent",
    parent_note: null,
    done_at: null,
    dismissed_at: null,
    edited_by_parent_at: null,
    created_at: null,
    updated_at: null,
    ...overrides,
  };
}

const COURS = [
  { id: 91, title: "Additionner des fractions" },
  { id: 92, title: "Comparer deux fractions" },
];
function renderPanel(
  overrides: Partial<AgendaItemPilot> = {},
  onSave = vi.fn(),
  lessonsByChapter: Record<number, { id: number; title: string }[]> = { 3: COURS },
) {
  const utils = render(
    <AgendaDetailPanel
      item={item(overrides)}
      saving={false}
      onClose={vi.fn()}
      onSave={onSave}
      onSaveNote={vi.fn()}
      onArchive={vi.fn()}
      subjects={SUBJECTS}
      chaptersBySys={{ 42: CHAPITRES }}
      chaptersLoading={new Set()}
      onNeedChapters={vi.fn()}
      lessonsByChapter={lessonsByChapter}
      lessonsLoading={new Set()}
      onNeedLessons={vi.fn()}
    />,
  );
  return { ...utils, onSave };
}

describe("AgendaDetailPanel — le chapitre", () => {
  it("permet de rattacher un chapitre APRÈS coup, et l'envoie au serveur", async () => {
    const { onSave } = renderPanel();

    fireEvent.change(screen.getByLabelText("Chapitre"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ chapter_id: 3, kind: "controle" }),
    );
  });

  it("dit ce que le silence de ZETIS voudra dire, tant qu'aucun chapitre n'est posé", () => {
    // Sans ce message, le déclencheur paraît en panne : Papa saisit un contrôle, rien ne se
    // passe, et rien à l'écran n'explique pourquoi.
    renderPanel();
    expect(screen.getByText(/ne pourra ni préparer cette échéance/)).toBeInTheDocument();
  });

  it("se tait dès qu'un chapitre est rattaché", () => {
    renderPanel({ chapter_id: 3 });
    expect(screen.queryByText(/ne pourra ni préparer/)).toBeNull();
  });

  it("⚠️ n'offre pas un menu vide quand l'item n'a pas de matière — il dit quoi faire", () => {
    // Les chapitres sont indexés par `school_year_subject_id` : sans matière, il n'y a aucune
    // liste à proposer. Un `<select>` vide se lit comme une panne du référentiel.
    renderPanel({ subject_id: null, subject: null });
    expect(screen.queryByLabelText("Chapitre")).toBeNull();
    expect(screen.getByText(/Choisissez d'abord une matière/)).toBeInTheDocument();
  });

  it("VERROU ADR-0025 §2b — aucune case à cocher n'apparaît, chapitre ou pas", () => {
    // « Seul Massimo coche ». Le panneau gagne des champs au fil des chantiers ; ce verrou
    // garantit qu'aucun n'introduira une affordance de complétion côté Papa.
    const { container } = renderPanel({ chapter_id: 3 });
    expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
  });
});

describe("AgendaDetailPanel — l'intitulé (addendum ADR-0025 §13)", () => {
  it("NON-RÉGRESSION — un item existant s'ouvre inchangé, en texte libre", () => {
    // Un `label` saisi à la main ne figure dans aucune liste. Le panneau doit être IDENTIQUE à
    // ce qu'il était tant que Papa n'a rien demandé : le bascule en menu écraserait un libellé
    // que Massimo lit déjà dans son agenda.
    renderPanel({ chapter_id: 3, label: "Contrôle chapitre 3" });

    const champ = screen.getByLabelText("Intitulé") as HTMLInputElement;
    expect(champ.tagName).toBe("INPUT");
    expect(champ.value).toBe("Contrôle chapitre 3");
  });

  it("propose les cours du chapitre après « ↩ choisir un cours », et les envoie tels quels", async () => {
    const { onSave } = renderPanel({ chapter_id: 3, label: "Contrôle chapitre 3" });

    fireEvent.click(screen.getByRole("button", { name: /choisir un cours/ }));
    fireEvent.change(screen.getByLabelText("Intitulé"), {
      target: { value: "Additionner des fractions" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enregistrer/ }));

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ label: "Additionner des fractions", chapter_id: 3 }),
    );
  });

  it("suit le chapitre EN COURS D'ÉDITION, pas celui enregistré", () => {
    // Changer de chapitre doit changer la liste proposée AVANT d'enregistrer quoi que ce soit.
    // Lire `item.chapter_id` au lieu de l'état local proposerait les cours de l'ancien chapitre.
    renderPanel({ chapter_id: 4, label: "" }, vi.fn(), { 3: COURS, 4: [] });
    expect(screen.getByLabelText("Intitulé").tagName).toBe("INPUT");

    fireEvent.change(screen.getByLabelText("Chapitre"), { target: { value: "3" } });
    expect(screen.getByLabelText("Intitulé").tagName).toBe("SELECT");
  });

  it("sans chapitre, l'intitulé reste le champ texte qu'il a toujours été", () => {
    renderPanel({ chapter_id: null });
    expect(screen.getByLabelText("Intitulé").tagName).toBe("INPUT");
    expect(screen.queryByRole("button", { name: /choisir un cours/ })).toBeNull();
  });
});
