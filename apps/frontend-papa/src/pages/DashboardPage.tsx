// Dashboard temporaire Papa (Étape 3). KPIs en données mockées — pas d'appel backend.
const KPIS = [
  { label: "Sessions (semaine)", value: "—", hint: "à venir" },
  { label: "XP (semaine)", value: "—", hint: "à venir" },
  { label: "Lacunes ouvertes", value: "—", hint: "à venir" },
  { label: "Missions terminées", value: "—", hint: "à venir" },
];

export function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold">
        ZETIS <span className="text-papa-accent">Papa</span>
      </h1>
      <p className="mt-1 text-papa-muted">
        Cockpit de pilotage — vue d'ensemble de la progression de Massimo.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <div
            key={kpi.label}
            className="rounded-xl border border-papa-border bg-papa-surface p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-papa-muted">
              {kpi.label}
            </p>
            <p className="mt-2 text-3xl font-bold">{kpi.value}</p>
            <p className="mt-1 text-xs text-papa-muted">{kpi.hint}</p>
          </div>
        ))}
      </div>

      <section className="mt-6 rounded-xl border border-papa-border bg-papa-surface p-5">
        <p className="text-sm font-semibold text-papa-accent-2">Alertes & recommandations</p>
        <p className="mt-2 text-papa-muted">
          Les alertes prioritaires et les recommandations ZETIS apparaîtront ici une fois
          le modèle pédagogique et les diagnostics en place (étapes suivantes).
        </p>
      </section>
    </div>
  );
}
