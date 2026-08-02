import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Moteur d'analyse extrait le 2026-08-01 (la page matière en a besoin avec une règle plus
// dure). Aucun cas de cette suite n'a changé : son vert prouve que l'extraction est neutre.
import {
  dynamicImports,
  filesImportingThree,
  isForbidden,
  reachable,
  staticImports,
  triggeringFiles,
} from "./test/bundleGraph";

// BUDGET DE BUNDLE DE LA PAGE D'ENTRÉE (addendum ADR-0024 §B).
//
// C'est le test le plus important de la slice B. L'Accueil est la page la plus visitée et la
// première peinte au réveil de l'app ; le 2026-07-28 elle s'est mise à charger un chunk de
// 1,37 Mo (368 Ko gzip) pour afficher une vue contemplative. L'addendum ANNULE ce coût — il ne
// l'atténue pas. Sans ce test, la régression reviendrait sans bruit : c'est déjà arrivé une
// fois, 3,6 Mo mesurés en juillet quand `GalaxyCanvas` passait par le baril `@zetis/ui/galaxy`.
//
// Le repo n'a NI outillage de bundle (`size-limit`, `bundlesize`, `manualChunks`) NI CI. Ce
// budget se vérifie donc ici, par analyse statique du graphe d'imports depuis
// `AccueilMassimoPage.tsx`.
//
// ⚠️ POINT SUBTIL, et c'est tout l'intérêt du test : le canvas était DÉJÀ code-splitté le
// 2026-07-28 (`lazy(() => import("@zetis/ui/galaxy/canvas"))`). Le coût ne venait pas d'un
// import statique mais d'un MONTAGE — l'Accueil montait `HomeGalaxyPreview`, qui déclenchait le
// chargement du chunk à l'atterrissage. Un test qui ne regarderait que les imports synchrones
// n'aurait donc PAS attrapé la régression qu'il est censé prévenir.
//
// La règle vérifiée est donc plus forte : aucun fichier atteignable depuis l'Accueil ne doit
// MENTIONNER le moteur 3D, que ce soit par `import ... from` ou par `import()`. Le graphe est
// parcouru par les imports synchrones (ce que la page monte réellement), mais l'interdit porte
// sur les deux formes.

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, "pages/AccueilMassimoPage.tsx");

describe("budget de bundle — page d'entrée (Accueil)", () => {
  const { files, bare } = reachable(ENTRY);

  it("le graphe d'imports de l'Accueil est bien analysé (garde-fou du test lui-même)", () => {
    // Sans ce garde-fou, une erreur de résolution rendrait le test vert pour de mauvaises
    // raisons : un graphe vide ne contient jamais Three.js.
    expect(files.size).toBeGreaterThan(10);
    expect([...files].some((f) => f.endsWith("HomeGalaxyCard.tsx"))).toBe(true);
  });

  it("le détecteur voit vraiment un déclenchement (contre-épreuve sur /galaxy)", () => {
    // Un test qui n'échoue jamais ne protège rien. `GalaxyPage` déclenche LÉGITIMEMENT le
    // canvas — c'est la raison d'être de cette page. S'il n'était pas détecté ici, c'est que
    // le détecteur est cassé et que le vert de l'Accueil ne veut rien dire.
    const galaxyPage = resolve(HERE, "pages/GalaxyPage.tsx");
    expect(dynamicImports(readFileSync(galaxyPage, "utf8")).filter(isForbidden)).toEqual([
      "@zetis/ui/galaxy/canvas",
    ]);
  });

  it("n'importe le moteur 3D par AUCUN chemin synchrone", () => {
    expect([...bare].filter(isForbidden)).toEqual([]);
  });

  it("ne DÉCLENCHE le moteur 3D que depuis les points de montage AUTORISÉS", () => {
    // ⚠️ CE CAS A CHANGÉ DE NATURE LE 2026-07-31 AU SOIR, et c'est une décision, pas un
    // assouplissement de confort.
    //
    // Il interdisait tout `import()` du moteur 3D depuis l'Accueil. C'est cette forme-là qui
    // avait fait entrer 1,37 Mo sur la page d'atterrissage le 2026-07-28 : le canvas était
    // code-splitté, mais l'Accueil le MONTAIT, donc Massimo le téléchargeait quand même.
    //
    // L'addendum « la galaxie revient sur l'Accueil » rétablit ce montage — **volontairement**,
    // pour donner à la page la vie qu'un compte statique ne donne pas. L'interdit absolu n'a
    // donc plus de sens ; ce qui en garde, c'est que le montage reste **rare, nommé et
    // différé**. D'où une liste blanche plutôt qu'un zéro.
    //
    // Ce que ce cas protège encore, et qui est l'essentiel : qu'un TROISIÈME point de montage
    // n'apparaisse pas sans que personne ne le voie. C'était le mode de la régression de juillet.
    const ALLOWED = ["HomeGalaxyCard.tsx"];
    expect(triggeringFiles(files)).toEqual(ALLOWED);
  });

  it("le point de montage autorisé le fait en `import()`, JAMAIS en synchrone", () => {
    // La liste blanche ci-dessus autorise un montage, pas un import statique : Three.js doit
    // rester hors du bundle de départ. C'est ce qui fait que la carte statique est peinte
    // d'abord et que le chunk 3D ne part qu'ensuite, à l'`idle`.
    const card = resolve(HERE, "components/galaxy/HomeGalaxyCard.tsx");
    const source = readFileSync(card, "utf8");
    expect(staticImports(source).filter(isForbidden)).toEqual([]);
    expect(dynamicImports(source).filter(isForbidden)).toEqual(["@zetis/ui/galaxy/canvas"]);
  });

  it("n'atteint aucun fichier qui importe `three`", () => {
    // Filet transitif : `brainGeometry.ts` importe `three` sans être exporté par le baril
    // `@zetis/ui/galaxy` — c'est la fuite la plus probable si quelqu'un l'importe un jour.
    expect(filesImportingThree(files)).toEqual([]);
  });
});
