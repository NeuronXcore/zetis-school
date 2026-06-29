import { PageHeader } from "../components/PageHeader";
import { CAPSULES_PUBLISHED, CAPSULES_TO_VALIDATE } from "../data/mock";

// Pilotage Capsules IA Papa (Étape 8) — générer / valider / publier (mock).
export function CapsulesPilotagePage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Capsules IA — Pilotage"
        subtitle="Générer, valider et publier les capsules pédagogiques."
        actions={
          <button type="button" className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg">
            Générer une capsule
          </button>
        }
      />

      <h3 className="mb-2 font-semibold">À valider</h3>
      <div className="space-y-3">
        {CAPSULES_TO_VALIDATE.map((c) => (
          <div key={c.id} className="rounded-xl border border-papa-border bg-papa-surface p-4">
            <p className="font-medium">
              {c.subject} — {c.notion}
            </p>
            <p className="mt-1 text-xs text-papa-muted">{c.state}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <button type="button" className="rounded-lg border border-papa-border px-3 py-1.5">Voir</button>
              <button type="button" className="rounded-lg border border-papa-border px-3 py-1.5">Modifier</button>
              <button type="button" className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-emerald-300">Valider</button>
              <button type="button" className="rounded-lg bg-rose-500/15 px-3 py-1.5 text-rose-300">Rejeter</button>
            </div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 mt-6 font-semibold">Publiées</h3>
      <ul className="space-y-2">
        {CAPSULES_PUBLISHED.map((c) => (
          <li
            key={c.id}
            className="flex items-center justify-between rounded-xl border border-papa-border bg-papa-surface px-4 py-3 text-sm"
          >
            <span>
              {c.subject} — {c.notion}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs text-emerald-300">
              publiée
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
