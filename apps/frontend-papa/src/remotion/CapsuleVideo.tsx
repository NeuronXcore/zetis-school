// Composition Remotion d'une capsule : enchaîne les scènes du CapsuleSpec dans l'ordre,
// chacune sur sa durée `durationInFrames`. Sert l'aperçu (Lot 1) ET le rendu MP4 (Lot 2).
import { AbsoluteFill, Audio, Series } from "remotion";
import { type CapsuleScene, type CapsuleSpec } from "@zetis/types";
import {
  BarmodelScene,
  BulletScene,
  CAPSULE_BG,
  DefinitionScene,
  NumberlineScene,
  TitleScene,
} from "./scenes";

function renderScene(scene: CapsuleScene) {
  switch (scene.kind) {
    case "title":
      return <TitleScene scene={scene} />;
    case "bullet":
      return <BulletScene scene={scene} />;
    case "definition":
      return <DefinitionScene scene={scene} />;
    case "numberline":
      return <NumberlineScene scene={scene} />;
    case "barmodel":
      return <BarmodelScene scene={scene} />;
  }
}

export function CapsuleVideo({ spec }: { spec: CapsuleSpec }) {
  return (
    <AbsoluteFill style={{ backgroundColor: CAPSULE_BG, fontFamily: "Inter, system-ui, sans-serif" }}>
      <Series>
        {spec.scenes.map((scene, i) => (
          <Series.Sequence key={i} durationInFrames={scene.durationInFrames}>
            {scene.audioUrl && <Audio src={scene.audioUrl} />}
            {renderScene(scene)}
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
}
