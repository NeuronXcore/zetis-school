import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { type SrsSubjectTree } from "@zetis/types";
import { SubjectSection, type SubjectSectionProps } from "./SubjectSection";

function renderSection(overrides: Partial<SubjectSectionProps> = {}) {
  const props: SubjectSectionProps = {
    subject: { subject_id: 1, name: "Français", active_cards: 2, to_generate: 3, suspended: 0 },
    expanded: false,
    tree: undefined,
    treeLoading: false,
    busySubject: false,
    isBusySkill: () => false,
    isPreviewOpen: () => false,
    previewCards: () => undefined,
    onToggle: vi.fn(),
    onGenerateSubject: vi.fn(),
    onGenerateSkill: vi.fn(),
    onTogglePreview: vi.fn(),
    onReactivate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<SubjectSection {...props} />);
  return props;
}

describe("SubjectSection", () => {
  it("bouton « Générer les N » visible seulement si des notions sont à générer", () => {
    const { rerender } = render(<div />);
    rerender(<div />);
    renderSection({ subject: { subject_id: 1, name: "Français", active_cards: 5, to_generate: 0, suspended: 0 } });
    expect(screen.queryByRole("button", { name: /Générer/ })).not.toBeInTheDocument();
  });

  it("affiche « Générer les 3 » quand to_generate = 3", () => {
    renderSection({ subject: { subject_id: 1, name: "Français", active_cards: 2, to_generate: 3, suspended: 0 } });
    expect(screen.getByRole("button", { name: /Générer les 3/ })).toBeInTheDocument();
  });

  it("générer NE toggle PAS l'accordéon (boutons frères)", () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /Générer les 3/ }));
    expect(props.onGenerateSubject).toHaveBeenCalledTimes(1);
    expect(props.onToggle).not.toHaveBeenCalled();
    // Cliquer l'en-tête (hors bouton) toggle bien.
    fireEvent.click(screen.getByRole("button", { name: /Français/ }));
    expect(props.onToggle).toHaveBeenCalledTimes(1);
  });

  it("rend la section « Suspendues » quand l'arbre en contient", () => {
    const tree: SrsSubjectTree = {
      subject_id: 1,
      name: "Français",
      chapters: [],
      suspended: [{ skill_id: 20, name: "Le passé antérieur", state: "suspended", card_count: 0 }],
    };
    renderSection({ expanded: true, tree });
    expect(screen.getByText(/Suspendues/)).toBeInTheDocument();
    expect(screen.getByText("Le passé antérieur")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "réactiver" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "retirer" })).toBeInTheDocument();
  });
});
