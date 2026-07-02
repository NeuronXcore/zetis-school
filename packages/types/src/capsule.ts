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
    })
  | (SceneCommon & {
      // Figure géométrique animée (Pythagore, aires, angles). Vocabulaire fermé de formes.
      kind: "geometry";
      shape: "right_triangle" | "triangle" | "rectangle";
      labels?: { a?: string; b?: string; c?: string };
      caption?: string;
    })
  | (SceneCommon & {
      // Étapes de résolution qui apparaissent une à une (méthode, calcul, rédaction).
      kind: "steps";
      heading?: string;
      steps: string[];
    })
  | (SceneCommon & {
      // Frise chronologique : événements datés le long d'une ligne (Histoire).
      kind: "timeline";
      heading?: string;
      events: { date: string; label: string }[];
    })
  | (SceneCommon & {
      // Schéma annoté : un concept central entouré d'annotations (SVT, physique).
      kind: "diagram";
      heading?: string;
      center: string;
      labels: string[];
    });

export interface CapsuleSpec {
  title: string; subject: string; skill?: string; level: string;
  fps: number; width: number; height: number;
  scenes: CapsuleScene[];
}
