import { describe, expect, it } from "vitest";
import { dateAbsolue, dateRelative } from "./datation";

// La datation relative (ADR-0054 §3). Module pur : il se teste sans rendre une page.

const MAINTENANT = new Date(2026, 7, 14, 10, 0, 0); // 14 août 2026, 10 h, heure LOCALE

function ilYA(jours: number, heure = 10) {
  const d = new Date(MAINTENANT);
  d.setDate(d.getDate() - jours);
  d.setHours(heure, 0, 0, 0);
  return d.toISOString();
}

describe("dateRelative", () => {
  it("compte des jours de CALENDRIER, pas des tranches de 24 h", () => {
    // 🔴 Le cas qui casse un calcul en millisecondes : hier soir 23 h, regardé ce matin 10 h.
    // L'écart réel est de 11 heures — une soustraction dirait « aujourd'hui ». C'est « hier ».
    expect(dateRelative(ilYA(1, 23), MAINTENANT)).toBe("hier");
    // Et symétriquement : ce matin 1 h est bien « aujourd'hui », pas « hier ».
    expect(dateRelative(ilYA(0, 1), MAINTENANT)).toBe("aujourd'hui");
  });

  it("dit le souvenir, jamais une dette", () => {
    expect(dateRelative(ilYA(0), MAINTENANT)).toBe("aujourd'hui");
    expect(dateRelative(ilYA(1), MAINTENANT)).toBe("hier");
    expect(dateRelative(ilYA(3), MAINTENANT)).toBe("il y a 3 jours");
    expect(dateRelative(ilYA(9), MAINTENANT)).toBe("il y a une semaine");
    expect(dateRelative(ilYA(21), MAINTENANT)).toBe("il y a 3 semaines");
    expect(dateRelative(ilYA(45), MAINTENANT)).toBe("il y a un mois");
    expect(dateRelative(ilYA(120), MAINTENANT)).toBe("il y a 4 mois");
  });

  it("cesse de compter au-delà d'un an — un grand chiffre se lirait comme un reproche", () => {
    expect(dateRelative(ilYA(400), MAINTENANT)).toBe("il y a plus d'un an");
    expect(dateRelative(ilYA(2000), MAINTENANT)).toBe("il y a plus d'un an");
  });

  it("n'écrit JAMAIS de décompte négatif quand l'horloge est en avance", () => {
    // Fuseau ou horloge décalée : « il y a -2 jours » n'a aucun sens pour un enfant.
    expect(dateRelative(ilYA(-2), MAINTENANT)).toBe("aujourd'hui");
  });

  it("rend null plutôt qu'un message d'erreur quand la date manque ou est illisible", () => {
    // La tuile affiche alors son texte habituel, sans date — jamais « Invalid Date ».
    expect(dateRelative(null, MAINTENANT)).toBeNull();
    expect(dateRelative(undefined, MAINTENANT)).toBeNull();
    expect(dateRelative("", MAINTENANT)).toBeNull();
    expect(dateRelative("pas-une-date", MAINTENANT)).toBeNull();
  });
});

describe("dateAbsolue", () => {
  it("écrit JJ/MM/AAAA, zéros compris — le format d'un classeur", () => {
    expect(dateAbsolue("2026-08-13T09:30:00Z")).toBe("13/08/2026");
    expect(dateAbsolue("2026-01-05T12:00:00Z")).toBe("05/01/2026");
  });

  it("rend null plutôt que « Invalid Date » au bas d'une feuille imprimée", () => {
    expect(dateAbsolue(null)).toBeNull();
    expect(dateAbsolue(undefined)).toBeNull();
    expect(dateAbsolue("")).toBeNull();
    expect(dateAbsolue("pas-une-date")).toBeNull();
  });

  it("est l'INVERSE de dateAbsolue — deux formes, deux lectures", () => {
    // « il y a 3 jours » ne veut plus rien dire le lendemain sur une feuille imprimée ; une date
    // absolue sur un écran d'enfant est de la métadonnée d'adulte. Aucune des deux n'est neutre.
    expect(dateRelative(ilYA(3), MAINTENANT)).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(dateAbsolue(ilYA(3))).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("n'emploie aucun mot de reproche", () => {
    for (const jours of [0, 1, 3, 9, 21, 45, 120, 400]) {
      const texte = dateRelative(ilYA(jours), MAINTENANT) ?? "";
      expect(texte).not.toMatch(/ça fait|toujours pas|plus de .* sans|abandonn|inachev|retard/i);
    }
  });
});
