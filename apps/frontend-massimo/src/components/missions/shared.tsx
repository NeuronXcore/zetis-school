import { type Mission, type MissionStep, type StepCompleteResult } from "@zetis/types";

// Contrat commun aux 3 modales d'activité de mission (ELI5 / quiz / mindmap). La validation de
// l'étape se fait DANS la modale ; `onStepDone` remonte le résultat serveur (verdict/XP) à la page.

export interface MissionModalProps {
  mission: Mission;
  step: MissionStep;
  /** Remonte le résultat serveur d'une étape validée → la page rafraîchit + célèbre si fin de mission. */
  onStepDone: (result: StepCompleteResult) => void;
  onClose: () => void;
}

export type StepVerdict = { verdict: "acquired" | "review_later"; xp: number };

/** Message doux (preuve manquante / souci) — jamais un rouge, jamais un « échec ». */
export function InlineHint({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-indigo-400/25 bg-indigo-400/10 px-4 py-3 text-sm text-indigo-100">
      <span aria-hidden>✨</span>
      <p className="flex-1">{text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="text-indigo-200/70 hover:text-indigo-100"
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  );
}

/** Pied de modale quand la/les étape(s) sont validées : verdict (deux issues positives) + Terminer. */
export function StepVerdictFooter({
  verdict,
  onClose,
}: {
  verdict: StepVerdict | null;
  onClose: () => void;
}) {
  return (
    <div className="mt-5 flex flex-col items-center gap-3 border-t border-white/10 pt-5 text-center">
      {verdict && (
        <p className="text-sm font-semibold text-zetis-text">
          {verdict.verdict === "acquired"
            ? "✓ Notion bien en place"
            : "🌙 On la reverra bientôt, tranquille"}
          <span className="text-amber-300"> · +{verdict.xp} XP</span>
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-base font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
      >
        Terminer ✓
      </button>
    </div>
  );
}

export const bySortOrder = (a: MissionStep, b: MissionStep) => a.sort_order - b.sort_order;
