import { PageHeader } from "../components/PageHeader";
import { DIAGNOSTICS } from "../data/mock";

// Diagnostics Papa (Étape 8) — détail des diagnostics (Papa voit le détail).
export function DiagnosticsPapaPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Diagnostics"
        subtitle="Résultats détaillés (côté Papa)."
        actions={
          <button
            type="button"
            className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
          >
            Lancer un diagnostic
          </button>
        }
      />
      <div className="space-y-3">
        {DIAGNOSTICS.map((d) => (
          <div key={d.date} className="rounded-xl border border-papa-border bg-papa-surface p-4">
            <div className="flex items-center justify-between">
              <p className="font-medium">{d.scope}</p>
              <span className="text-xs text-papa-muted">{d.date}</span>
            </div>
            <p className="mt-1 text-sm text-papa-muted">{d.result}</p>
            <span
              className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                d.priority === "haute" ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"
              }`}
            >
              priorité {d.priority}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
