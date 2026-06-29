import { useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { MINDMAP } from "../data/mock";

// Page Mindmaps Massimo (Étape 7) — carte mockée + mode entraînement.
export function MindmapsPage() {
  const [training, setTraining] = useState(false);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Mindmaps"
        subtitle="Organise les idées : carte complète, ou reconstruis-la toi-même."
      />

      <div className="flex items-center justify-between">
        <p className="text-sm">
          Notion : <strong>{MINDMAP.notion}</strong>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTraining(false)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              !training ? "bg-zetis-accent text-white" : "border border-zetis-border text-zetis-muted"
            }`}
          >
            Carte complète
          </button>
          <button
            type="button"
            onClick={() => setTraining(true)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              training ? "bg-zetis-accent text-white" : "border border-zetis-border text-zetis-muted"
            }`}
          >
            Mode entraînement
          </button>
        </div>
      </div>

      <section className="mt-4 rounded-2xl border border-zetis-border bg-zetis-surface p-6">
        <div className="flex flex-col items-center">
          <div className="rounded-xl bg-zetis-accent px-4 py-2 font-bold text-white">
            {MINDMAP.notion}
          </div>
          <div className="mt-6 grid grid-cols-3 gap-4">
            {MINDMAP.branches.map((b, i) => (
              <div key={b.label} className="flex flex-col items-center text-center">
                <div className="rounded-lg border border-zetis-border bg-zetis-surface-2 px-3 py-1.5 text-sm font-medium">
                  {training ? `?` : b.label}
                </div>
                <div className="my-2 h-4 w-px bg-zetis-border" />
                <div className="rounded-lg border border-dashed border-zetis-border px-3 py-1.5 text-xs text-zetis-muted">
                  {training ? `Branche ${i + 1}` : b.child}
                </div>
              </div>
            ))}
          </div>
        </div>
        {training && (
          <p className="mt-6 text-center text-sm text-zetis-muted">
            À toi de retrouver les branches&nbsp;! (saisie interactive à venir)
          </p>
        )}
      </section>
    </div>
  );
}
