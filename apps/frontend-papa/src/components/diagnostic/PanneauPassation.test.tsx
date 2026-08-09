import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { DiagnosticResult } from "@zetis/types";
import { PanneauPassation } from "./PanneauPassation";

// La station ② du Diagnostic — « ce qui a été ouvert ».
//
// 🔴 **Ce composant n'était rendu par AUCUN test** avant le 2026-08-09 : le dossier n'en portait
// que deux, sur de la logique pure (`crans`, `focus`). Ses trois liens pouvaient donc changer de
// destination sans que rien ne rougisse — et deux d'entre eux mentent effectivement sur leur
// grain depuis leur écriture. Ce fichier verrouille celui que l'ADR-0047 §8 corrige.

function resultat(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    attempt_id: 12,
    quiz_id: 34,
    subject_id: 3,
    subject: "Français",
    score_percent: 63,
    completed_at: "2026-08-05T10:00:00+02:00",
    per_skill: [
      { skill_id: 7, skill_name: "Temps du récit", score: 40, status: "weak", questions_count: 5 },
    ],
    gaps: [
      { skill_id: 7, skill_name: "Temps du récit", severity: "medium", status: "open", content_state: "ok" },
    ],
    ...overrides,
  };
}

function renderPanneau(detail = resultat(), subjectSlug = "francais") {
  render(
    <MemoryRouter>
      <PanneauPassation detail={detail} portee={null} rang={2} subjectSlug={subjectSlug} />
    </MemoryRouter>,
  );
}

describe("« Voir la lacune → » transporte la matière (ADR-0047 §8)", () => {
  it("🔴 il ne mène plus à /lacunes NU", async () => {
    // Le cul-de-sac CIRCULAIRE que l'ADR-0047 cite en Contexte comme motif du chantier : Papa
    // quittait un diagnostic de Français pour la liste complète, toutes matières — depuis un
    // écran qui, lui, lui donnait le motif ET l'action.
    renderPanneau();

    const lien = await screen.findByRole("link", { name: /Voir la lacune/ });
    expect(lien).toHaveAttribute("href", "/lacunes?subject=francais");
  });

  it("le slug vient du RAIL, pas de `detail` — un autre slug donne un autre lien", async () => {
    // `DiagnosticResult` porte `subject` (le NOM) et `subject_id`, jamais le slug ; la page
    // Lacunes filtre par slug. Le test le prouve en changeant le slug SANS toucher `detail`.
    renderPanneau(resultat(), "mathematiques");

    expect(await screen.findByRole("link", { name: /Voir la lacune/ })).toHaveAttribute(
      "href",
      "/lacunes?subject=mathematiques",
    );
  });

  it("⚠️ les deux autres gestes visent encore la MATIÈRE — et c'est consigné, pas oublié", async () => {
    // Ce test fige une DETTE, pas une qualité. « Produire le quiz de cette notion » mène à
    // `/quiz?subject=`, « Valider le cours de cette leçon » à `/programme?subject=` : les deux
    // promettent un grain que le lien ne livre pas. Les corriger demande `lesson_id` au contrat de
    // `lacunes_de_passation` et l'action `equipNotion` portée ici — différé au `BACKLOG.md` avec
    // son vrai chiffrage. 🔴 **Si ce test tombe, c'est que quelqu'un a payé la dette : il faut
    // alors le SUPPRIMER, pas l'ajuster.**
    renderPanneau(
      resultat({
        gaps: [
          {
            skill_id: 7,
            skill_name: "Temps du récit",
            severity: "medium",
            status: "open",
            content_state: "aucune_lecon",
          },
        ],
      }),
    );

    expect(await screen.findByRole("link", { name: /quiz/i })).toHaveAttribute(
      "href",
      "/quiz?subject=3",
    );
  });
});
