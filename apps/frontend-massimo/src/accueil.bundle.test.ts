import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

/** Ce que l'Accueil ne doit atteindre par AUCUN chemin synchrone. */
const FORBIDDEN = ["@zetis/ui/galaxy/canvas", "react-force-graph-3d", "three", "three-spritetext"];

/** Racine du monorepo, pour résoudre les imports `@zetis/*` consommés EN SOURCE (workspace). */
const REPO = resolve(HERE, "../../..");
const WORKSPACE: Record<string, string> = {
  "@zetis/ui": resolve(REPO, "packages/ui/src/index.ts"),
  "@zetis/ui/galaxy": resolve(REPO, "packages/ui/src/components/galaxy/index.ts"),
  "@zetis/ui/mindmap": resolve(REPO, "packages/ui/src/components/mindmap/index.ts"),
  "@zetis/ui/avatar": resolve(REPO, "packages/ui/src/components/avatar/index.ts"),
  "@zetis/auth": resolve(REPO, "packages/auth/src/index.ts"),
  "@zetis/types": resolve(REPO, "packages/types/src/index.ts"),
};

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveFile(candidate: string): string | null {
  if (existsSync(candidate) && !candidate.endsWith("/")) {
    // Un dossier existant n'est pas un module : on laisse les suffixes trancher.
    try {
      if (readFileSync(candidate).length >= 0 && /\.[a-z]+$/.test(candidate)) return candidate;
    } catch {
      /* c'est un dossier */
    }
  }
  for (const ext of EXTENSIONS) {
    const withExt = candidate + ext;
    if (existsSync(withExt)) return withExt;
  }
  return null;
}

/** Spécificateurs importés SYNCHRONEMENT — c'est par eux qu'on parcourt le graphe. */
function staticImports(source: string): string[] {
  const withoutDynamic = source.replace(/import\s*\(/g, "IMPORT_DYNAMIQUE(");
  const found: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutDynamic)) !== null) found.push(match[1]);
  return found;
}

/** Spécificateurs chargés en `import(...)` — code-splittés, mais DÉCLENCHÉS au montage. */
function dynamicImports(source: string): string[] {
  const found: string[] = [];
  const re = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) found.push(match[1]);
  return found;
}

function isForbidden(specifier: string): boolean {
  return FORBIDDEN.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

/** Tous les fichiers atteignables depuis `entry` par des imports synchrones, + les paquets nus. */
function reachable(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (files.has(file)) continue;
    files.add(file);

    for (const specifier of staticImports(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".")) {
        const resolved = resolveFile(resolve(dirname(file), specifier));
        // Un import non résolu est un asset (png, css) : sans intérêt pour ce budget.
        if (resolved) queue.push(resolved);
        continue;
      }
      bare.add(specifier);
      const workspace = WORKSPACE[specifier];
      if (workspace && existsSync(workspace)) queue.push(workspace);
    }
  }

  return { files, bare };
}

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

  it("ne DÉCLENCHE le moteur 3D par aucun `import()` non plus", () => {
    // LE test de la slice. C'est cette forme-là qui avait fait entrer 1,37 Mo sur la page
    // d'atterrissage le 2026-07-28 : `HomeGalaxyPreview` chargeait le canvas en `lazy()`, donc
    // dans un chunk séparé — mais l'Accueil le MONTAIT, et Massimo le téléchargeait quand même.
    const triggering = [...files]
      .map((file) => ({ file, hits: dynamicImports(readFileSync(file, "utf8")).filter(isForbidden) }))
      .filter(({ hits }) => hits.length > 0)
      .map(({ file }) => file);
    expect(triggering).toEqual([]);
  });

  it("n'atteint aucun fichier qui importe `three`", () => {
    // Filet transitif : `brainGeometry.ts` importe `three` sans être exporté par le baril
    // `@zetis/ui/galaxy` — c'est la fuite la plus probable si quelqu'un l'importe un jour.
    const leaking = [...files].filter((file) => {
      const source = readFileSync(file, "utf8");
      return [...staticImports(source), ...dynamicImports(source)].some(
        (s) => s === "three" || s.startsWith("three/"),
      );
    });
    expect(leaking).toEqual([]);
  });
});
