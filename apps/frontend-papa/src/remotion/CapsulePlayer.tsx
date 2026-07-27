// Aperçu in-browser d'une capsule via @remotion/player (aucun rendu serveur, pas de MP4).
import { Player } from "@remotion/player";
import { type CapsuleSpec } from "@zetis/types";
import { CapsuleVideo } from "./CapsuleVideo";
import { audioSrc } from "../lib/capsules";

export function CapsulePlayer({ spec }: { spec: CapsuleSpec }) {
  const durationInFrames = Math.max(
    1,
    spec.scenes.reduce((sum, s) => sum + s.durationInFrames, 0),
  );
  // Absolutise les pistes audio (chemin relatif backend → URL complète + token).
  const playable: CapsuleSpec = {
    ...spec,
    scenes: spec.scenes.map((s) => (s.audioUrl ? { ...s, audioUrl: audioSrc(s.audioUrl) } : s)),
  };
  return (
    <Player
      component={CapsuleVideo}
      inputProps={{ spec: playable }}
      durationInFrames={durationInFrames}
      fps={spec.fps}
      compositionWidth={spec.width}
      compositionHeight={spec.height}
      // Poster non vide : on démarre après le fondu d'entrée du titre (0–15 frames).
      initialFrame={20}
      style={{ width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #26304f" }}
      controls
      acknowledgeRemotionLicense
    />
  );
}
