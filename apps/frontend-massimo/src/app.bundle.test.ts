import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filesImportingThree, reachable, triggeringFiles } from "./test/bundleGraph";

// FILET GLOBAL — LES POINTS DE MONTAGE 3D DE TOUTE L'APPLICATION.
//
// Les trois autres suites mesurent chacune UNE surface : l'Accueil, la page matière, le chrome.
// C'est la bonne granularité pour dire « ici le budget est zéro » ou « ici un montage nommé est
// autorisé ». Mais un budget par surface laisse par construction des angles morts : le jour où
// quelqu'un ajoute une page, un provider, un layout, personne ne les mesure — et c'est exactement
// ainsi que le trou du chrome a existé pendant des mois (cf. `layout.bundle.test.ts`).
//
// Cette suite ne remplace aucune des autres : elle ferme la question par le haut. `App.tsx` domine
// toutes les routes, donc l'inventaire des fichiers qui déclenchent Three.js y est COMPLET. On
// n'exprime plus une règle par surface, on épingle la LISTE — et toute apparition d'un point de
// montage, où qu'il soit, fait échouer ce test.
//
// La liste n'est pas un interdit : les deux points de montage sont légitimes et documentés.
// `GalaxyPage` EST la galaxie (c'est sa raison d'être) ; `HomeGalaxyCard` est l'exception accordée
// par l'addendum « la galaxie revient sur l'Accueil », rare, nommée et différée. Ce qui est
// interdit, c'est un TROISIÈME qui apparaîtrait sans que personne ne le voie.

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(HERE, "App.tsx");

describe("budget de bundle — filet global (App.tsx domine toutes les routes)", () => {
  const { files } = reachable(ENTRY);

  it("le graphe couvre bien toute l'app (garde-fou du test lui-même)", () => {
    // Un graphe tronqué serait vert pour de mauvaises raisons. On exige les deux extrémités :
    // une page profonde, et le chrome — que les suites par page ne voyaient pas.
    expect(files.size).toBeGreaterThan(50);
    expect([...files].some((f) => f.endsWith("GalaxyPage.tsx"))).toBe(true);
    expect([...files].some((f) => f.endsWith("MassimoBannerHeader.tsx"))).toBe(true);
  });

  it("les points de montage 3D de TOUTE l'app sont exactement ceux-ci", () => {
    // Épinglé, pas borné. Ajouter un montage légitime demande de modifier cette liste — donc de
    // l'écrire, donc de le décider. C'est le contraire d'une régression silencieuse.
    expect(triggeringFiles(files)).toEqual(["GalaxyPage.tsx", "HomeGalaxyCard.tsx"]);
  });

  it("aucun fichier atteignable en SYNCHRONE n'importe `three`", () => {
    // Le moteur 3D n'entre que par `import()`, jamais dans le bundle de départ. `reachable()` ne
    // parcourt que le synchrone : ce qui est ici est ce que Massimo télécharge avant de voir
    // quoi que ce soit.
    expect(filesImportingThree(files)).toEqual([]);
  });
});
