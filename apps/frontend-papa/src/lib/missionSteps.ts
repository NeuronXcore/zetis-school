// Métadonnées d'affichage des types d'étape de mission — partagées entre la page pilotage,
// la frise (MissionTimeline) et l'éditeur de parcours (MissionEditModal).
export const STEP_EMOJI: Record<string, string> = {
  lesson: "📘",
  eli5: "💡",
  vocal_explain: "🎙",
  quiz: "❓",
  mindmap: "🧠",
};

export const STEP_LABEL: Record<string, string> = {
  lesson: "Lire le cours",
  eli5: "Explication",
  vocal_explain: "Verbaliser",
  quiz: "Quiz",
  mindmap: "Reconstruire",
};
