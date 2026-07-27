import { describe, expect, it } from "vitest";
import type { ActivitySessionDay } from "@zetis/types";
import { dayActiveMinutes, periodRange, periodRangeForDate, periodTotals } from "./sessions";

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

describe("periodRange", () => {
  it("inclut le jour d'ancrage : « 7 jours » couvre 7 dates, pas 8", () => {
    const range = periodRange(7, new Date(2026, 6, 15));
    expect(range).toEqual({ from: "2026-07-09", to: "2026-07-15" });
  });

  it("couvre les périodes 14 et 30 jours", () => {
    expect(periodRange(14, new Date(2026, 6, 15)).from).toBe("2026-07-02");
    expect(periodRange(30, new Date(2026, 6, 15)).from).toBe("2026-06-16");
  });
});

describe("periodRangeForDate", () => {
  const today = new Date(2026, 6, 15);

  it("termine la fenêtre sur le jour ciblé, pour qu'il soit visible", () => {
    expect(periodRangeForDate("2026-07-06", 7, today)).toEqual({
      from: "2026-06-30",
      to: "2026-07-06",
    });
  });

  it("retombe sur la période courante si la cible est aujourd'hui ou dans le futur", () => {
    const standard = { from: "2026-07-09", to: "2026-07-15" };
    expect(periodRangeForDate("2026-07-15", 7, today)).toEqual(standard);
    // Lien bricolé à la main : on ne charge pas une fenêtre qui se termine dans le futur.
    expect(periodRangeForDate("2026-12-25", 7, today)).toEqual(standard);
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
