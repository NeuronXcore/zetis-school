import { describe, expect, it } from "vitest";
import { routeLabel } from "./routeLabels";

// Continuité de l'historique de navigation (addendum ADR-0024 §D).
//
// `learning_events` est APPEND-ONLY : les visites enregistrées sous `/progression` entre le
// 2026-07-28 et le 2026-07-31 y resteront pour toujours. Ce mapping est le seul endroit où
// l'on peut les faire coïncider avec celles d'après le renommage.

describe("routeLabel", () => {
  it("rend le MÊME libellé pour /progression et /galaxy", () => {
    // Le cœur du §D : trois jours de fréquentation réelle de Massimo ne doivent pas apparaître
    // comme une page distincte, ni disparaître.
    expect(routeLabel("/progression")).toBe(routeLabel("/galaxy"));
    expect(routeLabel("/galaxy")).toBe("Ma Galaxie");
  });

  it("traduit les routes connues en mots, pas en chemins", () => {
    expect(routeLabel("/")).toBe("Accueil");
    expect(routeLabel("/eli5")).toBe("ELI5");
    expect(routeLabel("/revision/session")).toBe("Révision (session)");
  });

  it("rattache une route à segment variable à sa surface", () => {
    expect(routeLabel("/subjects/svt")).toBe("Matières");
    expect(routeLabel("/fiches/histoire")).toBe("Fiches");
    expect(routeLabel("/mindmaps/reconstruire/9")).toBe("Mindmaps");
  });

  it("ignore la query string et le slash final", () => {
    expect(routeLabel("/galaxy?subject=svt")).toBe("Ma Galaxie");
    expect(routeLabel("/eli5/")).toBe("ELI5");
  });

  it("rend une route inconnue TELLE QUELLE plutôt que rien", () => {
    // Une page nouvelle doit apparaître dans le cahier de bord même si personne n'a pensé à
    // l'ajouter ici : un trou d'affichage serait pire qu'un chemin brut.
    expect(routeLabel("/une-page-future")).toBe("/une-page-future");
  });
});
