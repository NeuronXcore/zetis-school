import { PageHeader } from "../components/PageHeader";
import { EVENTS } from "../data/mock";

const FILTERS = ["Matière", "Période", "Type d'événement"];

// Cahier de bord IA Papa (Étape 8) — flux chronologique d'événements (mock).
export function CahierBordPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Cahier de bord IA" subtitle="Trace lisible de ce qui s'est passé." />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className="rounded-lg border border-papa-border px-3 py-1.5 text-sm text-papa-muted hover:text-papa-text"
          >
            {f} ▾
          </button>
        ))}
      </div>

      <ol className="relative space-y-4 border-l border-papa-border pl-5">
        {EVENTS.map((e, i) => (
          <li key={i} className="relative">
            <span className="absolute -left-[1.42rem] top-1.5 h-2.5 w-2.5 rounded-full bg-papa-accent" />
            <div className="rounded-xl border border-papa-border bg-papa-surface p-4">
              <p className="text-xs font-semibold text-papa-accent-2">
                {e.date} — {e.subject}
              </p>
              <p className="mt-1 text-sm">{e.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        className="mt-4 rounded-lg border border-papa-border px-4 py-2 text-sm font-medium text-papa-muted hover:text-papa-text"
      >
        + Ajouter une note parent
      </button>
    </div>
  );
}
