import { describe, expect, it } from "vitest";
import {
  cycleForLevel,
  formatDateRange,
  programmeLine,
  yearActions,
} from "./yearDisplay";

// Fonctions pures de la page Années scolaires : test exhaustif des statuts
// (patron chapterActions) + résolution niveau → cycle (ADR-0009 §5).

describe("yearActions", () => {
  it("active : badge émeraude, édition + lien programme, pas d'activation", () => {
    expect(yearActions("active")).toEqual({
      badge: { label: "Active", variant: "success" },
      canEdit: true,
      showProgramLink: true,
      canActivate: false,
    });
  });

  it("draft : badge ambre, activable, ni édition ni lien programme", () => {
    expect(yearActions("draft")).toEqual({
      badge: { label: "Brouillon", variant: "warning" },
      canEdit: false,
      showProgramLink: false,
      canActivate: true,
    });
  });

  it("archived : badge neutre, activable (seule voie de retour), rien d'autre", () => {
    expect(yearActions("archived")).toEqual({
      badge: { label: "Archivée", variant: "muted" },
      canEdit: false,
      showProgramLink: false,
      canActivate: true,
    });
  });
});

describe("cycleForLevel / programmeLine", () => {
  it("résout les niveaux collège (5e/4e/3e → cycle 4, 6e → cycle 3)", () => {
    expect(cycleForLevel("6e")).toBe("cycle 3");
    expect(cycleForLevel("5e")).toBe("cycle 4");
    expect(cycleForLevel("4e")).toBe("cycle 4");
    expect(cycleForLevel("3e")).toBe("cycle 4");
  });

  it("lycée non résolu (génération différée, ADR-0009 §8) : pas de ligne Programme", () => {
    expect(cycleForLevel("2de")).toBeUndefined();
    expect(programmeLine("2de", "2020")).toBeNull();
  });

  it("version portée par les chapitres présente → « cycle · version », sinon cycle seul", () => {
    expect(programmeLine("4e", "2020")).toBe("cycle 4 · version 2020");
    expect(programmeLine("4e", null)).toBe("cycle 4");
  });
});

describe("formatDateRange", () => {
  it("deux dates → plage française compacte", () => {
    expect(formatDateRange("2026-09-01", "2027-07-04")).toBe(
      "01 sept. 2026 → 04 juil. 2027",
    );
  });

  it("une seule date → formulation partielle ; aucune → null", () => {
    expect(formatDateRange("2026-09-01", null)).toBe("À partir du 01 sept. 2026");
    expect(formatDateRange(null, "2027-07-04")).toBe("Jusqu'au 04 juil. 2027");
    expect(formatDateRange(null, null)).toBeNull();
  });
});
