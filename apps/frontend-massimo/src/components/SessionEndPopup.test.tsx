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

  describe("mot de la fin de ZETIS", () => {
    const wrapUp = {
      code: "mission_in_progress",
      title: "Belle séance ! On finira les fractions la prochaine fois.",
      subtitle: "Il te reste 1 étape.",
    };

    it("affiche le message servi", () => {
      renderPopup({ tier: "high", wrapUp });
      expect(screen.getByText(/On finira les fractions/)).toBeTruthy();
      expect(screen.getByText(/Il te reste 1 étape/)).toBeTruthy();
    });

    it("le TAIT dans la branche « refaire un tour »", () => {
      // Ligne rouge : à ce moment-là l'intention principale est de refaire le tour. Un second
      // appel à l'action la concurrencerait.
      renderPopup({ tier: "low", canRedo: true, fragileCount: 3, wrapUp });
      expect(screen.getByText(/Refaire un tour/)).toBeTruthy();
      expect(screen.queryByText(/On finira les fractions/)).toBeNull();
    });

    it("s'affiche normalement quand le message est absent", () => {
      // Un échec de l'appel ne doit JAMAIS empêcher une fin de séance de s'afficher.
      renderPopup({ tier: "high", wrapUp: null });
      expect(screen.getByText(/Continuer/)).toBeTruthy();
    });
  });
});
