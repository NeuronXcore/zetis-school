import { describe, expect, it } from "vitest";
import {
  HEAT_CLASSES,
  buildHeatmapGrid,
  formatDelta,
  formatMinutes,
  heatLevel,
  monthLabels,
  startOfWeek,
  toLocalIso,
} from "./heatmap";

// Fonctions pures du bloc Régularité : paliers de couleur et construction de la grille.
// Tout le reste (minutes, XP, décrochage, deltas) vient du serveur et n'est pas retesté ici.

describe("heatLevel", () => {
  it("mappe les minutes actives sur les 5 paliers de la spec", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(9)).toBe(1);
    expect(heatLevel(10)).toBe(2); // borne basse du palier 10–20
    expect(heatLevel(19)).toBe(2);
    expect(heatLevel(20)).toBe(3);
    expect(heatLevel(39)).toBe(3);
    expect(heatLevel(40)).toBe(4); // 40 min et plus
    expect(heatLevel(300)).toBe(4);
  });

  it("chaque palier a une classe distincte (l'intensité doit se voir)", () => {
    const classes = Object.values(HEAT_CLASSES);
    expect(new Set(classes).size).toBe(classes.length);
  });
});

describe("toLocalIso", () => {
  it("garde la date LOCALE, même tard le soir", () => {
    // 23h30 heure locale : `toISOString()` renverrait le lendemain en UTC+2 et décalerait
    // toute la grille d'un jour.
    expect(toLocalIso(new Date(2026, 6, 15, 23, 30))).toBe("2026-07-15");
  });
});

describe("startOfWeek", () => {
  it("remonte au lundi (semaines lun→dim, comme le serveur)", () => {
    expect(toLocalIso(startOfWeek(new Date(2026, 6, 15)))).toBe("2026-07-13"); // mercredi → lundi
    expect(toLocalIso(startOfWeek(new Date(2026, 6, 13)))).toBe("2026-07-13"); // lundi → lui-même
    expect(toLocalIso(startOfWeek(new Date(2026, 6, 19)))).toBe("2026-07-13"); // dimanche → lundi
  });
});

describe("buildHeatmapGrid", () => {
  const today = new Date(2026, 6, 15); // mercredi 15 juillet 2026

  it("produit weeks colonnes de 7 jours, lundi en haut", () => {
    const grid = buildHeatmapGrid([], today, 26);
    expect(grid).toHaveLength(26);
    expect(grid.every((column) => column.length === 7)).toBe(true);
    // Première case = un lundi, dernière colonne = la semaine courante.
    expect(new Date(`${grid[0][0].date}T00:00:00`).getDay()).toBe(1);
    expect(grid[25].map((c) => c.date)).toContain("2026-07-15");
  });

  it("reconstruit à 0 les jours vides omis par le serveur", () => {
    const grid = buildHeatmapGrid(
      [{ date: "2026-07-15", active_minutes: 24, events: 9, xp: 30 }],
      today,
      2,
    );
    const cells = grid.flat();
    const filled = cells.find((c) => c.date === "2026-07-15");
    expect(filled).toMatchObject({ activeMinutes: 24, events: 9, xp: 30, level: 3 });
    // Les autres jours passés existent bien, à zéro (l'absence est une information).
    const empty = cells.find((c) => c.date === "2026-07-14");
    expect(empty).toMatchObject({ activeMinutes: 0, level: 0, future: false });
  });

  it("marque comme futurs les jours postérieurs à aujourd'hui", () => {
    const grid = buildHeatmapGrid([], today, 1);
    const cells = grid.flat();
    expect(cells.find((c) => c.date === "2026-07-15")?.future).toBe(false);
    expect(cells.find((c) => c.date === "2026-07-16")?.future).toBe(true);
    expect(cells.find((c) => c.date === "2026-07-19")?.future).toBe(true);
  });
});

describe("monthLabels", () => {
  it("n'affiche le mois qu'au changement, pas à chaque colonne", () => {
    const labels = monthLabels(buildHeatmapGrid([], new Date(2026, 6, 15), 10));
    expect(labels.filter(Boolean).length).toBeGreaterThan(0);
    expect(labels.filter(Boolean).length).toBeLessThan(labels.length);
  });
});

describe("formatMinutes", () => {
  it("passe en heures au-delà de 60 min", () => {
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1h00");
    expect(formatMinutes(72)).toBe("1h12");
  });
});

describe("formatDelta", () => {
  it("signe l'écart et n'affiche RIEN à zéro", () => {
    expect(formatDelta(18, "min")).toBe("+18 min");
    expect(formatDelta(-2)).toBe("−2"); // vrai signe moins, pas un trait d'union
    expect(formatDelta(0)).toBeNull();
  });
});
