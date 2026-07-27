import { useEffect, useState } from "react";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { BackendStatus } from "../components/BackendStatus";
import { RegularityCard } from "../components/activity/RegularityCard";
import { fetchDashboardKpis } from "../lib/activity";
import { formatDelta, formatMinutes } from "../lib/heatmap";
import type { DashboardKpis, KpiValue } from "@zetis/types";
import { ALERTS, KPIS, PERIOD_LABEL, RECOMMENDATIONS, STUDENT } from "../data/mock";

// Dashboard Papa (Étape 8) — état pédagogique en une page.
// Les 4 KPI de RÉGULARITÉ viennent du backend avec leur écart hebdomadaire (chantier
// « Activité ») ; les KPI pédagogiques restants (lacunes ouvertes, notions consolidées) sont
// encore les valeurs mock d'origine, servis par d'autres routes.
const REGULARITY_LABELS = new Set([
  "Sessions (semaine)",
  "XP (semaine)",
  "Missions terminées",
  "Temps actif",
]);

export function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);

  useEffect(() => {
    // Échec silencieux : le dashboard reste lisible même si l'activité n'est pas joignable.
    fetchDashboardKpis()
      .then(setKpis)
      .catch(() => setKpis(null));
  }, []);

  function card(label: string, kpi: KpiValue, format: (n: number) => string, unit = "") {
    return (
      <KpiCard
        key={label}
        label={label}
        value={format(kpi.value)}
        delta={formatDelta(kpi.delta, unit)}
        deltaDirection={kpi.delta < 0 ? "down" : "up"}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Dashboard"
        subtitle={`${STUDENT} · ${PERIOD_LABEL}`}
        actions={<BackendStatus />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis ? (
          <>
            {card("Sessions (semaine)", kpis.sessions, String)}
            {card("Temps actif", kpis.active_minutes, formatMinutes, "min")}
            {card("XP (semaine)", kpis.xp, (n) => `+${n}`)}
            {card("Missions terminées", kpis.missions_completed, String)}
          </>
        ) : (
          KPIS.filter((k) => REGULARITY_LABELS.has(k.label)).map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} />
          ))
        )}
        {KPIS.filter((k) => !REGULARITY_LABELS.has(k.label)).map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} />
        ))}
      </div>

      <RegularityCard />

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
