import { describe, expect, it } from "vitest";
import type { DiagnosticApercu, DiagnosticRailEntry } from "@zetis/types";
import {
  compteFocus,
  filtrerJamaisGenere,
  filtrerRail,
  libelleFocus,
  matieresNonMesurees,
} from "./focus";

// Les focus du bandeau instrument (adr-0045).
//
// 🔴 **LE DÉCOR EST LE TEST.** Le défaut d'origine — la jauge annonce « 5 jamais mesurées » quand
// `matieres_total − matieres_mesurees` en donne 6 — n'existe QUE s'il y a une matière **générée et
// jamais passée**. Un décor à deux familles (mesurée / jamais générée) rend l'addition juste par
// accident, et un verrou posé dessus ne distingue rien : c'est exactement le décor dégénéré du
// fichier de page, où `2 − 1 = 1` et `jamais_generees = 1` tombent d'accord par hasard.
//
// D'où ANGLAIS ci-dessous, la matière du milieu, qui n'appartient à aucun des deux compteurs.

function ligne(partiel: Partial<DiagnosticRailEntry>): DiagnosticRailEntry {
  return {
    cle: "x",
    cran: "propose",
    quiz_id: 1,
    attempt_id: null,
    subject_id: 7,
    subject: "Anglais",
    subject_slug: "anglais",
    date: "2026-08-05T09:00:00Z",
    notions_count: 8,
    score_percent: null,
    rang: null,
    ...partiel,
  };
}

/** Trois matières, TROIS familles — le seul décor où le défaut d'origine est visible.
 *
 *  | matière      | quiz ? | tentative ? | compte dans            |
 *  |--------------|--------|-------------|------------------------|
 *  | Mathématiques| oui    | **oui**     | `matieres_mesurees` (1)|
 *  | Anglais      | oui    | non         | **aucun des deux**     |
 *  | Français     | non    | non         | `jamais_generees` (1)  |
 *
 *  `matieres_total − matieres_mesurees = 3 − 1 = 2`, quand `jamais_generees = 1`. L'écart, c'est
 *  Anglais. */
const APERCU: DiagnosticApercu = {
  subjects: [
    { id: 3, name: "Mathématiques", slug: "mathematiques", a_un_diagnostic: true },
    { id: 7, name: "Anglais", slug: "anglais", a_un_diagnostic: true },
    { id: 5, name: "Français", slug: "francais", a_un_diagnostic: false },
  ],
  jauges: {
    matieres_mesurees: 1,
    matieres_total: 3,
    a_relire: 1,
    proposes_non_passes: 1,
    jamais_generees: 1,
    plus_ancienne_lecture: { subject: "Mathématiques", date: "2026-05-19T10:00:00Z", jours: 81 },
    lacunes_ouvertes: 2,
    lacunes_sans_contenu: 1,
    lots_declenches: 0,
  },
  rail: [
    ligne({ cle: "attempt-4", cran: "passe", subject_id: 3, subject: "Mathématiques", attempt_id: 4, score_percent: 70, rang: 1 }),
    ligne({ cle: "quiz-9", cran: "genere", subject_id: 3, subject: "Mathématiques", quiz_id: 9 }),
    ligne({ cle: "quiz-11", cran: "propose", subject_id: 7, subject: "Anglais", quiz_id: 11 }),
  ],
  jamais_genere: [{ id: 5, name: "Français", slug: "francais" }],
};

describe("matieresNonMesurees", () => {
  // ==================================================================================================
  // 🔴 VERROU CENTRAL DE LA SESSION A — la matière du milieu
  // ==================================================================================================
  it("🔴 contient une matière qui a un diagnostic PROPOSÉ mais aucune tentative", () => {
    const nonMesurees = matieresNonMesurees(APERCU);

    // Anglais a un quiz — elle n'est donc PAS « jamais générée ». Elle n'a aucune tentative — elle
    // n'est donc PAS mesurée. Un focus qui l'oublierait redirait la pastille voisine, et
    // l'addition `3 − 1` ne retomberait toujours pas sur ce que la page montre.
    expect(nonMesurees.has(7)).toBe(true);
    expect(nonMesurees.has(5)).toBe(true);
    expect(nonMesurees.has(3)).toBe(false);
  });

  it("retombe exactement sur `matieres_total − matieres_mesurees`", () => {
    // C'est LA propriété que le lecteur vérifie à l'œil : il soustrait, puis il compte ce que le
    // focus affiche. Les deux doivent tomber d'accord, sans quoi la Décision 7 n'a corrigé qu'un mot.
    expect(matieresNonMesurees(APERCU).size).toBe(
      APERCU.jauges.matieres_total - APERCU.jauges.matieres_mesurees,
    );
  });

  it("ne se fie PAS à `jamais_generees`, qui compte une autre population", () => {
    expect(matieresNonMesurees(APERCU).size).toBeGreaterThan(APERCU.jauges.jamais_generees);
  });
});

