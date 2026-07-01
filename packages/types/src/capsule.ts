// Champs communs à toutes les scènes. `narration` = texte parlé (écrit par le LLM) ;
// `audioUrl` = piste audio TTS (écrite par le serveur après synthèse, jamais par le LLM).
interface SceneCommon {
  durationInFrames: number;
  narration?: string;
  audioUrl?: string;
}

// Vocabulaire FERMÉ de scènes d'une capsule (cf. ADR-0007). Chaque `kind` correspond à un
// composant Remotion fixe (slice B) ; le LLM émet ces données typées, jamais du code.
export type CapsuleScene =
  | (SceneCommon & { kind: "title"; title: string; subtitle?: string })
  | (SceneCommon & { kind: "bullet"; heading: string; points: string[] })
  | (SceneCommon & { kind: "definition"; term: string; body: string; example?: string })
  | (SceneCommon & {
      kind: "numberline";
      min: number;
      max: number;
      marks: { value: number; label?: string; color?: string }[];
    })
  | (SceneCommon & {
      kind: "barmodel";
      heading?: string;
      parts: number;
      filled: number;
      caption?: string;
    });

export interface CapsuleSpec {
  title: string; subject: string; skill?: string; level: string;
  fps: number; width: number; height: number;
  scenes: CapsuleScene[];
}
