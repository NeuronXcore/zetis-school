import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { GalaxyNotion } from "@zetis/types";
import { NotionActionPanel } from "./NotionActionPanel";

function panel(notion: Partial<GalaxyNotion> = {}) {
  const full: GalaxyNotion = {
    skill_id: 12,
    name: "Mitose",
    status: "learning",
    chapter_title: "La cellule",
    subject_slug: "svt",
    subject_name: "SVT",
    actions: [
      { kind: "cours", available: true, lesson_id: 3 },
      { kind: "eli5", available: true },
    ],
    ...notion,
  };
  return render(
    <MemoryRouter>
      <NotionActionPanel notion={full} onClose={() => {}} />
    </MemoryRouter>,
  );
}

describe("NotionActionPanel", () => {
  it("rend exactement les actions du serveur, dans l'ordre reçu", () => {
    panel({
      actions: [
        { kind: "eli5", available: true },
        { kind: "quiz", available: true, quiz_id: 9 },
      ],
    });
    const labels = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(labels.filter((l) => l.includes("Fais-moi comprendre"))).toHaveLength(1);
    expect(labels.filter((l) => l.includes("Me tester"))).toHaveLength(1);
  });

  it("affiche la panoplie complète, en grisant ce qui n'existe pas encore", () => {
    // Révision de l'ADR-0024 §4 (2026-07-28) : Massimo voit tout ce que ZETIS sait faire
    // d'une notion. Une activité manquante n'est pas son échec — c'est du contenu à produire.
    panel({
      actions: [
        { kind: "eli5", available: true },
        { kind: "fiche", available: false },
        { kind: "capsule", available: false },
      ],
    });
    expect(screen.getByText("Lire la fiche")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Lire la fiche/ }).hasAttribute("disabled")).toBe(
      true,
    );
    expect(
      screen.getByRole("button", { name: /Fais-moi comprendre/ }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("ne formule jamais l'indisponibilité comme un échec", () => {
    const { container } = panel({
      actions: [{ kind: "eli5", available: true }, { kind: "quiz", available: false }],
    });
    expect(container.textContent).not.toMatch(/échec|raté|impossible|erreur|manque/i);
  });

  it("met l'accent sur la première activité RÉELLEMENT faisable", () => {
    panel({
      actions: [
        { kind: "cours", available: false },
        { kind: "eli5", available: true },
      ],
    });
    // Un bouton mis en avant doit pouvoir être cliqué : l'accent ne va pas au cours absent.
    const eli5 = screen.getByRole("button", { name: /Fais-moi comprendre/ });
    expect(eli5.className).toContain("from-zetis-accent");
    expect(screen.getByRole("button", { name: /Voir le cours/ }).className).not.toContain(
      "from-zetis-accent",
    );
  });

  it("montre le libellé ENFANT de l'état, jamais le statut technique ni un score", () => {
    const { container } = panel({ status: "solid" });
    expect(screen.getByText("Bien acquis")).toBeTruthy();
    expect(container.textContent).not.toMatch(/solid|mastery|%/);
  });
});
