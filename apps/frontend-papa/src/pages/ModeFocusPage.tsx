import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { GAPS } from "../data/mock";

// Mode focus Papa (Étape 8) — concentrer ZETIS sur une notion (mock).
export function ModeFocusPage() {
  const [focus, setFocus] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mode focus"
        subtitle="Concentre temporairement ZETIS sur une seule notion à renforcer."
      />

      {focus ? (
        <section className="rounded-2xl border border-papa-accent bg-papa-accent/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-papa-accent">
            Focus en cours
          </p>
          <h2 className="mt-1 text-xl font-bold">{focus}</h2>
          <p className="mt-2 text-sm text-papa-muted">
            ZETIS priorisera les missions, capsules et révisions sur cette notion jusqu'à sa
            consolidation.
          </p>
          <button
            type="button"
            onClick={() => setFocus(null)}
            className="mt-4 rounded-lg border border-papa-border px-4 py-2 text-sm font-medium"
          >
            Arrêter le focus
          </button>
        </section>
      ) : (
        <>
          <p className="mb-3 text-sm text-papa-muted">Choisis une notion à cibler :</p>
          <div className="space-y-2">
            {GAPS.map((g) => (
              <button
                key={`${g.subject}-${g.notion}`}
                type="button"
                onClick={() => setFocus(`${g.subject} — ${g.notion}`)}
                className="flex w-full items-center justify-between rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-left hover:border-papa-accent"
              >
                <span>
                  {g.subject} — {g.notion}
                </span>
                <span className="text-sm text-papa-accent">Focus →</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
