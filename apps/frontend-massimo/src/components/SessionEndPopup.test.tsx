import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SessionEndPopup, type SessionEndPopupProps } from "./SessionEndPopup";

function renderPopup(overrides: Partial<SessionEndPopupProps> = {}) {
  const onRedo = vi.fn();
  const onFinish = vi.fn();
  const props: SessionEndPopupProps = {
    tier: "high",
    good: 4,
    total: 5,
    pct: 0.8,
    xp: 25,
    canRedo: false,
    fragileCount: 0,
    onRedo,
    onFinish,
    reducedMotion: true, // pas d'animation/confetti dans les tests
    ...overrides,
  };
  render(<SessionEndPopup {...props} />);
  return { onRedo, onFinish };
}

describe("SessionEndPopup", () => {
  it("palier haut : « Incroyable, Massimo ! » + [Continuer] + XP serveur", () => {
    const { onFinish } = renderPopup({ tier: "high", good: 5, total: 5, pct: 1, xp: 25 });
    expect(screen.getByText(/Incroyable, Massimo/)).toBeInTheDocument();
    expect(screen.getByText(/\+25 XP/)).toBeInTheDocument();
    expect(screen.getByText("5/5 bien ancrées · 100 %")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("palier moyen : « Bien joué ! » + [Terminer]", () => {
    renderPopup({ tier: "mid", good: 3, total: 5, pct: 0.6 });
    expect(screen.getByText("Bien joué !")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Refaire un tour/ })).not.toBeInTheDocument();
  });

  it("palier bas + re-tour possible : « Refaire un tour (N cartes) » + lien doux", () => {
    const { onRedo, onFinish } = renderPopup({
      tier: "low",
      good: 1,
      total: 5,
      pct: 0.2,
      canRedo: true,
      fragileCount: 3,
    });
    const redo = screen.getByRole("button", { name: /Refaire un tour \(3 cartes\)/ });
    fireEvent.click(redo);
    expect(onRedo).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Plus tard, elles reviendront/ }));
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it("palier bas sans re-tour (déjà fait) : message d'effort + [Terminer], jamais « échec »", () => {
    renderPopup({ tier: "low", good: 1, total: 5, pct: 0.2, canRedo: false, fragileCount: 2 });
    expect(screen.getByText(/Bel effort/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Terminer" })).toBeInTheDocument();
    expect(screen.queryByText(/échec|erreur|nul/i)).not.toBeInTheDocument();
  });

  it("singulier « 1 carte » du bouton re-tour", () => {
    renderPopup({ tier: "low", pct: 0, good: 0, total: 3, canRedo: true, fragileCount: 1 });
    expect(screen.getByRole("button", { name: /Refaire un tour \(1 carte\)/ })).toBeInTheDocument();
  });
});
