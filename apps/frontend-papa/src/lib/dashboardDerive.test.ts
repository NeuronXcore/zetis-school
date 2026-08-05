import { describe, expect, it } from "vitest";
import type { DashboardSubject } from "@zetis/types";
import {
  COUNCIL_PERIOD_LABEL,
  isDashboardPeriod,
  matchesFocus,
  notAddressed,
  sumCalendar,
  sumMinutes,
  sumNotions,
  sumReviewLoad,
  sumSeries,
  sumSlots,
} from "./dashboardDerive";

// Dérivations client du dashboard — l'enjeu de ces tests est la FRONTIÈRE (ADR-0028 §3) :
// ces fonctions somment et empilent, elles ne décident d'aucun statut pédagogique. Elles sont
// aussi ce qui permet à « Toutes matières » d'exister sans que le serveur pré-agrège, donc au
// filtrage de ne coûter aucune requête.

function subject(overrides: Partial<DashboardSubject> = {}): DashboardSubject {
  return {
    id: 1,
    slug: "maths",
    name: "Mathématiques",
    color: null,
    minutes: { "7": 10, "30": 20, "90": 30, "365": 40 },
    calendar: [],
    slots: {
      "7": Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0)),
      "30": Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0)),
      "90": Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0)),
      "365": Array.from({ length: 8 }, () => Array.from({ length: 7 }, () => 0)),
    },
    slots_outside_minutes: { "7": 0, "30": 0, "90": 0, "365": 0 },
    notions: { consolidated: 1, fragile: 2, in_progress: 3, total: 10 },
    series: {
      "7": { covered: [1, 2], consolidated: [0, 1], fragile: [1, 1] },
      "30": { covered: [1, 2], consolidated: [0, 1], fragile: [1, 1] },
      "90": { covered: [1, 2], consolidated: [0, 1], fragile: [1, 1] },
      "365": { covered: [1, 2], consolidated: [0, 1], fragile: [1, 1] },
    },
    review_load: Array.from({ length: 14 }, () => 1),
    gaps_open: 0,
    has_referentiel: true,
    ...overrides,
  };
}

describe("« Toutes matières » est une somme client", () => {
  it("additionne les minutes de la fenêtre", () => {
    expect(sumMinutes([subject(), subject({ slug: "svt" })], "30")).toBe(40);
  });

  it("fusionne les calendriers par date, jours vides restant omis", () => {
    const a = subject({ calendar: [{ date: "2026-07-28", active_minutes: 10 }] });
    const b = subject({
      slug: "svt",
      calendar: [
        { date: "2026-07-28", active_minutes: 5 },
        { date: "2026-07-29", active_minutes: 7 },
      ],
    });

    expect(sumCalendar([a, b])).toEqual([
      { date: "2026-07-28", active_minutes: 15, events: 0, xp: 0 },
      { date: "2026-07-29", active_minutes: 7, events: 0, xp: 0 },
    ]);
  });

  it("somme les créneaux case à case en gardant la forme 8 × 7", () => {
    const a = subject();
    a.slots["7"][3][2] = 20;
    const b = subject({ slug: "svt" });
    b.slots["7"][3][2] = 5;

    const matrix = sumSlots([a, b], "7");

    expect(matrix).toHaveLength(8);
    expect(matrix[0]).toHaveLength(7);
    expect(matrix[3][2]).toBe(25);
  });

  it("somme les trois courbes point à point", () => {
    expect(sumSeries([subject(), subject({ slug: "svt" })], "7")).toEqual({
      covered: [2, 4],
      consolidated: [0, 2],
      fragile: [2, 2],
    });
  });

  it("somme la charge de révision sur 14 jours", () => {
    const load = sumReviewLoad([subject(), subject({ slug: "svt" })]);
    expect(load).toHaveLength(14);
    expect(load.every((n) => n === 2)).toBe(true);
  });

  it("empile les compteurs de notions sans en recalculer aucun", () => {
    expect(sumNotions([subject(), subject({ slug: "svt" })])).toEqual({
      consolidated: 2,
      fragile: 4,
      in_progress: 6,
      total: 20,
    });
  });
});

describe("notAddressed", () => {
  it("est le reste du programme, pas un statut", () => {
    expect(notAddressed({ consolidated: 1, fragile: 2, in_progress: 3, total: 10 })).toBe(4);
  });

  it("ne descend jamais sous zéro même si les compteurs dépassent le total", () => {
    expect(notAddressed({ consolidated: 9, fragile: 9, in_progress: 9, total: 10 })).toBe(0);
  });
});

describe("focus KPI → cartes", () => {
  it("sans focus, toutes les cartes restent en pleine intensité", () => {
    expect(matchesFocus("chaine", null)).toBe(true);
    expect(matchesFocus("heatmap", null)).toBe(true);
  });

  it("applique la table de correspondance de l'ADR §5", () => {
    // Temps actif → heatmap, répartition, où agir. PAS la chaîne de contenus.
    expect(matchesFocus("heatmap", "active_minutes")).toBe(true);
    expect(matchesFocus("repartition", "active_minutes")).toBe(true);
    expect(matchesFocus("ou-agir", "active_minutes")).toBe(true);
    expect(matchesFocus("chaine", "active_minutes")).toBe(false);

    // Lacunes → état des notions, où agir, chaîne, lecture. PAS la répartition du temps.
    expect(matchesFocus("notions", "open_gaps")).toBe(true);
    expect(matchesFocus("lecture", "open_gaps")).toBe(true);
    expect(matchesFocus("repartition", "open_gaps")).toBe(false);
  });

  it("une carte inconnue ne correspond à aucun focus plutôt que de tous les accepter", () => {
    expect(matchesFocus("carte-future", "consolidated")).toBe(false);
  });
});

describe("période transmise au Conseil de classe", () => {
  it("nomme CHAQUE fenêtre du sélecteur, l'année comprise", () => {
    // Le bug du 2026-08-05 : la page Conseil portait sa propre table, typée
    // `Record<string, string>`, avec trois clés. Ajouter la fenêtre « Année » au dashboard n'a donc
    // rien pu y casser — `365` tombait dans le repli et le Conseil annonçait « Trimestre 1 »
    // pendant que Papa regardait l'année.
    //
    // La protection réelle est le TYPE (`Record<DashboardPeriod, string>`) : retirer une clé ne
    // fait pas tomber ce test, il fait tomber `tsc`. Ce test-ci verrouille l'autre moitié —
    // qu'aucune fenêtre ne reste sans libellé, et que le sélecteur et le Conseil parlent des
    // mêmes quatre.
    expect(Object.keys(COUNCIL_PERIOD_LABEL)).toEqual(["7", "30", "90", "365"]);
    expect(COUNCIL_PERIOD_LABEL["365"]).toBe("Année scolaire");
  });

  it("reconnaît les fenêtres connues et rejette le reste", () => {
    expect(isDashboardPeriod("365")).toBe(true);
    expect(isDashboardPeriod("7")).toBe(true);
    // Une valeur aberrante doit bien retomber sur le repli — c'est le bon comportement pour une
    // entrée invalide, et c'était le mauvais pour une fenêtre légitime.
    expect(isDashboardPeriod("banane")).toBe(false);
    expect(isDashboardPeriod(null)).toBe(false);
  });
});
