import { describe, expect, it } from "vitest";
import type { DashboardKpis } from "@zetis/types";
import { isCompleteKpis } from "./DashboardPage";

// Garde de version du payload KPI. Test de NON-RÉGRESSION d'un vrai incident : un backend
// démarré avant l'ajout des deux stocks renvoyait un payload sans `open_gaps`, et lire `.value`
// dessus blanchissait toute la page.

const complete: DashboardKpis = {
  week_start: "2026-07-27",
  sessions: { value: 2, delta: 2 },
  active_minutes: { value: 35, delta: 35 },
  xp: { value: 0, delta: 0 },
  missions_completed: { value: 0, delta: 0 },
  open_gaps: { value: 1 },
  consolidated_skills: { value: 1 },
};

describe("isCompleteKpis", () => {
  it("accepte un payload complet", () => {
    expect(isCompleteKpis(complete)).toBe(true);
  });

  it("refuse un payload d'une version antérieure (stocks absents)", () => {
    const { open_gaps: _o, consolidated_skills: _c, ...older } = complete;
    expect(isCompleteKpis(older as DashboardKpis)).toBe(false);
  });

  it("refuse un flux privé de son delta", () => {
    const broken = { ...complete, sessions: { value: 2 } } as DashboardKpis;
    expect(isCompleteKpis(broken)).toBe(false);
  });

  it("refuse null et undefined sans lever", () => {
    expect(isCompleteKpis(null)).toBe(false);
    expect(isCompleteKpis(undefined)).toBe(false);
  });

  it("accepte des valeurs à zéro (0 est une valeur, pas une absence)", () => {
    const zeros: DashboardKpis = {
      ...complete,
      sessions: { value: 0, delta: 0 },
      open_gaps: { value: 0 },
      consolidated_skills: { value: 0 },
    };
    expect(isCompleteKpis(zeros)).toBe(true);
  });
});
