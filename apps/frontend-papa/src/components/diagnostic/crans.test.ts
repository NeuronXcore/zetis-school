import { describe, expect, it } from "vitest";
import { CRAN_TEXTE, RETRAIT } from "./crans";

// Le vocabulaire des crans (adr-0045, Décisions 5 et 6). Verrous de DOCTRINE : ils ne portent pas
// sur un rendu, ils portent sur ce que le produit s'autorise à écrire.

describe("CRAN_TEXTE", () => {
  it("🔴 les deux crans non passés nomment des acteurs OPPOSÉS", () => {
    // Le défaut d'origine : deux paires de deux mots, même casse, même gris, pour des acteurs
    // contraires. Rien ne disait chez qui la balle se trouvait.
    expect(CRAN_TEXTE.genere.acteur).toBe("chez toi");
    expect(CRAN_TEXTE.propose.acteur).toBe("chez Massimo");
    expect(CRAN_TEXTE.genere.acteur).not.toBe(CRAN_TEXTE.propose.acteur);
  });

  it("🔴 leurs tons diffèrent — mais la couleur ne remplace pas le mot", () => {
    expect(CRAN_TEXTE.genere.ton).not.toBe(CRAN_TEXTE.propose.ton);
    // Le mot existe indépendamment du ton : couper la couleur ne perd aucune information.
    expect(CRAN_TEXTE.genere.acteur.length).toBeGreaterThan(0);
    expect(CRAN_TEXTE.propose.acteur.length).toBeGreaterThan(0);
  });

  it("le 3ᵉ cran ne nomme personne — plus personne n'attend", () => {
    expect(CRAN_TEXTE.passe.acteur).toBe("");
    expect(CRAN_TEXTE.passe.etat).toBe("");
  });

  it("🔴 aucun libellé de cran ne compte de jours, sous aucune forme", () => {
    // Un décompte de non-fait ne décroît que par le travail et grossit pendant une absence
    // (`CLAUDE.md` §gamification, « NOUVEAU jamais DÛ »). La DATE est déjà affichée ailleurs :
    // elle dit le même fait sans le transformer en dette.
    for (const texte of Object.values(CRAN_TEXTE)) {
      expect(`${texte.acteur} ${texte.etat}`).not.toMatch(/jour|semaine|depuis|\d/i);
    }
  });
});

describe("RETRAIT", () => {
  it("les deux gestes ne se nomment pas pareil", () => {
    // Refuser un lot qui n'est jamais sorti n'est pas retirer ce qu'un enfant a déjà sous les yeux.
    expect(RETRAIT.genere.bouton).toBe("Refuser ce lot");
    expect(RETRAIT.propose.bouton).toBe("Retirer la proposition");
  });

  it("🔴 aucune formulation ne désigne un manquement de Massimo", () => {
    // Le refus va au LOT, jamais à l'enfant. Ce verrou existe pour qu'une prochaine session ne
    // « clarifie » pas le dialogue en « il ne l'a pas fait ».
    for (const geste of Object.values(RETRAIT)) {
      const tout = `${geste.titre} ${geste.corps}`;
      expect(tout).not.toMatch(/n'a pas fait|pas fait|oubli|néglig|retard|paresse|refus[ée] de/i);
    }
  });

  it("les deux disent que rien n'est effacé", () => {
    // `adr-0014` Décision 3 : un refus n'efface rien — les questions et les tentatives restent.
    expect(RETRAIT.genere.corps).toMatch(/rien n'est effacé/i);
    expect(RETRAIT.propose.corps).toMatch(/rien n'est effacé/i);
  });
});

// 🔴 **Le bloc `actionPrincipale` a été RETIRÉ avec la fonction (adr-0051 D1 bis).**
//
// Ses trois cas ne meurent pas de la même mort, et c'est ce qui a fait s'arrêter la session :
//
// - « le cran généré ouvre la file de relecture » et son pendant de rendu dans
//   `DiagnosticsPapaPage.test.tsx` verrouillaient un comportement que l'ADR **périme** : le lien
//   renvoyait vers la page qui renvoie ici. Ils changent d'objet — ils vérifient désormais que le
//   questionnaire est là où était le lien ;
// - « un diagnostic passé n'a pas d'action de cran » disparaît sans reste : la fonction n'existe
//   plus ;
// - 🔴 **« le cran proposé n'en a pas » NE DISPARAÎT PAS.** Il figeait une DÉCISION — « Voir la
//   page de Massimo → » est impossible tant que les routes de Massimo répondent 403 à un rôle
//   parent — et son commentaire disait explicitement que sa chute devait signaler une réouverture.
//   Le supprimer par effet de bord aurait été une régression masquée. **Il a changé de support** :
//   il vit dans `PanneauPassation.test.tsx`, sur le rendu du panneau.
