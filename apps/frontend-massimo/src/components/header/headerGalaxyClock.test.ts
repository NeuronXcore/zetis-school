import { describe, expect, it } from "vitest";
import { STAR_CADENCE, revealSchedule } from "@zetis/ui/galaxy";
import {
  BIRTH_WALL_MAX,
  BIRTH_WALL_MIN,
  HEADER_TOTAL,
  headerClock,
} from "./headerGalaxyClock";

/** Une galaxie de `n` notions, chacune sous son propre chapitre, sous une matière. */
function scheduleOf(n: number) {
  const parentOf = new Map<string, string>();
  const skills: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const skill = `skill-${i}`;
    const chapter = `chapter-${i % 40}`;
    const subject = `subject-${i % 8}`;
    parentOf.set(skill, chapter);
    parentOf.set(chapter, subject);
    parentOf.set(subject, "root");
    skills.push(skill);
  }
  return revealSchedule(skills, parentOf);
}

describe("headerGalaxyClock — comprimer le rang dans un temps de mur borné", () => {
  it("🔒 la construction ne dépasse JAMAIS HEADER_TOTAL, quel que soit N", () => {
    // Le cœur du problème : à `STAR_CADENCE` = 120 ms, 280 notions durent 33,6 s. Dans un bandeau
    // monté sur les 21 routes, c'est impensable. Ce cas verrouille le plafond.
    for (const n of [1, 5, 37, 280, 500, 1200]) {
      expect(headerClock(scheduleOf(n)).total, `${n} notions`).toBeLessThanOrEqual(HEADER_TOTAL);
    }
  });

  it("🔒 TOUTES les notions naissent — la compression ne coupe personne", () => {
    // ⚠️ TEST-VERROU ANTI-PLAFOND, jumeau de celui de `headerBandLayout`. L'addendum ADR-0024 §1
    // interdit de cacher la progression de l'enfant : « Jamais un plafond de nœuds déguisé ». Une
    // notion dont la naissance tomberait après `total` serait exactement ça — invisible, sans que
    // rien ne le dise.
    const schedule = scheduleOf(500);
    const clock = headerClock(schedule);

    expect(clock.bornAtWall.size).toBe(schedule.at.size);
    for (const [id, born] of clock.bornAtWall) {
      expect(born, id).toBeLessThanOrEqual(clock.total);
      expect(Number.isFinite(born), id).toBe(true);
    }
  });

  it("🔒 c'est la TRAÎNÉE qui se resserre quand la densité monte, jamais le nombre d'étoiles", () => {
    // La transposition littérale du « budget de particules » de l'addendum ADR-0024 §2 :
    // « si un appareil décroche, ce sont les PARTICULES qui tombent, jamais les étoiles ».
    const petite = headerClock(scheduleOf(20));
    const grande = headerClock(scheduleOf(500));

    expect(grande.birthWall).toBeLessThan(petite.birthWall);
    expect(grande.birthWall).toBeGreaterThanOrEqual(BIRTH_WALL_MIN);
    expect(grande.bornAtWall.size).toBeGreaterThan(petite.bornAtWall.size);
  });

  it("🔒 une petite galaxie n'est PAS étirée — on comprime, on n'étire pas", () => {
    // Étirer les trois notions d'un débutant sur 3,2 s le ferait attendre pour rien. Sous le
    // plafond, l'horloge de rang garde sa cadence naturelle, à l'identique.
    const clock = headerClock(scheduleOf(5));

    expect(clock.bornAtWall.get("skill-4")).toBeCloseTo(4 * STAR_CADENCE, 5);
    expect(clock.birthWall).toBe(BIRTH_WALL_MAX);
  });

  it("🔒 l'ordre des naissances est préservé par la compression", () => {
    // Une compression qui réordonnerait raconterait une autre histoire que celle de Massimo.
    const clock = headerClock(scheduleOf(120));
    let previous = -1;
    for (let i = 0; i < 120; i += 1) {
      const born = clock.bornAtWall.get(`skill-${i}`) as number;
      expect(born).toBeGreaterThanOrEqual(previous);
      previous = born;
    }
  });

  it("🔒 les ancêtres naissent AVANT leur première notion", () => {
    // Propriété héritée de `revealSchedule` : une matière naît avec sa première notion, pas après.
    // La compression est linéaire, donc elle la conserve — ce cas l'atteste.
    const clock = headerClock(scheduleOf(40));

    expect(clock.bornAtWall.get("subject-0") as number).toBeLessThanOrEqual(
      clock.bornAtWall.get("skill-0") as number,
    );
    expect(clock.bornAtWall.get("chapter-0") as number).toBeLessThanOrEqual(
      clock.bornAtWall.get("skill-0") as number,
    );
  });

  describe("dégénérescences", () => {
    it("galaxie vide — Massimo tout neuf, ce n'est pas une erreur", () => {
      const clock = headerClock(revealSchedule([], new Map()));

      expect(clock.bornAtWall.get("root")).toBe(0);
      expect(Number.isFinite(clock.total)).toBe(true);
      expect(clock.total).toBeLessThanOrEqual(HEADER_TOTAL);
    });

    it("une seule notion", () => {
      const clock = headerClock(scheduleOf(1));

      expect(Number.isFinite(clock.birthWall)).toBe(true);
      expect(clock.total).toBeGreaterThan(0);
      expect(clock.total).toBeLessThanOrEqual(HEADER_TOTAL);
    });
  });
});
