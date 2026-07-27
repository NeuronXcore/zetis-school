import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SubjectDeckGrid, type SubjectDeck } from "./SubjectDeckGrid";

const SUBJECTS: SubjectDeck[] = [
  { slug: "mathematiques", name: "Mathématiques", count: 3, hint: "3 notions" },
  { slug: "espagnol", name: "Espagnol", count: 0, dimmed: true, dimmedHint: "bientôt ✨" },
];

describe("SubjectDeckGrid", () => {
  it("rend un deck cliquable par matière et remonte le slug sélectionné", () => {
    const onSelect = vi.fn();
    render(<SubjectDeckGrid subjects={SUBJECTS} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Mathématiques/ }));
    expect(onSelect).toHaveBeenCalledWith("mathematiques");
  });

  it("matière atténuée inerte par défaut, cliquable avec dimmedClickable", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<SubjectDeckGrid subjects={SUBJECTS} onSelect={onSelect} />);
    // Par défaut (Révision) : « bientôt » non cliquable.
    expect(screen.getByText("bientôt ✨")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Espagnol/ })).not.toBeInTheDocument();

    // ELI5 : le même deck atténué devient cliquable.
    rerender(<SubjectDeckGrid subjects={SUBJECTS} onSelect={onSelect} dimmedClickable />);
    fireEvent.click(screen.getByRole("button", { name: /Espagnol/ }));
    expect(onSelect).toHaveBeenCalledWith("espagnol");
  });

  it("rend le deck spécial fourni en tête (slot lead)", () => {
    render(
      <SubjectDeckGrid
        subjects={SUBJECTS}
        onSelect={vi.fn()}
        lead={<button type="button">Question libre</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "Question libre" })).toBeInTheDocument();
  });

  it("plafonne le badge compteur à « 15+ » (comportement DeckDisc partagé)", () => {
    render(
      <SubjectDeckGrid subjects={[{ slug: "x", name: "Grosse matière", count: 42 }]} onSelect={vi.fn()} />,
    );
    const deck = screen.getByRole("button", { name: /Grosse matière/ });
    expect(within(deck).getByText("15+")).toBeInTheDocument();
  });
});
