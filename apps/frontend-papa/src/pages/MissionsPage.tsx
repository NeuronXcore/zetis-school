import { PageHeader } from "../components/PageHeader";
import { MISSIONS, type Mission } from "../data/mock";

const STATUS_CLASS: Record<Mission["status"], string> = {
  active: "bg-sky-500/15 text-sky-300",
  terminée: "bg-emerald-500/15 text-emerald-300",
  "à venir": "bg-papa-surface-2 text-papa-muted",
};

// Missions Papa (Étape 8) — suivi des missions (mock).
export function MissionsPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Missions"
        subtitle="Missions proposées à Massimo et leur état."
        actions={
          <button
            type="button"
            className="rounded-lg bg-papa-accent px-4 py-2 text-sm font-semibold text-papa-bg"
          >
            + Créer une mission
          </button>
        }
      />
      <div className="space-y-2">
        {MISSIONS.map((m) => (
          <div
            key={m.title}
            className="flex items-center justify-between gap-3 rounded-xl border border-papa-border bg-papa-surface px-4 py-3"
          >
            <div>
              <p className="font-medium">{m.title}</p>
              <p className="text-xs text-papa-muted">
                {m.subject} · +{m.xp} XP
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[m.status]}`}>
              {m.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
