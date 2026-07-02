// Rendu serveur (Lot 2) : les `audioUrl` du spec sont des noms de fichiers nus (ex.
// "scene_0.wav") copiés dans le `publicDir` du bundle par worker-media. On les résout via
// `staticFile` — miroir exact de ce que fait `CapsulePlayer` avec `audioSrc` pour l'aperçu.
// `CapsuleVideo` reste inchangé : il consomme des `audioUrl` déjà absolus.
import { staticFile } from "remotion";
import { type CapsuleSpec } from "@zetis/types";
import { CapsuleVideo } from "./CapsuleVideo";

export function CapsuleVideoRender({ spec }: { spec: CapsuleSpec }) {
  const resolved: CapsuleSpec = {
    ...spec,
    scenes: spec.scenes.map((s) => (s.audioUrl ? { ...s, audioUrl: staticFile(s.audioUrl) } : s)),
  };
  return <CapsuleVideo spec={resolved} />;
}
