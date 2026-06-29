import { PageHeader } from "../components/PageHeader";
import { GAPS, type Gap } from "../data/mock";

const SEVERITY_CLASS: Record<Gap["severity"], string> = {
  faible: "bg-papa-surface-2 text-papa-muted",
  moyenne: "bg-amber-500/15 text-amber-300",
  forte: "bg-rose-500/15 text-rose-300",
};

// Lacunes Papa (Étape 8) — liste des lacunes ouvertes (mock).
export function LacunesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Lacunes" subtitle="Notions à renforcer, avec action proposée." />
      <div className="space-y-2">
        {GAPS.map((g) => (
          <div
            key={`${g.subject}-${g.notion}`}
            className="flex items-center justify-between gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3"
          >
            <div>
              <p className="font-medium">
                {g.subject} — {g.notion}
              </p>
              <p className="text-xs text-papa-muted">
                détectée le {g.detectedOn} · {g.status}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_CLASS[g.severity]}`}>
                {g.severity}
              </span>
              <button type="button" className="text-sm text-papa-accent hover:underline">
                Créer une mission →
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
