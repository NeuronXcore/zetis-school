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
