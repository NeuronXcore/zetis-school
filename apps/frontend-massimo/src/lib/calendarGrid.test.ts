import { describe, expect, it } from "vitest";
import { buildSparseCalendar, startOfWeek, toLocalIso } from "@zetis/ui";

// Ce que ces tests protègent : `buildSparseCalendar` ne doit JAMAIS fabriquer un jour vide.
// C'est la différence de nature avec `buildHeatmapGrid` (Papa), qui lui en fabrique — et c'est
// ce qui permet à « Mon ciel » d'être un calendrier sans être un décompte d'absences.

const LUNDI = new Date(2026, 6, 27); // 27 juillet 2026, un lundi

describe("toLocalIso", () => {
  it("rend le jour LOCAL, sans bascule UTC", () => {
    // 23h30 heure locale : `toISOString()` basculerait au lendemain en UTC+2.
    expect(toLocalIso(new Date(2026, 6, 31, 23, 30))).toBe("2026-07-31");
  });
});

describe("startOfWeek", () => {
  it("rend le lundi, dimanche compris", () => {
    expect(toLocalIso(startOfWeek(new Date(2026, 6, 29)))).toBe("2026-07-27"); // mercredi
    expect(toLocalIso(startOfWeek(new Date(2026, 7, 2)))).toBe("2026-07-27"); // dimanche
    expect(toLocalIso(startOfWeek(LUNDI))).toBe("2026-07-27");
  });
});

describe("buildSparseCalendar", () => {
  it("ne produit QUE les jours reçus — aucun jour vide n'est fabriqué", () => {
    // LE test de la brique. 3 jours sur 3 semaines : 3 slots, jamais 21.
    const { slots, weeks } = buildSparseCalendar(
      ["2026-07-13", "2026-07-20", "2026-07-29"],
      new Date(2026, 6, 31),
    );
    expect(slots).toHaveLength(3);
    expect(weeks).toBe(3);
  });

  it("place chaque jour sur la bonne colonne et la bonne ligne", () => {
    const { slots } = buildSparseCalendar(["2026-07-27", "2026-07-31"], new Date(2026, 6, 31));
    // 27 = lundi de la 1re semaine, 31 = vendredi de la même semaine.
    expect(slots[0]).toEqual({ date: "2026-07-27", week: 0, dow: 0 });
    expect(slots[1]).toEqual({ date: "2026-07-31", week: 0, dow: 4 });
  });

  it("commence à la semaine du PREMIER jour — jamais avant l'histoire de l'élève", () => {
    const { weeks, months } = buildSparseCalendar(["2026-07-29"], new Date(2026, 6, 31));
    expect(weeks).toBe(1);
    expect(months).toEqual([{ week: 0, label: "juil." }]);
  });

  it("ignore une date future plutôt que d'élargir la grille", () => {
    const { slots } = buildSparseCalendar(
      ["2026-07-29", "2026-12-25"],
      new Date(2026, 6, 31),
    );
    expect(slots.map((s) => s.date)).toEqual(["2026-07-29"]);
  });

  it("pose un libellé à chaque changement de mois, quand la place le permet", () => {
    // 1er juin → 31 août : les mois sont séparés d'au moins 4 colonnes, tous sont libellés.
    const { months } = buildSparseCalendar(["2026-06-01"], new Date(2026, 7, 31));
    expect(months.map((m) => m.label)).toEqual(["juin", "juil.", "août"]);
  });

  it("SAUTE un libellé qui chevaucherait le précédent", () => {
    // Constaté en vrai : « juin » commençant un mardi, « juil. » tombait UNE colonne plus loin
    // (11 px) et les deux mots s'écrivaient l'un sur l'autre. Mieux vaut un repère de moins
    // qu'un repère illisible.
    const { months } = buildSparseCalendar(["2026-06-29"], new Date(2026, 6, 31));
    expect(months.map((m) => m.label)).toEqual(["juin"]);
  });

  it("rend une grille vide pour une série vide", () => {
    expect(buildSparseCalendar([], LUNDI)).toEqual({ slots: [], weeks: 0, months: [] });
  });
});
