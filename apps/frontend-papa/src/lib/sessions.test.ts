import { describe, expect, it } from "vitest";
import type { ActivitySessionDay } from "@zetis/types";
import {
  buildMonthGrid,
  dayActiveMinutes,
  latestDayWithSessions,
  monthLabel,
  monthRange,
  periodTotals,
  shiftMonth,
} from "./sessions";

// Fonctions pures de la vue Sessions. Le formatage (`formatMinutes`, `formatLongDate`) est
// réutilisé de `lib/heatmap.ts` et déjà testé là-bas : rien n'est redéclaré ici.

function day(date: string, sessions: { active: number }[]): ActivitySessionDay {
  return {
    date,
    sessions: sessions.map((s, i) => ({
      started_at: `${date}T08:0${i}:00+00:00`,
      ended_at: `${date}T09:0${i}:00+00:00`,
      started_time: "10:00",
      ended_time: "11:00",
      active_minutes: s.active,
      events: [],
    })),
  };
}

describe("monthRange", () => {
  it("couvre le mois entier, du 1er au dernier jour", () => {
    expect(monthRange(new Date(2026, 6, 15))).toEqual({ from: "2026-07-01", to: "2026-07-31" });
    // Mois court et année bissextile : le dernier jour est calculé, jamais présumé.
    expect(monthRange(new Date(2026, 1, 10)).to).toBe("2026-02-28");
    expect(monthRange(new Date(2028, 1, 10)).to).toBe("2028-02-29");
  });
});

describe("shiftMonth", () => {
  it("ne déborde pas depuis un 31 (ancrage au 1er)", () => {
    // Un `setMonth(-1)` naïf depuis le 31 mars donnerait le 3 mars (février n'a pas de 31).
    expect(monthLabel(shiftMonth(new Date(2026, 2, 31), -1))).toBe("février 2026");
    expect(monthLabel(shiftMonth(new Date(2026, 2, 31), 1))).toBe("avril 2026");
  });

  it("franchit les années", () => {
    expect(monthLabel(shiftMonth(new Date(2026, 0, 15), -1))).toBe("décembre 2025");
    expect(monthLabel(shiftMonth(new Date(2026, 11, 15), 1))).toBe("janvier 2027");
  });
});

describe("buildMonthGrid", () => {
  const anchor = new Date(2026, 6, 15); // juillet 2026 : le 1er tombe un mercredi
  const today = new Date(2026, 6, 15);

  it("aligne les colonnes sur les jours de la semaine, lundi en premier", () => {
    const weeks = buildMonthGrid([], anchor, today);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    // La grille commence au lundi précédant le 1er juillet (mercredi) → 29 juin.
    expect(weeks[0][0].date).toBe("2026-06-29");
    expect(weeks[0][0].inMonth).toBe(false); // remplissage du mois voisin
    expect(weeks[0][2].date).toBe("2026-07-01");
    expect(weeks[0][2].inMonth).toBe(true);
  });

  it("reporte sessions et minutes, et marque le futur", () => {
    const weeks = buildMonthGrid(
      [day("2026-07-15", [{ active: 20 }, { active: 10 }]), day("2026-07-14", [])],
      anchor,
      today,
    );
    const cells = weeks.flat();
    expect(cells.find((c) => c.date === "2026-07-15")).toMatchObject({
      sessions: 2,
      activeMinutes: 30,
      future: false,
    });
    expect(cells.find((c) => c.date === "2026-07-14")).toMatchObject({ sessions: 0 });
    expect(cells.find((c) => c.date === "2026-07-16")?.future).toBe(true);
  });
});

describe("latestDayWithSessions", () => {
  it("rend le jour actif le plus récent (sélection par défaut à l'ouverture)", () => {
    const days = [
      day("2026-07-06", [{ active: 10 }]),
      day("2026-07-15", [{ active: 5 }]),
      day("2026-07-20", []),
    ];
    expect(latestDayWithSessions(days)).toBe("2026-07-15");
  });

  it("rend null quand le mois est vide", () => {
    expect(latestDayWithSessions([day("2026-07-20", [])])).toBeNull();
    expect(latestDayWithSessions([])).toBeNull();
  });
});

describe("periodTotals", () => {
  it("somme les sessions et les minutes servies, et moyenne", () => {
    const days = [day("2026-07-15", [{ active: 20 }, { active: 10 }]), day("2026-07-14", [{ active: 15 }])];
    expect(periodTotals(days)).toEqual({
      sessions: 3,
      activeMinutes: 45,
      averageMinutes: 15,
    });
  });

  it("ne divise pas par zéro sur une période vide", () => {
    expect(periodTotals([])).toEqual({ sessions: 0, activeMinutes: 0, averageMinutes: 0 });
    expect(periodTotals([day("2026-07-15", [])])).toEqual({
      sessions: 0,
      activeMinutes: 0,
      averageMinutes: 0,
    });
  });
});

describe("dayActiveMinutes", () => {
  it("additionne les sessions du jour", () => {
    expect(dayActiveMinutes(day("2026-07-15", [{ active: 12 }, { active: 8 }]))).toBe(20);
    expect(dayActiveMinutes(day("2026-07-15", []))).toBe(0);
  });
});
