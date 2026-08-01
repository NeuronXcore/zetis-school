// Moteur d'analyse statique du graphe d'imports — partagé par les budgets de bundle.
//
// Extrait d'`accueil.bundle.test.ts` le 2026-08-01, sans changer une ligne de son
// comportement : la page matière a besoin du même détecteur avec une règle DIFFÉRENTE
// (l'Accueil autorise un point de montage 3D nommé, la page matière zéro). Un test paramétré
// aurait aplati cette asymétrie, qui est précisément la doctrine ; un moteur partagé et deux
// suites la gardent lisible.
//
// Ce fichier n'est PAS un `.test.ts` : il est hors du `include` de Vitest, donc il ne produit
// pas de suite vide.
//
// Le repo n'a NI outillage de bundle (`size-limit`, `bundlesize`, `manualChunks`) NI CI. Les
// budgets se vérifient donc ici, par analyse statique.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Ce qu'aucune page sous budget ne doit atteindre. */
export const FORBIDDEN = [
  "@zetis/ui/galaxy/canvas",
  "react-force-graph-3d",
  "three",
  "three-spritetext",
];

/** Racine du monorepo, pour résoudre les imports `@zetis/*` consommés EN SOURCE (workspace). */
const REPO = resolve(dirname(new URL(import.meta.url).pathname), "../../../..");

export const WORKSPACE: Record<string, string> = {
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
export function staticImports(source: string): string[] {
  const withoutDynamic = source.replace(/import\s*\(/g, "IMPORT_DYNAMIQUE(");
  const found: string[] = [];
  const re = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutDynamic)) !== null) found.push(match[1]);
  return found;
}

/** Spécificateurs chargés en `import(...)` — code-splittés, mais DÉCLENCHÉS au montage. */
export function dynamicImports(source: string): string[] {
  const found: string[] = [];
  const re = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) found.push(match[1]);
  return found;
}

export function isForbidden(specifier: string): boolean {
  return FORBIDDEN.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`));
}

/** Tous les fichiers atteignables depuis `entry` par des imports synchrones, + les paquets nus. */
export function reachable(entry: string): { files: Set<string>; bare: Set<string> } {
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

/** Les fichiers du graphe qui DÉCLENCHENT un chunk interdit par `import()`, par basename. */
export function triggeringFiles(files: Set<string>): string[] {
  return [...files]
    .filter((file) => dynamicImports(readFileSync(file, "utf8")).some(isForbidden))
    .map((file) => file.split("/").pop() as string)
    .sort();
}

/** Les fichiers du graphe qui importent `three` — par l'une ou l'autre forme (filet transitif). */
export function filesImportingThree(files: Set<string>): string[] {
  return [...files].filter((file) => {
    const source = readFileSync(file, "utf8");
    return [...staticImports(source), ...dynamicImports(source)].some(
      (s) => s === "three" || s.startsWith("three/"),
    );
  });
}
