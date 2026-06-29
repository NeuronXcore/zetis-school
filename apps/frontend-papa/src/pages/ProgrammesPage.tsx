import { PageHeader } from "../components/PageHeader";
import { SUBJECTS_PROGRESS } from "../data/mock";

// Matières & programmes Papa (Étape 8) — configuration des matières (mock).
export function ProgrammesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Matières & programmes"
        subtitle="Configurer les matières et importer les programmes officiels."
        actions={
          <button type="button" className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg">
            Importer un programme
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SUBJECTS_PROGRESS.map((s) => (
          <div
            key={s.name}
            className="flex items-center justify-between rounded-xl border border-papa-border bg-papa-surface p-4"
          >
            <div>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-papa-muted">{s.xp} XP · {s.openGaps} lacune(s)</p>
            </div>
            <button type="button" className="text-sm text-papa-accent hover:underline">
              Configurer →
            </button>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-papa-muted">
        Rappel : les programmes doivent être importables/validables, jamais codés en dur (cf. docs/school).
      </p>
    </div>
  );
}
