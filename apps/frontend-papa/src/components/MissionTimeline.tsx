import { type MissionPilot } from "../lib/missionsPilotage";
import { STEP_EMOJI, STEP_LABEL } from "../lib/missionSteps";

// Frise chronologique des étapes d'une mission (ADR-0017/0019). Choix produit : séquence +
// statut (pas d'horodatage absolu). Consomme `MissionPilot.steps` (step_type + status + proof).
export function MissionTimeline({ mission }: { mission: MissionPilot }) {
  const sorted = [...mission.steps].sort((a, b) => a.sort_order - b.sort_order);
  // « En cours » = première étape non faite d'une mission active (les autres sont « à faire »).
  const currentId =
    mission.status === "active" ? sorted.find((s) => s.status !== "done")?.id : undefined;

  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {sorted.map((step, i) => {
        const done = step.status === "done";
        const active = step.id === currentId;
        const tone = done
          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-300"
          : active
            ? "border-papa-accent/50 bg-papa-accent/10 text-papa-accent"
            : "border-papa-border bg-papa-surface-2 text-papa-muted";
        return (
          <div key={step.id} className="flex shrink-0 items-center gap-1">
            {i > 0 && <span className="h-px w-4 bg-papa-border" />}
            <div
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${tone}`}
              title={step.instruction ?? undefined}
            >
              <span>{STEP_EMOJI[step.step_type] ?? "•"}</span>
              <span>{STEP_LABEL[step.step_type] ?? step.step_type}</span>
              {done ? (
                <span aria-hidden>✓</span>
              ) : active ? (
                <span aria-hidden className="animate-pulse">
                  ●
                </span>
              ) : (
                <span aria-hidden className="opacity-50">
                  ○
                </span>
              )}
              {step.proof.value !== null && (
                <span className="tabular-nums opacity-70">{step.proof.value}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
