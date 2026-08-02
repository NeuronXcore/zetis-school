import { describe, expect, it } from "vitest";

import { TYPE_META } from "./MissionsPage";

describe("MissionsPage — pastilles de type", () => {
  it("test-verrou : aucune pastille ne nomme un auteur", () => {
    // Deux signatures d'auteur vivaient sur cette page, et la seconde a survécu au premier
    // correctif parce qu'elle ne venait pas d'`origin` :
    //   - le champ `MissionStudentOut.origin` → « 👤 par Papa » / « 🤖 par ZETIS » ;
    //   - le libellé de `mission_type: "manual"` → « Mission de Papa », mandaté par la spec.
    //
    // Le motif du retrait est la TENUE DANS LE TEMPS, pas l'esthétique : le contenu scolaire doit
    // atteindre Massimo dans la voix de ZETIS quel que soit son producteur réel, sinon il faudra
    // changer l'auteur de son monde le jour où ZETIS produira seul (palier 3).
    //
    // « ZETIS » n'est PAS interdit ailleurs dans l'app : ZETIS n'est pas un auteur caché, c'est
    // la voix. Ce qui est interdit, c'est de désigner QUI a produit le contenu.
    const labels = Object.values(TYPE_META).map((m) => m.label);
    for (const label of labels) {
      expect(label).not.toMatch(/papa/i);
      expect(label).not.toMatch(/\bpar\b/i);
    }
  });

  it("les cinq libellés disent ce que Massimo fait", () => {
    expect(Object.values(TYPE_META).map((m) => m.label)).toEqual([
      "Renforcer",
      "Réviser",
      "Découvrir",
      "Sur mesure",
      "🏆 Défi champion",
    ]);
  });
});
