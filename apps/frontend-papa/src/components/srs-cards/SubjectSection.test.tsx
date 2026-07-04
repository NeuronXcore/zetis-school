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
    onEditCard: vi.fn().mockResolvedValue(undefined),
    onDeleteCard: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  render(<SubjectSection {...props} />);
  return props;
}

describe("SubjectSection", () => {
  it("to_generate=0 avec des cartes → bouton « ↻ Régénérer » (pas « Générer les N »)", () => {
    renderSection({ subject: { subject_id: 1, name: "Français", active_cards: 5, to_generate: 0, suspended: 0 } });
    expect(screen.getByRole("button", { name: /Régénérer/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Générer les/ })).not.toBeInTheDocument();
  });

  it("matière vide (0 carte, 0 à générer) → aucun bouton de génération", () => {
    renderSection({ subject: { subject_id: 1, name: "Français", active_cards: 0, to_generate: 0, suspended: 0 } });
    expect(screen.queryByRole("button", { name: /générer/i })).not.toBeInTheDocument();
  });

  it("« ↻ Régénérer » appelle onGenerateSubject sans toggler l'accordéon", () => {
    const props = renderSection({
      subject: { subject_id: 1, name: "Français", active_cards: 5, to_generate: 0, suspended: 0 },
    });
    fireEvent.click(screen.getByRole("button", { name: /Régénérer/ }));
    expect(props.onGenerateSubject).toHaveBeenCalledTimes(1);
    expect(props.onToggle).not.toHaveBeenCalled();
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

  it("affiche la barre de progression (%) pendant la génération par matière", () => {
    renderSection({ busySubject: true });
    // Barre présente + pourcentage (démarre à 1 %) + bouton en état « Génération… ».
    expect(screen.getByText(/ZETIS génère les cartes/)).toBeInTheDocument();
    expect(screen.getByText(/%$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Génération/ })).toBeInTheDocument();
  });

  it("pas de barre de progression hors génération", () => {
    renderSection({ busySubject: false });
    expect(screen.queryByText(/ZETIS génère les cartes/)).not.toBeInTheDocument();
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
