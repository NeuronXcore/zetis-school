// Rendu MP4 serveur d'une capsule (Lot 2), appelé en sous-processus par worker-media.
//
//   node src/remotion/render.mjs <specJson> <publicDir> <outMp4>
//
// - <specJson>  : chemin d'un CapsuleSpec JSON dont les `audioUrl` sont des noms de fichiers
//                 nus (ex. "scene_0.wav") présents dans <publicDir>.
// - <publicDir> : dossier des WAV de scènes (résolus par `staticFile` dans le bundle).
// - <outMp4>    : chemin de sortie du MP4.
//
// Imprime sur stdout une ligne JSON `{"ok":true,"durationInFrames":N}` en cas de succès.
// Rendu sandboxé (cf. ADR-0007 §7) : c'est worker-media qui impose réseau/CPU/RAM/timeout.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

async function main() {
  const [specPath, publicDir, outPath] = process.argv.slice(2);
  if (!specPath || !publicDir || !outPath) {
    throw new Error("usage: node render.mjs <specJson> <publicDir> <outMp4>");
  }

  const spec = JSON.parse(readFileSync(specPath, "utf8"));
  const inputProps = { spec };

  const here = path.dirname(fileURLToPath(import.meta.url));
  const entryPoint = path.join(here, "index.ts");

  // Chromium headless (téléchargé/mis en cache par Remotion) requis par le rendu.
  await ensureBrowser();

  const serveUrl = await bundle({ entryPoint, publicDir });

  const composition = await selectComposition({
    serveUrl,
    id: "CapsuleVideo",
    inputProps,
    licenseKey: "free-license",
  });

  await renderMedia({
    serveUrl,
    composition,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    // Éligible licence gratuite (entité ≤ 3 personnes), cf. ADR-0007 §8.
    licenseKey: "free-license",
  });

  process.stdout.write(
    JSON.stringify({ ok: true, durationInFrames: composition.durationInFrames }) + "\n",
  );
}

main().catch((err) => {
  process.stderr.write(String(err?.stack || err) + "\n");
  process.exit(1);
});
