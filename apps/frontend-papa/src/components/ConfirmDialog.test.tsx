import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "@zetis/ui";

// Test du composant partagé (le setup Vitest vit dans frontend-papa, pas dans packages/ui).
describe("ConfirmDialog", () => {
  it("fermé : ne rend rien", () => {
    render(
      <ConfirmDialog open={false} title="T" confirmLabel="OK" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ouvert : titre + corps, confirme et annule (bouton + Échap)", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog open title="Supprimer ?" confirmLabel="Supprimer" onConfirm={onConfirm} onCancel={onCancel}>
        Corps du message.
      </ConfirmDialog>,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Supprimer ?");
    expect(screen.getByText("Corps du message.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Supprimer" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("busy : boutons désactivés", () => {
    render(
      <ConfirmDialog open busy title="T" confirmLabel="OK" onConfirm={() => {}} onCancel={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "En cours…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Annuler" })).toBeDisabled();
  });
});
