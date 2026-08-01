import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  dynamicImports,
  filesImportingThree,
  isForbidden,
  reachable,
  triggeringFiles,
} from "./test/bundleGraph";

// BUDGET DE BUNDLE DE LA PAGE MATIÈRE (addendum ADR-0024, spec §« Ce qu'elle N'EST PAS »).
//
// Cette page EST le repli sans WebGL promis par `zetis-galaxy.md §11` : elle rend le MÊME
// modèle que la constellation, en liste. Un chunk 3D ici viderait la promesse de son sens — et
// personne ne le verrait, puisque la page continuerait de marcher.
//
// La règle est PLUS DURE que celle de l'Accueil. Là-bas, une liste blanche autorise un montage
// nommé et différé (`HomeGalaxyCard`), parce que la galaxie sur l'Accueil est voulue. Ici le
// budget est ZÉRO, dans les deux formes — il n'y a rien à monter.
//
// Le piège est réel : la page atteint `@zetis/ui/galaxy` (le baril) pour `normalizeSearch` et
// `starStyle`. Ce baril ne ré-exporte PAS `GalaxyCanvas`, et `brainGeometry.ts` — le seul autre
// porteur de `three` — n'en est pas atteignable. Mais rien n'empêche un futur
// `export { GalaxyCanvas }` d'y faire entrer 3,6 Mo d'un coup. C'est ce test qui le verrait.
//
// ⚠️ Il couvre les `import()` autant que les imports statiques. Leçon du 2026-07-28 : ce qui
// coûtait n'était pas un import statique, c'était le MONTAGE d'un composant déjà code-splitté.
// Un test limité au synchrone n'aurait pas attrapé la régression qu'il prétend prévenir.

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, "pages/MatiereDetailPage.tsx");

describe("budget de bundle — page matière (/subjects/:slug)", () => {
  const { files, bare } = reachable(ENTRY);

  it("le graphe d'imports est bien analysé (garde-fou du test lui-même)", () => {
    // Sans ce cas, une erreur de résolution rendrait tout le reste vert pour de mauvaises
    // raisons : un graphe vide ne contient jamais Three.js.
    expect(files.size).toBeGreaterThan(10);
    expect([...files].some((f) => f.endsWith("useSubjectPanoply.ts"))).toBe(true);
    // Et la page passe VRAIMENT par le baril galaxy — sinon le test ne prouverait pas
    // grand-chose : c'est précisément ce chemin qui est surveillé.
    expect(bare.has("@zetis/ui/galaxy")).toBe(true);
  });

  it("n'importe le moteur 3D par AUCUN chemin synchrone", () => {
    expect([...bare].filter(isForbidden)).toEqual([]);
  });

  it("ne le DÉCLENCHE par aucun `import()` non plus — budget ZÉRO, pas de liste blanche", () => {
    expect(triggeringFiles(files)).toEqual([]);
  });

  it("n'atteint aucun fichier qui importe `three` (filet transitif)", () => {
    expect(filesImportingThree(files)).toEqual([]);
  });

  it("n'importe pas `NotionActionPanel` : on partage la TABLE de routes, pas le composant", () => {
    // Le panneau de la Galaxy est ce qu'on serait tenté de réutiliser tel quel. Il ne tire pas
    // Three.js aujourd'hui — mais il vit dans `components/galaxy/`, où ce n'est qu'une question
    // de temps. La page consomme `notionRoutes.ts` (pur) et son propre panneau.
    expect([...files].some((f) => f.endsWith("NotionActionPanel.tsx"))).toBe(false);
  });

  it("la table de routes partagée reste PURE (aucun import de valeur)", () => {
    // Sa pureté est ce qui permet de la partager entre la Galaxy — qui paie Three.js — et cette
    // page, dont le budget est nul. Un seul import de valeur y ouvrirait une porte : React, le
    // routeur, un client HTTP… et le module cesserait d'être neutre.
    const source = readFileSync(resolve(HERE, "lib/notionRoutes.ts"), "utf8");

    // ⚠️ On n'utilise PAS `staticImports` ici. Sa regex ne distingue pas `import type` d'un
    // import de valeur, et surtout elle produit un faux positif sur ce fichier précis :
    // `export const SUBJECT_BACK_PARAM = "from"` ressemble à un `export … from "…"`. Corriger
    // le moteur changerait le comportement du budget de l'Accueil — on vérifie donc ici d'une
    // façon qui n'en dépend pas.
    const valueImports = source
      .split("\n")
      .filter((line) => /^\s*import\s/.test(line) && !/^\s*import\s+type\s/.test(line));
    expect(valueImports).toEqual([]);
    expect(dynamicImports(source)).toEqual([]);
  });
});
