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

function renderPanel(overrides: Partial<AgendaItemPilot> = {}, onSave = vi.fn()) {
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
