import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { BackendStatus } from "../components/BackendStatus";
import { ALERTS, KPIS, PERIOD_LABEL, RECOMMENDATIONS, STUDENT } from "../data/mock";

// Dashboard Papa (Étape 8) — état pédagogique en une page (mock).
export function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Dashboard"
        subtitle={`${STUDENT} · ${PERIOD_LABEL}`}
        actions={<BackendStatus />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {KPIS.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} />
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="font-semibold text-papa-warn">Alertes prioritaires</p>
        <ul className="mt-3 space-y-2">
          {ALERTS.map((a) => (
            <li
              key={a.subject}
              className="flex items-center justify-between gap-3 rounded-lg bg-papa-surface-2 px-4 py-2.5 text-sm"
            >
              <span>
                <strong>{a.subject}</strong> — {a.text}
              </span>
              <button type="button" className="shrink-0 text-papa-accent hover:underline">
                {a.action} →
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="font-semibold text-papa-accent-2">Recommandations ZETIS</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {RECOMMENDATIONS.map((r) => (
            <button
              key={r}
              type="button"
              className="rounded-lg border border-papa-border px-4 py-2 text-sm font-medium hover:border-papa-accent"
            >
              {r}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
