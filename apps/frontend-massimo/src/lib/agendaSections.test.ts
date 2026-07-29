import { describe, expect, it } from "vitest";
import { type AgendaItemStudent } from "@zetis/types";
import {
  RESUME_MAX,
  bannerItems,
  daysLeftLabel,
  isoDay,
  originLabel,
  splitSections,
} from "./agendaSections";

// Mercredi 29 juillet 2026.
const TODAY = new Date(2026, 6, 29);

function item(over: Partial<AgendaItemStudent> & { id: number; due_on: string }): AgendaItemStudent {
  return {
    label: `item ${over.id}`,
    subject: null,
    kind: "devoir",
    done: false,
    created_by: "parent",
    edited_by_parent: false,
    ...over,
  };
}

describe("isoDay", () => {
  it("formate en heure locale (une saisie de 23 h ne recule pas d'un jour)", () => {
    expect(isoDay(new Date(2026, 6, 29, 23, 30))).toBe("2026-07-29");
  });
});

describe("splitSections", () => {
  const items = [
    item({ id: 1, due_on: "2026-07-29" }),
    item({ id: 2, due_on: "2026-07-30" }),
    item({ id: 3, due_on: "2026-08-01" }),
    item({ id: 4, due_on: "2026-07-27" }),
    item({ id: 5, due_on: "2026-07-28", done: true }),
  ];

  it("range aujourd'hui, demain et la suite", () => {
    const sections = splitSections(items, TODAY);
    expect(sections.today.map((i) => i.id)).toEqual([1]);
    expect(sections.tomorrow.map((i) => i.id)).toEqual([2]);
    expect(sections.later.map((i) => i.id)).toEqual([3]);
  });

  it("ne fait pas revenir un item passé DÉJÀ FAIT : il n'y a rien à reprendre", () => {
    expect(splitSections(items, TODAY).resume.map((i) => i.id)).toEqual([4]);
  });

  it("plafonne « à reprendre » à 3, quel qu'en soit le nombre réel", () => {
    // Mécanisme anti-dette (ADR-0025 §7) : la section ne grossit JAMAIS, et les items omis le
    // sont en silence — aucun « et 7 autres », qui serait un compteur d'arriéré déguisé.
    const many = Array.from({ length: 10 }, (_, index) =>
      item({ id: 100 + index, due_on: `2026-07-1${index % 10}` }),
    );
    const sections = splitSections(many, TODAY);
    expect(sections.resume).toHaveLength(RESUME_MAX);
  });

  it("garde les plus récents parmi les items à reprendre", () => {
    const sections = splitSections(
      [
        item({ id: 1, due_on: "2026-07-20" }),
        item({ id: 2, due_on: "2026-07-26" }),
        item({ id: 3, due_on: "2026-07-27" }),
        item({ id: 4, due_on: "2026-07-28" }),
      ],
      TODAY,
    );
    expect(sections.resume.map((i) => i.id)).toEqual([4, 3, 2]);
  });
});

describe("originLabel", () => {
  it("annonce « ajouté par papa » sur un item de Papa", () => {
    expect(originLabel(item({ id: 1, due_on: "2026-07-29" }))).toBe("ajouté par papa");
  });

  it("annonce la CORRECTION en priorité : c'est l'information neuve (§2a)", () => {
    const corrected = item({
      id: 2,
      due_on: "2026-07-29",
      created_by: "student",
      edited_by_parent: true,
    });
    expect(originLabel(corrected)).toBe("complété par papa");
  });

  it("ne dit rien sur un item que Massimo a écrit lui-même", () => {
    expect(originLabel(item({ id: 3, due_on: "2026-07-29", created_by: "student" }))).toBeNull();
  });
});

describe("daysLeftLabel", () => {
  it("parle en jours, jamais en retard", () => {
    expect(daysLeftLabel(0)).toBe("aujourd'hui");
    expect(daysLeftLabel(1)).toBe("demain");
    expect(daysLeftLabel(5)).toBe("dans 5 jours");
    // Une valeur négative n'est pas censée arriver (le serveur borne à partir d'aujourd'hui),
    // et surtout : elle ne produit AUCUN vocabulaire de retard.
    expect(daysLeftLabel(-2)).toBe("aujourd'hui");
  });
});

describe("bannerItems", () => {
  it("prend aujourd'hui puis demain, 3 au maximum", () => {
    const sections = splitSections(
      [
        item({ id: 1, due_on: "2026-07-29" }),
        item({ id: 2, due_on: "2026-07-29" }),
        item({ id: 3, due_on: "2026-07-30" }),
        item({ id: 4, due_on: "2026-07-30" }),
      ],
      TODAY,
    );
    expect(bannerItems(sections).map((i) => i.id)).toEqual([1, 2, 3]);
  });
});
