import { describe, expect, it } from "vitest";
import { ctaRoute, visualForCode } from "./motivationVisuals";

// Table-driven : si le backend ajoute un code, ce test le signale au lieu de laisser passer
// silencieusement une carte sans illustration.

const WELCOME_CODES = [
  "first_visit",
  "back_after_break",
  "back_short_break",
  "no_goal_yet",
  "goal_reached_today",
  "goal_reached",
  "progress_visible",
  "resume_notion",
  "reviews_due",
  "all_clear",
];

const WRAP_UP_CODES = [
  "week_goal_reached",
  "mission_in_progress",
  "reviews_left",
  "day_done",
  "all_clear",
];

describe("visualForCode", () => {
  it("couvre tous les codes servis par le backend", () => {
    for (const code of [...WELCOME_CODES, ...WRAP_UP_CODES]) {
      const visual = visualForCode(code);
      expect(visual.emoji !== "" || visual.avatar, `code sans illustration : ${code}`).toBe(true);
    }
  });

  it("réserve l'avatar aux codes relationnels", () => {
    // « ZETIS se souvient » doit avoir un visage ; féliciter n'en a pas besoin.
    expect(visualForCode("back_after_break").avatar).toBe(true);
    expect(visualForCode("resume_notion").avatar).toBe(true);
    expect(visualForCode("goal_reached").avatar).toBe(false);
  });

  it("n'accompagne JAMAIS un retour d'un signe de temps écoulé", () => {
    // Ni ⏰ ni 😴 : le retour est accueilli, jamais chronométré.
    for (const code of ["back_after_break", "back_short_break"]) {
      expect(["⏰", "😴", "💤", "⌛"]).not.toContain(visualForCode(code).emoji);
    }
  });

  it("retombe sur l'avatar pour un code inconnu, sans lever", () => {
    const visual = visualForCode("code_du_futur");
    expect(visual.avatar).toBe(true);
  });
});

describe("ctaRoute", () => {
  it("mappe chaque cible connue", () => {
    expect(ctaRoute("missions")).toBe("/missions");
    expect(ctaRoute("revision")).toBe("/revision");
    expect(ctaRoute("matieres")).toBe("/matieres");
    expect(ctaRoute("accueil")).toBe("/");
  });

  it("rend null sur une cible inconnue ou absente", () => {
    // Le bouton sera masqué : mieux vaut aucun bouton qu'un bouton mort.
    expect(ctaRoute("teleportation")).toBeNull();
    expect(ctaRoute(null)).toBeNull();
    expect(ctaRoute(undefined)).toBeNull();
  });
});
