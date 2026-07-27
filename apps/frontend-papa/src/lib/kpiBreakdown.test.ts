import { describe, expect, it } from "vitest";
import type { ActivityEntry, ActivityHeatmapDay, ActivitySessionDay } from "@zetis/types";
import {
  activeMinutesByDay,
  completedMissions,
  consolidatedRows,
  enumerateDates,
  formatShortDate,
  openGapRows,
  sessionDurations,
  sessionsByDay,
  xpByDay,
} from "./kpiBreakdown";

// Détail des KPI : regroupement de valeurs DÉJÀ servies par le serveur. Ces tests vérifient le
// regroupement, pas des calculs métier — il n'y en a pas côté client.

function heatDay(date: string, active_minutes: number, xp: number): ActivityHeatmapDay {
  return { date, active_minutes, events: 1, xp };
}

function entry(over: Partial<ActivityEntry>): ActivityEntry {
  return { time: "10:00", event_type: "login", label: "Connexion", xp: 0, minutes: 0, ...over };
}

function sessionDay(date: string, sessions: { active: number; events?: ActivityEntry[] }[]): ActivitySessionDay {
  return {
    date,
    sessions: sessions.map((s, i) => ({
      started_at: `${date}T08:0${i}:00+00:00`,
      ended_at: `${date}T09:0${i}:00+00:00`,
      started_time: `10:0${i}`,
      ended_time: `11:0${i}`,
      active_minutes: s.active,
      events: s.events ?? [],
    })),
  };
}

describe("enumerateDates", () => {
  it("rend toutes les dates bornes incluses", () => {
    expect(enumerateDates("2026-07-13", "2026-07-16")).toEqual([
      "2026-07-13",
      "2026-07-14",
      "2026-07-15",
      "2026-07-16",
    ]);
  });

  it("franchit un changement de mois", () => {
    expect(enumerateDates("2026-06-29", "2026-07-01")).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
    ]);
  });
});

describe("formatShortDate", () => {
  it("rend un libellé compact en français", () => {
    expect(formatShortDate("2026-07-27")).toBe("lun. 27 juil.");
  });
});

describe("activeMinutesByDay", () => {
  it("réintroduit les jours vides omis par le serveur", () => {
    const rows = activeMinutesByDay(
      [heatDay("2026-07-15", 24, 30)],
      "2026-07-13",
      "2026-07-16",
    );
    expect(rows).toHaveLength(4);
    // Sans ce remplissage, un jour sans activité serait indiscernable d'un jour absent.
    expect(rows.map((r) => r.value)).toEqual([0, 0, 24, 0]);
    expect(rows[1].display).toBe("—");
    expect(rows[2].display).toBe("24 min");
  });
});

describe("xpByDay", () => {
  it("lit le XP, métrique séparée des minutes actives", () => {
    // Un jour peut porter du XP sans minute active (crédit sans écart entre événements).
    const rows = xpByDay([heatDay("2026-07-15", 0, 50)], "2026-07-15", "2026-07-15");
    expect(rows[0]).toMatchObject({ value: 50, display: "+50 XP" });
  });
});

describe("sessionsByDay", () => {
  it("compte les sessions et légende leurs bornes, du plus ancien au plus récent", () => {
    const rows = sessionsByDay([
      sessionDay("2026-07-15", [{ active: 20 }, { active: 10 }]),
      sessionDay("2026-07-13", []),
    ]);
    expect(rows.map((r) => r.key)).toEqual(["2026-07-13", "2026-07-15"]);
    expect(rows[1]).toMatchObject({ value: 2, display: "2 sessions" });
    expect(rows[1].caption).toBe("10:00→11:00 · 10:01→11:01");
    expect(rows[0]).toMatchObject({ value: 0, display: "—", caption: undefined });
  });
});

describe("sessionDurations", () => {
  it("classe les sessions de la plus longue à la plus courte", () => {
    const rows = sessionDurations([
      sessionDay("2026-07-15", [{ active: 5 }, { active: 30 }]),
      sessionDay("2026-07-14", [{ active: 12 }]),
    ]);
    expect(rows.map((r) => r.value)).toEqual([30, 12, 5]);
  });
});

describe("openGapRows", () => {
  it("formule les sévérités sans jamais parler d'échec (CLAUDE.md §pédagogie)", () => {
    const rows = openGapRows([
      {
        skill_id: 1,
        skill_name: "Fractions",
        subject_name: "Mathématiques",
        severity: "high",
        status: "in_progress",
      },
      { skill_id: 2, skill_name: "Narrateur", subject_name: "Français", severity: "low", status: "open" },
    ]);

    expect(rows[0]).toMatchObject({ label: "Fractions", display: "à travailler en priorité" });
    expect(rows[0].caption).toBe("Mathématiques · en cours");
    expect(rows[1].display).toBe("à consolider");
    // Aucun vocabulaire d'échec nulle part.
    const text = rows.map((r) => `${r.display} ${r.caption}`).join(" ").toLowerCase();
    expect(text).not.toMatch(/échec|nul|mauvais|grosse lacune/);
  });

  it("classe la barre par sévérité décroissante", () => {
    const rows = openGapRows([
      { skill_id: 1, skill_name: "A", severity: "high", status: "open" },
      { skill_id: 2, skill_name: "B", severity: "medium", status: "open" },
      { skill_id: 3, skill_name: "C", severity: "low", status: "open" },
    ]);
    expect(rows.map((r) => r.value)).toEqual([3, 2, 1]);
  });
});

describe("consolidatedRows", () => {
  it("affiche la maîtrise en pourcentage", () => {
    const rows = consolidatedRows([
      {
        skill_id: 7,
        skill_name: "Nombres relatifs",
        subject_name: "Mathématiques",
        mastery_score: 95,
      },
    ]);
    expect(rows[0]).toMatchObject({
      label: "Nombres relatifs",
      value: 95,
      display: "95 %",
      caption: "Mathématiques",
    });
  });
});

describe("completedMissions", () => {
  const names = new Map([["mathematiques", "Mathématiques"]]);

  it("ne retient que les verdicts de mission, avec matière lisible", () => {
    const rows = completedMissions(
      [
        sessionDay("2026-07-15", [
          {
            active: 20,
            events: [
              entry({ event_type: "login" }),
              entry({
                event_type: "mission_verdict",
                label: "Mission terminée",
                subject_slug: "mathematiques",
                skill_name: "Nombres relatifs",
                detail: "notion acquise",
                xp: 50,
              }),
            ],
          },
        ]),
      ],
      names,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ value: 50, display: "+50 XP" });
    expect(rows[0].caption).toBe("Mathématiques · Nombres relatifs · notion acquise");
  });

  it("rend une liste vide quand aucune mission n'a été bouclée", () => {
    const rows = completedMissions(
      [sessionDay("2026-07-15", [{ active: 5, events: [entry({})] }])],
      names,
    );
    expect(rows).toEqual([]);
  });
});
