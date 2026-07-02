// Racine Remotion pour le rendu serveur (Lot 2). Enregistre la composition "CapsuleVideo"
// dont la durée / fps / dimensions sont dérivés du `CapsuleSpec` passé en `inputProps` via
// `calculateMetadata`. La `@remotion/player` (Lot 1) n'utilise PAS ce fichier ; il ne sert
// qu'au bundle de rendu (`render.mjs`).
import { Composition } from "remotion";
import { type CapsuleSpec } from "@zetis/types";
import { CapsuleVideoRender } from "./CapsuleVideoRender";

// Spec de repli minimal (valide) : nécessaire pour `defaultProps`. Toujours écrasé par le
// spec réel passé en `inputProps` au rendu.
const FALLBACK_SPEC: CapsuleSpec = {
  title: "Capsule",
  subject: "—",
  level: "—",
  fps: 30,
  width: 1280,
  height: 720,
  scenes: [{ kind: "title", title: "Capsule", durationInFrames: 60 }],
};

function totalFrames(spec: CapsuleSpec): number {
  return Math.max(
    1,
    spec.scenes.reduce((sum, s) => sum + s.durationInFrames, 0),
  );
}

export function RemotionRoot() {
  return (
    <Composition
      id="CapsuleVideo"
      component={CapsuleVideoRender}
      durationInFrames={totalFrames(FALLBACK_SPEC)}
      fps={FALLBACK_SPEC.fps}
      width={FALLBACK_SPEC.width}
      height={FALLBACK_SPEC.height}
      defaultProps={{ spec: FALLBACK_SPEC }}
      calculateMetadata={({ props }) => ({
        durationInFrames: totalFrames(props.spec),
        fps: props.spec.fps,
        width: props.spec.width,
        height: props.spec.height,
      })}
    />
  );
}
