import { describe, expect, it } from "vitest";

import { depuis } from "./depuis";

// ⚠️ **`maintenant` est injecté partout.** Un seul test qui lirait l'horloge réelle suffirait à
// rendre ce fichier dépendant de l'heure à laquelle on le lance — ce dépôt porte déjà deux tests
// du dashboard qui se relaient au rouge autour de minuit pour exactement cette raison.

const T0 = Date.parse("2026-08-07T12:00:00Z");
const ilYA = (secondes: number) => depuis(new Date(T0 - secondes * 1000).toISOString(), T0);

describe("depuis — depuis combien de temps, en mots de Papa", () => {
  it("rend la chaîne VIDE quand l'instant est inconnu", () => {
    // Un travail en file n'a pas démarré : il n'a pas d'ancienneté, et il ne faut pas lui en
    // inventer une. La chaîne vide se compose sans laisser de séparateur orphelin.
    expect(depuis(null)).toBe("");
    expect(depuis(undefined)).toBe("");
    expect(depuis("pas une date")).toBe("");
  });

  it("les secondes, puis les minutes, puis les heures", () => {
    expect(ilYA(3)).toBe("il y a 3 s");
    expect(ilYA(59)).toBe("il y a 59 s");
    expect(ilYA(60)).toBe("il y a 1 min");
    expect(ilYA(4 * 60 + 30)).toBe("il y a 4 min");
    expect(ilYA(59 * 60)).toBe("il y a 59 min");
    expect(ilYA(3600)).toBe("il y a 1 h");
  });

  it("⚠️ le zéro de tête sur les minutes d'une heure", () => {
    // Sans lui, « il y a 1 h 5 » se lit comme « une heure et demie ». Le lot le plus long mesuré
    // dure 36 min, mais un lot de chapitre entier peut largement dépasser l'heure.
    expect(ilYA(3600 + 5 * 60)).toBe("il y a 1 h 05");
    expect(ilYA(3600 + 12 * 60)).toBe("il y a 1 h 12");
    expect(ilYA(2 * 3600 + 59 * 60)).toBe("il y a 2 h 59");
  });

  it("au-delà du jour : jours, semaines, mois, ans", () => {
    // ⚠️ Ces paliers sont nés pour la vérification d'une sauvegarde : « il y a 2952 h » était
    // juste et illisible. Aucun n'est un SEUIL — ils changent le mot, jamais le sens.
    const J = 24 * 3600;
    expect(ilYA(23 * 3600 + 59 * 60)).toBe("il y a 23 h 59"); // la frontière, côté heures
    expect(ilYA(J)).toBe("il y a 1 j"); // …et côté jours
    expect(ilYA(6 * J)).toBe("il y a 6 j");
    expect(ilYA(7 * J)).toBe("il y a 1 sem.");
    expect(ilYA(59 * J)).toBe("il y a 8 sem.");
    expect(ilYA(60 * J)).toBe("il y a 2 mois");
    expect(ilYA(120 * J)).toBe("il y a 4 mois"); // le cas qui a motivé tout ça
    expect(ilYA(364 * J)).toBe("il y a 12 mois");
    expect(ilYA(365 * J)).toBe("il y a 1 an"); // ⚠️ « an », pas « ans »
    expect(ilYA(800 * J)).toBe("il y a 2 ans");
  });

  it("🔒 aucune sortie ne rend un nombre d'heures à trois chiffres", () => {
    // La contre-épreuve du défaut d'origine : c'est « il y a 2952 h » qu'on répare, et rien
    // n'autorise à le faire revenir sous une autre forme.
    for (const jours of [1, 3, 10, 45, 90, 200, 400, 1500]) {
      expect(ilYA(jours * 24 * 3600)).not.toMatch(/\d{3,} h/);
    }
  });

  it("🔒 une horloge client en avance ne rend JAMAIS une durée négative", () => {
    // Le `started_at` vient du SERVEUR ; l'horloge du navigateur peut être en avance de quelques
    // secondes. « il y a -3 s » se lirait comme un bug, pas comme un décalage.
    expect(depuis(new Date(T0 + 3000).toISOString(), T0)).toBe("à l'instant");
    expect(depuis(new Date(T0).toISOString(), T0)).toBe("à l'instant");
  });
});
