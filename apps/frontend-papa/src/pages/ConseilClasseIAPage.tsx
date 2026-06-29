import { PageHeader } from "../components/PageHeader";
import { CLASS_COUNCIL } from "../data/mock";

// Conseil de classe IA Papa (Étape 8) — synthèse périodique par matière (mock).
export function ConseilClasseIAPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Conseil de classe IA"
        subtitle="Période : Trimestre 1"
        actions={
          <>
            <button
              type="button"
              className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
            >
              Générer la synthèse
            </button>
            <button
              type="button"
              className="rounded-lg border border-papa-border px-4 py-2 text-sm font-medium"
            >
              Exporter Markdown
            </button>
          </>
        }
      />

      <section className="mb-4 rounded-xl border border-papa-border bg-papa-surface-2 p-4 text-sm">
        <p className="font-semibold">Résumé global</p>
        <p className="mt-1 text-papa-muted">
          Progression régulière. Trois notions prioritaires à renforcer ce trimestre, sur un rythme
          de travail stable.
        </p>
      </section>

      <div className="space-y-3">
        {CLASS_COUNCIL.map((c) => (
          <div key={c.subject} className="rounded-xl border border-papa-border bg-papa-surface p-4">
            <p className="font-semibold">{c.subject}</p>
            <p className="mt-1 text-sm">
              <span className="text-emerald-300">Points forts :</span> {c.strong}
            </p>
            <p className="mt-1 text-sm">
              <span className="text-amber-300">À renforcer :</span> {c.toReinforce}
            </p>
            <p className="mt-1 text-sm">
              <span className="text-papa-accent-2">Action :</span> {c.action}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