describe("filtrerRail", () => {
  const nonMesurees = matieresNonMesurees(APERCU);

  it("sans focus, ne retire rien", () => {
    expect(filtrerRail(APERCU.rail, null, nonMesurees)).toHaveLength(3);
  });

  it("`proposes` ne garde que le cran proposé", () => {
    const gardees = filtrerRail(APERCU.rail, "proposes", nonMesurees);
    expect(gardees.map((e) => e.cle)).toEqual(["quiz-11"]);
  });

  it("`a-relire` ne garde que le cran généré", () => {
    const gardees = filtrerRail(APERCU.rail, "a-relire", nonMesurees);
    expect(gardees.map((e) => e.cle)).toEqual(["quiz-9"]);
  });

  it("`non-mesurees` garde la ligne d'Anglais et écarte celles de Mathématiques", () => {
    // Y COMPRIS la ligne « généré » de Mathématiques : la matière est mesurée, donc ZETIS sait
    // quelque chose d'elle — le focus porte sur la MATIÈRE, pas sur le cran de la ligne.
    const gardees = filtrerRail(APERCU.rail, "non-mesurees", nonMesurees);
    expect(gardees.map((e) => e.cle)).toEqual(["quiz-11"]);
  });

  it("`jamais-generees` ne garde aucune ligne — sa population est sous le rail", () => {
    expect(filtrerRail(APERCU.rail, "jamais-generees", nonMesurees)).toHaveLength(0);
  });
});

describe("filtrerJamaisGenere", () => {
  it("🔴 subit la pastille de matière — le bloc fait partie du rail, pas d'un encart à part", () => {
    // Le défaut corrigé : la page passait `jamais_genere` BRUT là où le rail était filtré, donc
    // filtrer sur une matière laissait apparaître toutes les autres.
    expect(filtrerJamaisGenere(APERCU.jamais_genere, null, 5)).toHaveLength(1);
    expect(filtrerJamaisGenere(APERCU.jamais_genere, null, 3)).toHaveLength(0);
  });

  it("les focus de cran l'excluent en bloc — une matière sans quiz n'a rien à relire ni à proposer", () => {
    expect(filtrerJamaisGenere(APERCU.jamais_genere, "proposes", null)).toHaveLength(0);
    expect(filtrerJamaisGenere(APERCU.jamais_genere, "a-relire", null)).toHaveLength(0);
  });

  it("les deux focus de matière le gardent — il EST leur population", () => {
    expect(filtrerJamaisGenere(APERCU.jamais_genere, "jamais-generees", null)).toHaveLength(1);
    expect(filtrerJamaisGenere(APERCU.jamais_genere, "non-mesurees", null)).toHaveLength(1);
  });
});

describe("libelleFocus et compteFocus", () => {
  it("🔴 `non-mesurees` compte des MATIÈRES, pas des lignes de rail", () => {
    const nonMesurees = matieresNonMesurees(APERCU);
    const rail = filtrerRail(APERCU.rail, "non-mesurees", nonMesurees);
    const bloc = filtrerJamaisGenere(APERCU.jamais_genere, "non-mesurees", null);

    // 1 ligne de rail (Anglais) + 1 matière jamais générée (Français) = 2 MATIÈRES. Et 2 est bien
    // `3 − 1`. C'est ce nombre-là que le bandeau annonce, et il vient de ce qui est AFFICHÉ.
    expect(compteFocus("non-mesurees", rail, bloc)).toBe(2);
    expect(libelleFocus("non-mesurees", 2)).toBe("2 matières dont ZETIS ne sait rien");
  });

  it("`proposes` compte des DIAGNOSTICS — une matière peut en porter plusieurs", () => {
    const deuxSurLaMemeMatiere = [
      ligne({ cle: "quiz-11", quiz_id: 11 }),
      ligne({ cle: "quiz-12", quiz_id: 12 }),
    ];
    expect(compteFocus("proposes", deuxSurLaMemeMatiere, [])).toBe(2);
  });

  it("accorde le singulier", () => {
    expect(libelleFocus("jamais-generees", 1)).toBe("1 matière jamais générée");
    expect(libelleFocus("proposes", 1)).toBe("1 diagnostic en attente chez Massimo");
  });
});
