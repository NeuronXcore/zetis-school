import { describe, expect, it } from "vitest";
import { MASSIMO_NAV } from "./navigation";

// Non-régression du renommage `/progression` → `/galaxy` (addendum ADR-0024 §A).
//
// Ce que ces tests protègent, ce n'est pas le libellé pour lui-même : c'est l'interdit du §1 de
// l'ADR-0024 — la Galaxy ne doit pas devenir un onglet DE PLUS. Un renommage qui ajoute une
// entrée n'est plus un renommage.

describe("sidebar Massimo — entrée de la Galaxy", () => {
  it("expose « Ma Galaxie » sur /galaxy, et plus aucune entrée /progression", () => {
    const galaxy = MASSIMO_NAV.filter((item) => item.to === "/galaxy");
    expect(galaxy).toHaveLength(1);
    expect(galaxy[0].label).toBe("Ma Galaxie");
    expect(MASSIMO_NAV.some((item) => item.to === "/progression")).toBe(false);
  });

  it("garde la MÊME position : le renommage n'ajoute pas de 6ᵉ onglet (ADR-0024 §1)", () => {
    // Le nombre d'entrées est le vrai invariant — l'index en découle.
    expect(MASSIMO_NAV).toHaveLength(13);
    expect(MASSIMO_NAV.findIndex((item) => item.to === "/galaxy")).toBe(10);
  });

  it("n'a aucune route en double (une surface = une entrée)", () => {
    const routes = MASSIMO_NAV.map((item) => item.to);
    expect(new Set(routes).size).toBe(routes.length);
  });
});

// Témoins de nouveauté (ADR-0030). Ce qui est verrouillé ici, c'est la LISTE : une entrée n'est
// éligible que si elle a une trace de VUE côté serveur, et les absences sont des décisions.
describe("sidebar Massimo — témoins de nouveauté", () => {
  it("porte un témoin sur exactement six entrées", () => {
    const withBadge = Object.fromEntries(
      MASSIMO_NAV.filter((item) => item.newsKey).map((item) => [item.to, item.newsKey]),
    );
    expect(withBadge).toEqual({
      "/agenda": "agenda",
      "/fiches": "fiches",
      "/capsules": "capsules",
      "/revision": "revision",
      "/missions": "missions",
      "/mindmaps": "mindmaps",
    });
  });

  it("n'attribue jamais deux fois la même clé", () => {
    const keys = MASSIMO_NAV.map((item) => item.newsKey).filter(Boolean);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("laisse ELI5 SANS témoin, et ce n'est pas un oubli", () => {
    // ELI5 a bien un `new_count`, mais c'est un critère de RÉCENCE (leçon porteuse créée dans les
    // 7 jours), pas de vue. Il décroîtrait tout seul et allumerait une entrée fraîchement
    // visitée — un badge qui ment sur ce qu'on a lu ne se répare pas (ADR-0030 §2).
    // Ce test existe pour qu'une prochaine session ne « complète » pas la liste par symétrie
    // avec les autres dérivés.
    expect(MASSIMO_NAV.find((item) => item.to === "/eli5")?.newsKey).toBeUndefined();
  });

  it("laisse Quiz SANS témoin : il n'y a aucun moment « ça arrive »", () => {
    // La table `quizzes` n'a pas de `validation_status` (ADR-0014 §2) : un quiz se produit à la
    // demande sur le cours qu'on vient de lire. Pas « pas encore branché » — pas d'objet.
    expect(MASSIMO_NAV.find((item) => item.to === "/quiz")?.newsKey).toBeUndefined();
  });

  it("laisse sans témoin toute entrée sans contenu qui « arrive »", () => {
    for (const route of ["/", "/matieres", "/quiz", "/diagnostic", "/galaxy", "/chat"]) {
      expect(MASSIMO_NAV.find((item) => item.to === route)?.newsKey).toBeUndefined();
    }
  });
});
