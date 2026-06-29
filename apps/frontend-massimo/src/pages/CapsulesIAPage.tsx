import { PageHeader } from "../components/PageHeader";
import { CAPSULES, RECOMMENDED_CAPSULE } from "../data/mock";

// Page Capsules IA Massimo (Étape 7) — capsule recommandée + bibliothèque (mock).
export function CapsulesIAPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Capsules IA" subtitle="De courtes vidéos pour comprendre une notion." />

      {/* Capsule recommandée */}
      <section className="rounded-2xl border border-zetis-border bg-zetis-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          Capsule recommandée
        </p>
        <h2 className="mt-1 text-lg font-bold">{RECOMMENDED_CAPSULE.title}</h2>
        <p className="mt-1 text-sm text-zetis-muted">
          {RECOMMENDED_CAPSULE.subject} · {RECOMMENDED_CAPSULE.durationMin} min · niveau{" "}
          {RECOMMENDED_CAPSULE.level}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-lg bg-zetis-accent px-4 py-2 text-sm font-semibold text-white"
          >
            ▶ Regarder
          </button>
          <button
            type="button"
            className="rounded-lg border border-zetis-border px-4 py-2 text-sm font-semibold"
          >
            Quiz après capsule
          </button>
        </div>
      </section>

      {/* Bibliothèque */}
      <h3 className="mt-6 mb-2 font-bold">Bibliothèque</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {CAPSULES.map((c) => (
          <div key={c.id} className="rounded-2xl border border-zetis-border bg-zetis-surface p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zetis-accent-2">{c.subject}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  c.seen ? "bg-emerald-500/15 text-emerald-300" : "bg-zetis-surface-2 text-zetis-muted"
                }`}
              >
                {c.seen ? "Vue" : "Nouvelle"}
              </span>
            </div>
            <p className="mt-2 font-semibold">{c.title}</p>
            <p className="text-xs text-zetis-muted">
              {c.notion} · {c.durationMin} min
            </p>
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-zetis-surface-2 py-1.5 text-sm font-medium hover:text-zetis-accent-2"
            >
              Quiz
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
