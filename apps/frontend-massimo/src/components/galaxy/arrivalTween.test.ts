import { describe, expect, it } from "vitest";
import {
  CORE_IN,
  ORBIT_DRAW,
  PLANET_STAGGER,
  PLANET_TRAVEL,
  arrivalDuration,
  coreOpacity,
  easeOutCubic,
  planetBirth,
  planetIsBorn,
  planetPosition,
  planetProgress,
  ringOpacity,
} from "@zetis/ui/galaxy";

// Chorégraphie d'arrivée de `/galaxy` (addendum ADR-0024 §3).
//
// On teste le RYTHME et les INTERDITS, pas le rendu : la disposition finale se vérifie à
// l'œil, mais « l'orbite ne se trace jamais avant sa planète » est une règle, et une règle
// se verrouille.

const SLOT = { x: 300, y: 12, z: -40 };

describe("le cerveau apparaît seul, avant tout le monde", () => {
  it("il est déjà là quand la première matière naît", () => {
    expect(coreOpacity(0)).toBe(0);
    expect(coreOpacity(CORE_IN)).toBe(1);
    // Aucune matière n'a bougé tant que le cœur n'est pas entièrement là.
    expect(planetProgress(CORE_IN, 0)).toBe(0);
  });
});

describe("les matières naissent l'une après l'autre, au centre", () => {
  it("chaque rang part après le précédent", () => {
    expect(planetBirth(1) - planetBirth(0)).toBe(PLANET_STAGGER);
    expect(planetBirth(3) - planetBirth(2)).toBe(PLANET_STAGGER);
  });

  it("une matière pas encore née est AU CENTRE et invisible", () => {
    const before = planetBirth(2) - 1;
    expect(planetIsBorn(before, 2)).toBe(false);
    // `toBeCloseTo` et non `toEqual` : un créneau à coordonnée négative multiplié par zéro
    // donne `-0`, que `toEqual` distingue de `0`. C'est le même point dans l'espace.
    const at = planetPosition(before, 2, SLOT);
    expect(at.x).toBeCloseTo(0, 10);
    expect(at.y).toBeCloseTo(0, 10);
    expect(at.z).toBeCloseTo(0, 10);
  });

  it("elle rejoint EXACTEMENT son créneau, et s'y arrête", () => {
    const arrival = planetBirth(2) + PLANET_TRAVEL;
    expect(planetPosition(arrival, 2, SLOT)).toEqual(SLOT);
    // Bien après, elle n'a pas dépassé : le tween ne dépasse jamais sa cible.
    expect(planetPosition(arrival + 5_000, 2, SLOT)).toEqual(SLOT);
  });

  it("le trajet est monotone — une planète n'hésite pas en chemin", () => {
    let previous = -1;
    for (let t = 0; t <= planetBirth(0) + PLANET_TRAVEL; t += 20) {
      const progress = planetProgress(t, 0);
      expect(progress).toBeGreaterThanOrEqual(previous);
      previous = progress;
    }
    expect(previous).toBe(1);
  });

  it("`easeOutCubic` part franchement et arrive posé", () => {
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    // À mi-parcours, plus de la moitié du chemin est déjà faite : c'est un « out ».
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });
});

describe("l'orbite se trace DERRIÈRE sa planète, jamais avant", () => {
  // Interdit explicite du §4. Testé sur tout l'intervalle et pas seulement aux bornes :
  // c'est l'invariant qu'un « lissage » bien intentionné casserait sans le voir.
  it("elle reste invisible tant que sa planète n'est pas arrivée", () => {
    const arrival = planetBirth(1) + PLANET_TRAVEL;
    for (let t = 0; t <= arrival; t += 10) {
      expect(ringOpacity(t, 1, 0.16)).toBe(0);
    }
  });

  it("elle monte ensuite jusqu'à son opacité pleine, sans la dépasser", () => {
    const arrival = planetBirth(1) + PLANET_TRAVEL;
    expect(ringOpacity(arrival + ORBIT_DRAW / 2, 1, 0.16)).toBeCloseTo(0.08, 5);
    expect(ringOpacity(arrival + ORBIT_DRAW, 1, 0.16)).toBeCloseTo(0.16, 5);
    expect(ringOpacity(arrival + 10_000, 1, 0.16)).toBeCloseTo(0.16, 5);
  });
});

describe("durée totale", () => {
  it("couvre la dernière planète ET le tracé de son orbite", () => {
    // Sans le `+ ORBIT_DRAW`, l'animation s'arrêterait pendant que le dernier anneau se
    // dessine, et il resterait à mi-opacité.
    expect(arrivalDuration(8)).toBe(
      CORE_IN + 7 * PLANET_STAGGER + PLANET_TRAVEL + ORBIT_DRAW,
    );
  });

  it("une galaxie sans matière ne fait pas planter la chorégraphie", () => {
    expect(arrivalDuration(0)).toBe(CORE_IN);
  });

  it("reste courte — c'est une entrée en matière, pas un générique", () => {
    // L'addendum annonce ≈ 1,3 s pour huit matières. On se garde de la dérive.
    expect(arrivalDuration(8)).toBeLessThan(2_500);
  });
});
