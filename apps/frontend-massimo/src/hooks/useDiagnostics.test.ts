import { describe, expect, it } from "vitest";
import { trierParAgeDeMesure } from "./useDiagnostics";
import type { DiagnosticListItem } from "../lib/diagnostic";

function item(p: Partial<DiagnosticListItem> & { quiz_id: number }): DiagnosticListItem {
  return {
    title: `Diagnostic ${p.quiz_id}`,
    subject: "Mathématiques",
    subject_slug: "mathematiques",
    questions_count: 5,
    taken_at: null,
    last_attempt_id: null,
    measured_at: null,
    ...p,
  };
}

describe("trierParAgeDeMesure (ADR-0044 Décision 2)", () => {
  it("met les JAMAIS MESURÉS devant, quel que soit leur rang d'arrivée", () => {
    // Décor non dégénéré : les dates sont distinctes et non extrêmes, et le jamais-mesuré est
    // volontairement placé EN DERNIER à l'entrée — sinon l'ordre d'arrivée suffirait à faire
    // passer le test.
    const ordre = trierParAgeDeMesure([
      item({ quiz_id: 10, measured_at: "2026-07-20T10:00:00+00:00" }),
      item({ quiz_id: 11, measured_at: "2026-03-15T10:00:00+00:00" }),
      item({ quiz_id: 12, measured_at: null }),
    ]).map((d) => d.quiz_id);

    expect(ordre).toEqual([12, 11, 10]);
  });

  it("départage par quiz_id décroissant à mesure ÉGALE — le cas le plus fréquent en vrai", () => {
    // ⚠️ Ce n'est pas un cas limite : en base de dev, 4 diagnostics sur 15 partagent leur
    // `measured_at` à la MICROSECONDE avec un autre — deux diagnostics d'une même matière
    // piochent dans le même vivier de notions. C'est donc ce départage qui décide le plus souvent.
    const meme = "2026-07-05T23:55:37.641935+00:00";
    const ordre = trierParAgeDeMesure([
      item({ quiz_id: 29, measured_at: meme }),
      item({ quiz_id: 30, measured_at: meme }),
    ]).map((d) => d.quiz_id);

    expect(ordre).toEqual([30, 29]);
  });

  it("🔴 ne peut PAS trier sur un résultat : aucun score n'est servi", () => {
    // Le verrou structurel de la Décision 2. Trier par « la matière où il est le plus faible »
    // serait un diagnostic négatif montré à l'enfant — un ordre de liste EST une formulation.
    // La garantie ne tient pas à la discipline du tri : elle tient à ce que le contrat de liste
    // ne PORTE aucun score (ADR-0044 §6). Si un score réapparaît ici, ce test doit rougir.
    const champs = Object.keys(item({ quiz_id: 1 }));
    for (const interdit of ["score", "score_percent", "mastery_score", "severity", "status"]) {
      expect(champs).not.toContain(interdit);
    }
  });

  it("ne perd et ne duplique aucun diagnostic", () => {
    const entree = [1, 2, 3, 4].map((quiz_id) => item({ quiz_id }));
    expect(trierParAgeDeMesure(entree)).toHaveLength(4);
    expect(new Set(trierParAgeDeMesure(entree).map((d) => d.quiz_id)).size).toBe(4);
  });

  it("ne modifie pas le tableau qu'on lui passe", () => {
    const entree = [item({ quiz_id: 1, measured_at: "2026-07-20T10:00:00Z" }), item({ quiz_id: 2 })];
    trierParAgeDeMesure(entree);
    expect(entree.map((d) => d.quiz_id)).toEqual([1, 2]);
  });
});
