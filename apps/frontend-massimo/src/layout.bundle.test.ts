import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filesImportingThree, isForbidden, reachable, triggeringFiles } from "./test/bundleGraph";

// BUDGET DE BUNDLE DU CHROME DE L'APP (addendum ADR-0024 §B, étendu au layout).
//
// ⚠️ TROU TROUVÉ LE 2026-08-04, ET C'EST LA RAISON D'ÊTRE DE CETTE SUITE.
//
// `accueil.bundle.test.ts` part de `pages/AccueilMassimoPage.tsx`, `matiere.bundle.test.ts` de
// `pages/MatiereDetailPage.tsx`. Les deux mesurent le budget d'une PAGE. Or `reachable()` ne suit
// que les imports depuis son entrée : `MassimoLayout.tsx` et `MassimoBannerHeader.tsx` ne sont
// dans AUCUN des deux graphes. Un `import` du moteur 3D dans le header aurait donc passé les deux
// suites AU VERT — tout en chargeant 1,37 Mo (368 Ko gzip) sur les 21 routes protégées, y compris
// `/subjects/:slug`, dont le budget est écrit ZÉRO.
//
// Le chrome est une unité de sens distincte d'une page : il est payé PARTOUT, une fois, avant
// tout le reste. Son budget est donc le plus contraignant du dépôt — la règle de la page matière
// (zéro, sans liste blanche), pour une raison plus forte encore : il n'y a rien à monter dans un
// bandeau de 96 px.
//
// Trois suites, un moteur partagé : c'est la doctrine posée par `bundleGraph.ts` — « un test
// paramétré aurait aplati cette asymétrie, qui est précisément la doctrine ».

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, "layouts/MassimoLayout.tsx");

describe("budget de bundle — le chrome (MassimoLayout, payé sur les 21 routes)", () => {
  const { files, bare } = reachable(ENTRY);

  it("le graphe d'imports est bien analysé (garde-fou du test lui-même)", () => {
    // Sans ce cas, une erreur de résolution rendrait tout le reste vert pour de mauvaises
    // raisons : un graphe vide ne contient jamais Three.js.
    expect(files.size).toBeGreaterThan(10);
    // Et le graphe atteint VRAIMENT le header ET son décor — c'est là qu'est la surface
    // surveillée. Le layout seul ne prouverait rien : ce qui pourrait coûter cher vit dans le
    // bandeau, et c'est précisément `HeaderGalaxy` qui a été écrit sans Three.js pour ça.
    expect([...files].some((f) => f.endsWith("MassimoBannerHeader.tsx"))).toBe(true);
    expect([...files].some((f) => f.endsWith("HeaderGalaxy.tsx"))).toBe(true);
  });

  it("n'importe le moteur 3D par AUCUN chemin synchrone", () => {
    expect([...bare].filter(isForbidden)).toEqual([]);
  });

  it("ne le DÉCLENCHE par aucun `import()` non plus — budget ZÉRO, pas de liste blanche", () => {
    // ⚠️ Leçon du 2026-07-28, qui vaut ici plus qu'ailleurs : ce qui coûtait n'était pas un import
    // statique, c'était le MONTAGE d'un composant déjà code-splitté. Un `lazy()` dans le header
    // ne serait pas une atténuation — il ferait télécharger le chunk sur CHAQUE page.
    expect(triggeringFiles(files)).toEqual([]);
  });

  it("n'atteint aucun fichier qui importe `three` (filet transitif)", () => {
    // `brainGeometry.ts` importe `three` sans être exporté par le baril `@zetis/ui/galaxy` —
    // c'est la fuite la plus probable si quelqu'un l'importe un jour depuis le chrome.
    expect(filesImportingThree(files)).toEqual([]);
  });
});
