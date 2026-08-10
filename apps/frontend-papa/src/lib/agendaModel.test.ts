import { describe, expect, it } from "vitest";
import { type AgendaItemPilot } from "@zetis/types";
import {
  addDays,
  agendaKpis,
  filterItems,
  isoDay,
  loadPercent,
  mondayOf,
  periodRange,
  weekColumns,
} from "./agendaModel";

// Mercredi 29 juillet 2026 (semaine du lundi 27).
const TODAY = new Date(2026, 6, 29);

function item(over: Partial<AgendaItemPilot> & { id: number; due_on: string }): AgendaItemPilot {
  return {
    label: `item ${over.id}`,
    subject: null,
    subject_id: null,
    chapter_id: null,
    lesson_id: null,
    kind: "devoir",
    created_by: "parent",
    parent_note: null,
    done_at: null,
    dismissed_at: null,
    edited_by_parent_at: null,
    created_at: null,
    updated_at: null,
    ...over,
  };
}

describe("isoDay", () => {
  it("formate en heure LOCALE, pas en UTC", () => {
    // Une échéance saisie à 23 h en France reculerait d'un jour avec toISOString().
    expect(isoDay(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
  });
});

describe("mondayOf", () => {
  it("rend le lundi, y compris depuis un dimanche", () => {
    expect(isoDay(mondayOf(new Date(2026, 6, 29)))).toBe("2026-07-27");
    expect(isoDay(mondayOf(new Date(2026, 7, 2)))).toBe("2026-07-27"); // dimanche
    expect(isoDay(mondayOf(new Date(2026, 6, 27)))).toBe("2026-07-27"); // lundi
  });
});

describe("periodRange", () => {
  it("borne la semaine en cours et la suivante sur lundi→dimanche", () => {
    expect(periodRange("current", TODAY)).toEqual({ from: "2026-07-27", to: "2026-08-02" });
    expect(periodRange("next", TODAY)).toEqual({ from: "2026-08-03", to: "2026-08-09" });
  });
});

describe("filterItems", () => {
  const items = [
    item({ id: 1, due_on: "2026-07-28" }),
    item({ id: 2, due_on: "2026-08-05" }),
    item({ id: 3, due_on: "2026-07-30", dismissed_at: "2026-07-29T08:00:00Z" }),
    item({ id: 4, due_on: "2026-07-30", subject_id: 7 }),
  ];

  it("garde les archivés HORS des vues courantes", () => {
    const visible = filterItems(items, { period: "current", subjectId: null }, TODAY);
    expect(visible.map((i) => i.id)).toEqual([1, 4]);
  });

  it("ne montre les archivés que sous « Archivés »", () => {
    const visible = filterItems(items, { period: "archived", subjectId: null }, TODAY);
    expect(visible.map((i) => i.id)).toEqual([3]);
  });

  it("filtre par matière", () => {
    const visible = filterItems(items, { period: "current", subjectId: 7 }, TODAY);
    expect(visible.map((i) => i.id)).toEqual([4]);
  });
});

describe("weekColumns", () => {
  it("rend SEPT colonnes, jours vides compris, et marque aujourd'hui", () => {
    const columns = weekColumns([item({ id: 1, due_on: "2026-07-30" })], mondayOf(TODAY), TODAY);
    expect(columns).toHaveLength(7);
    expect(columns.map((c) => c.items.length)).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(columns.filter((c) => c.isToday).map((c) => c.date)).toEqual(["2026-07-29"]);
  });
});

describe("agendaKpis", () => {
  const items = [
    item({ id: 1, due_on: "2026-07-28", created_by: "student", done_at: "2026-07-28T10:00:00Z" }),
    item({ id: 2, due_on: "2026-07-30", kind: "controle" }),
    item({ id: 3, due_on: "2026-07-30", created_by: "student" }),
    item({ id: 4, due_on: "2026-08-20", kind: "controle" }), // hors semaine, mais à venir
    item({ id: 5, due_on: "2026-07-31", dismissed_at: "2026-07-29T08:00:00Z" }),
  ];

  it("compte la semaine, les contrôles à venir, les origines et les coches", () => {
    expect(agendaKpis(items, TODAY)).toEqual({
      weekCount: 3, // l'archivé (5) ne pèse plus sur rien
      upcomingControls: 2,
      byStudent: 2,
      byParent: 1,
      checked: 1,
    });
  });

  it("n'expose AUCUN compteur d'items non faits (ADR-0025 §3)", () => {
    // Test-verrou : la métrique qu'un tableau de bord produirait naturellement est exactement
    // celle que l'ADR interdit d'émettre. Son inverse positif (`checked`) la remplace.
    const keys = Object.keys(agendaKpis(items, TODAY));
    expect(keys).not.toContain("missed");
    expect(keys).not.toContain("overdue");
    expect(keys).not.toContain("undone");
  });

  it("ne compte pas un contrôle déjà coché parmi les contrôles à venir", () => {
    const done = [item({ id: 9, due_on: "2026-07-30", kind: "controle", done_at: "x" })];
    expect(agendaKpis(done, TODAY).upcomingControls).toBe(0);
  });
});

describe("loadPercent", () => {
  it("rend une part de la journée la plus chargée, et 0 sur une semaine vide", () => {
    expect(loadPercent(2, 4)).toBe(50);
    expect(loadPercent(0, 0)).toBe(0);
  });
});

describe("addDays", () => {
  it("ne mute pas la date d'origine", () => {
    const base = new Date(2026, 6, 29);
    expect(isoDay(addDays(base, 7))).toBe("2026-08-05");
    expect(isoDay(base)).toBe("2026-07-29");
  });
});
