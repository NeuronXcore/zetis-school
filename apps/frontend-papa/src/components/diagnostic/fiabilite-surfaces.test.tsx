import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiagnosticRailEntry, DiagnosticResult } from "@zetis/types";

// Les deux autres surfaces de la fiabilité (ADR-0048, Session C) : la MARQUE du rail, et le mot de
// Massimo dans la station ①. Plus la prop de présélection de la modale, sans laquelle
// « Remesurer cette matière → » ouvrirait sur la mauvaise matière.

vi.mock("../../lib/diagnostic", () => ({ generateDiagnostic: vi.fn() }));

import { RailPassations } from "./RailPassations";
import { PanneauPassation } from "./PanneauPassation";
import { LancerDiagnosticDialog } from "./LancerDiagnosticDialog";

function ligne(p: Partial<DiagnosticRailEntry> = {}): DiagnosticRailEntry {
  return {
    cle: "attempt-1",
    cran: "passe",
    quiz_id: 1,
    attempt_id: 1,
    subject_id: 1,
    subject: "Histoire-Géographie",
    subject_slug: "histoire-geographie",
    date: "2026-08-09T10:00:00+00:00",
    notions_count: 8,
    score_percent: 88,
    rang: 3,
    fiabilite_verdict: null,
    ...p,
  };
}

const rail = (entrees: DiagnosticRailEntry[]) =>
  render(
    <RailPassations
      entrees={entrees}
      jamaisGenere={[]}
      selection={null}
      onSelect={vi.fn()}
      filtreActif={false}
    />,
  );

describe("🔴 la marque du rail", () => {
  it("s'affiche sur une passation à confirmer, ambre et avec le MOT à côté du symbole", () => {
    rail([ligne({ fiabilite_verdict: "a_confirmer" })]);
    const marque = screen.getByText(/à confirmer/);
    // 🔴 AMBRE, JAMAIS ROUGE (adr-0045 §6) : le rouge dirait « faute » ; il n'y a pas de faute, il
    // y a une incertitude. Et la couleur ne porte jamais l'information seule — le mot est écrit.
    expect(marque.className).toMatch(/papa-warn/);
    expect(marque.className).not.toMatch(/red|rose/);
    // ⚠️ **La règle de vocabulaire se vérifie sur LA LIGNE, pas sur le conteneur.** Une première
    // version balayait tout le rail et rougissait sur sa LÉGENDE — « chez Massimo s'il lui a été
    // proposé », qui est le libellé d'acteur de l'`adr-0045 §6` et dit où le diagnostic attend,
    // pas ce que l'enfant aurait fait. Un verrou trop large interdit du texte légitime et finit
    // désarmé.
    const rangee = marque.closest("button");
    expect(rangee?.textContent).not.toMatch(/massimo|triché|suspect/i);
  });

  it("ne s'affiche PAS quand il n'y a rien à signaler, ni quand ZETIS ne regardait pas", () => {
    rail([ligne({ cle: "a", fiabilite_verdict: "rien_a_signaler" }), ligne({ cle: "b" })]);
    expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
  });

  it("🔴 ne s'affiche jamais hors du 3ᵉ cran — une passation qui n'a pas eu lieu n'a rien à qualifier", () => {
    // Le backend sert `null` sur les deux premiers crans. Ce test fige la conséquence à l'écran,
    // et rougirait si quelqu'un « remontait » la marque en croyant bien faire.
    rail([
      ligne({ cle: "q1", cran: "genere", attempt_id: null, score_percent: null, rang: null }),
      ligne({ cle: "q2", cran: "propose", attempt_id: null, score_percent: null, rang: null }),
    ]);
    expect(screen.queryByText(/à confirmer/)).not.toBeInTheDocument();
  });
});

function detail(p: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    attempt_id: 4,
    quiz_id: 7,
    subject_id: 1,
    subject: "Histoire-Géographie",
    score_percent: 88,
    completed_at: "2026-08-09T10:00:00+00:00",
    per_skill: [
      { skill_id: 3, skill_name: "Les trois ordres", score: 100, status: "mastered", questions_count: 4 },
      { skill_id: 5, skill_name: "Le calendrier", score: 50, status: "learning", questions_count: 4 },
    ],
    gaps: [],
    fiabilite: null,
    verbalisation: null,
    ...p,
  };
}

describe("le mot de Massimo, dans la station ①", () => {
  it("se pose à côté de SA notion, jamais d'une autre", () => {
    render(
      <MemoryRouter>
        <PanneauPassation
          detail={detail({
            verbalisation: {
              question_id: 41,
              skill_id: 3,
              skill_name: "Les trois ordres",
              explication: "j'ai cherché",
            },
          })}
          portee={null}
          rang={3}
          subjectSlug="histoire-geographie"
          onRemesurer={vi.fn()}
          relecture={null}
        />
      </MemoryRouter>,
    );
    const cellule = screen.getByText(/Les trois ordres/).closest("td");
    // Il vit sur la LIGNE de sa notion — pas dans la bande, qui ne porte que ce que ZETIS a
    // OBSERVÉ, alors que ceci est ce que Massimo a DIT.
    expect(cellule?.textContent).toContain("j'ai cherché");
    expect(cellule?.textContent).toContain("Massimo raconte");
    expect(screen.getByText(/Le calendrier/).closest("td")?.textContent).not.toContain("cherché");
  });

  it("ne rend rien quand il n'a rien dit — et « rien dit » n'est JAMAIS un signal", () => {
    const { container } = render(
      <MemoryRouter>
        <PanneauPassation
          detail={detail()}
          portee={null}
          rang={3}
          subjectSlug="histoire-geographie"
          onRemesurer={vi.fn()}
          relecture={null}
        />
      </MemoryRouter>,
    );
    expect(container.textContent).not.toContain("Massimo raconte");
    // Aucune trace d'un silence commenté : pas de « n'a pas répondu », pas de « sans explication ».
    expect(container.textContent?.toLowerCase()).not.toMatch(/pas répondu|sans explication|refusé/);
  });
});

describe("🔴 la modale présélectionne la matière visée", () => {
  const MATIERES = [
    { id: 1, name: "Français", slug: "francais", a_un_diagnostic: true },
    { id: 2, name: "Histoire-Géographie", slug: "histoire-geographie", a_un_diagnostic: true },
  ];

  it("ouvre sur la matière demandée, pas sur la première", () => {
    // Sabotage : retirer `subjectInitial` du composant → rouge. Sans cette prop, « Remesurer cette
    // matière → » ouvrirait sur `subjects[0]` : une action qui ne rend pas ce qu'elle annonce —
    // le défaut exact que l'`adr-0045 §5` a refusé de livrer.
    render(
      <LancerDiagnosticDialog
        subjects={MATIERES}
        subjectInitial={2}
        onClose={vi.fn()}
        onTermine={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Histoire-Géographie" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sans prop, garde le comportement d'avant — la première matière", () => {
    render(<LancerDiagnosticDialog subjects={MATIERES} onClose={vi.fn()} onTermine={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
