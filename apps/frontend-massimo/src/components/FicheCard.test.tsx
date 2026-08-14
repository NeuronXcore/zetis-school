import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { type FicheSpec } from "@zetis/types";
import { FicheCard } from "./FicheCard";

// `FicheCard` n'avait AUCUN test avant le 2026-08-14 — lacune préexistante, relevée en posant la
// porte de l'ADR-0054. Ces tests couvrent les deux règles qui se contredisent en apparence :
// la datation ABSOLUE sur le papier, et son ABSENCE à l'écran.

const SPEC: FicheSpec = {
  title: "Le récit",
  subject: "Français",
  level: "4e",
  essentiel: "Un essentiel.",
  definitions: [],
  points_cles: [],
  erreurs_a_eviter: [],
};

/** Le pied VISIBLE (celui de la carte à l'écran). */
const piedEcran = () => document.querySelector("article footer")!;
/** Le pied du rendu A5 hors écran — celui que l'export photographie. */
const piedPapier = () => document.querySelector("[aria-hidden] footer")!;

describe("FicheCard — relatif à l'écran, absolu sur le papier (ADR-0054 §3)", () => {
  it("🔴 date le PAPIER en absolu, et laisse l'écran SANS date", () => {
    render(<FicheCard spec={SPEC} subjectSlug="francais" dateISO="2026-08-13T09:30:00Z" />);

    // Le papier : une feuille non datée est inclassable dans un classeur.
    expect(piedPapier().textContent).toContain("13/08/2026");
    // L'écran : une date absolue y serait de la métadonnée d'adulte.
    expect(piedEcran().textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("s'imprime sans date plutôt qu'avec « Invalid Date » quand elle manque", () => {
    render(<FicheCard spec={SPEC} subjectSlug="francais" dateISO={null} />);
    expect(piedPapier().textContent).not.toMatch(/Invalid Date|NaN|null/);
    expect(piedPapier().textContent).toContain("ZETIS");
  });
});

describe("FicheCard — la porte du §1", () => {
  it("écrit les DEUX libellés figés par la spec, jamais un libellé commun", () => {
    const { unmount } = render(
      <FicheCard spec={SPEC} subjectSlug="francais" porte={{ kind: "faire", onClick: vi.fn() }} />,
    );
    expect(screen.getByText("🧩 En faire ma fiche")).toBeInTheDocument();
    unmount();

    render(
      <FicheCard
        spec={SPEC}
        subjectSlug="francais"
        porte={{ kind: "retravailler", onClick: vi.fn() }}
      />,
    );
    expect(screen.getByText("✏️ La retravailler")).toBeInTheDocument();
  });

  it("n'affiche AUCUNE porte quand la surface n'en ouvre pas (panneau de mindmap)", () => {
    render(<FicheCard spec={SPEC} subjectSlug="francais" />);
    expect(screen.queryByText(/En faire ma fiche|La retravailler/)).not.toBeInTheDocument();
  });

  it("tient la cible tactile de 44 px sur la porte comme sur les outils (§6)", () => {
    render(
      <FicheCard spec={SPEC} subjectSlug="francais" porte={{ kind: "faire", onClick: vi.fn() }} />,
    );
    for (const b of piedEcran().querySelectorAll("button")) {
      expect(b.className).toContain("min-h-[44px]");
    }
  });
});
