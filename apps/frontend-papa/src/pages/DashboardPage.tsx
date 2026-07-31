import { useMemo } from "react";
import { SubjectFilterChips } from "@zetis/ui";
import type { DashboardPeriod } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { BackendStatus } from "../components/BackendStatus";
import { DecisionQueue } from "../components/dashboard/DecisionQueue";
import { KpiFocusCard } from "../components/dashboard/KpiFocusCard";
import { WorkRhythmCard } from "../components/dashboard/WorkRhythmCard";
import { TimeSplitCard } from "../components/dashboard/TimeSplitCard";
import { MemoryTrendCard } from "../components/dashboard/MemoryTrendCard";
import { NotionsStackCard } from "../components/dashboard/NotionsStackCard";
import { WhereToActCard } from "../components/dashboard/WhereToActCard";
import { ReviewLoadCard } from "../components/dashboard/ReviewLoadCard";
import { ContentChainCard } from "../components/dashboard/ContentChainCard";
import { ZetisReadingCard } from "../components/dashboard/ZetisReadingCard";
import { useDashboard } from "../hooks/useDashboard";
import { formatDelta, formatMinutes } from "../lib/heatmap";
import {
  KPI_FOCUS_HINTS,
  KPI_LABELS,
  sumReviewLoad,
  sumSeries,
} from "../lib/dashboardDerive";

// Dashboard Papa (ADR-0028) — le cockpit, en UNE requête.
//
// Il répond à trois questions, dans cet ordre :
//   1. qu'est-ce qui attend une décision de moi ?  → file « À décider »
//   2. où en est Massimo ?                          → KPI, heatmap, diagrammes
//   3. qu'est-ce que ZETIS propose ?                → Lecture ZETIS
//
// L'invariant à ne jamais casser : **changer de période, de matière ou de focus ne déclenche
// aucune requête**. Tout est projeté sur un payload déjà en mémoire. La seule exception assumée
// est le drill-down d'un jour, dans la carte heatmap.
//
// Non-objectifs : noter Massimo, produire un bulletin, déclencher une génération depuis ici.

const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  "7": "7 jours",
  "30": "30 jours",
  "90": "Trimestre",
};

export function DashboardPage() {
  const dash = useDashboard();
  const { data, period, focus, activeSubject, visibleSubjects } = dash;

  const chipOptions = useMemo(
    () => (data?.subjects ?? []).map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
    [data],
  );
  const subjectNames = useMemo(
    () => new Map((data?.subjects ?? []).map((s) => [s.slug, s.name])),
    [data],
  );

  if (dash.loading) {
    return (
      <div className="mx-auto max-w-[1560px]">
        <PageHeader title="Tableau de bord" subtitle="Chargement…" actions={<BackendStatus />} />
        {/* Skeleton global, UNE seule fois au montage. Aucun spinner ne réapparaît ensuite. */}
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-papa-surface motion-reduce:animate-none" />
          ))}
        </div>
      </div>
    );
  }

  if (dash.error || !data) {
    // Pas de rendu partiel : des cartes vides se liraient comme des zéros mesurés.
    return (
      <div className="mx-auto max-w-[1560px]">
        <PageHeader title="Tableau de bord" actions={<BackendStatus />} />
        <div className="mt-4 rounded-xl border border-papa-warn/30 bg-papa-warn/5 p-5">
          <p className="text-sm text-papa-warn">
            {dash.error ?? "Le tableau de bord n'a pas pu être chargé."}
          </p>
          <button
            type="button"
            onClick={dash.reload}
            className="mt-3 rounded-lg border border-papa-border px-3.5 py-2 text-sm font-semibold hover:border-papa-accent"
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const kpis = data.periods[period].kpis;
  const sparks = data.periods[period].sparks;
  const year = data.school_year;

  return (
    <div className="mx-auto max-w-[1560px]">
      <PageHeader
        title="Tableau de bord"
        subtitle={
          year
            ? `Année active ${year.level} · ${year.label}${
                data.last_activity_at
                  ? ` · dernière activité ${new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "long",
                      timeStyle: "short",
                    }).format(new Date(data.last_activity_at))}`
                  : ""
              }`
            : "Aucune année scolaire active"
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="inline-flex gap-0.5 rounded-lg border border-papa-border bg-papa-surface p-0.5">
              {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={period === value}
                  onClick={() => dash.setPeriod(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                    period === value ? "bg-papa-accent text-[#042f1f]" : "text-papa-muted"
                  }`}
                >
                  {PERIOD_LABELS[value]}
                </button>
              ))}
            </div>
            <BackendStatus />
          </div>
        }
      />

      <DecisionQueue items={data.inbox} />

      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiFocusCard
          focus="active_minutes"
          label={KPI_LABELS.active_minutes}
          value={formatMinutes(kpis.active_minutes.value)}
          delta={formatDelta(kpis.active_minutes.delta, "min")}
          deltaDirection={kpis.active_minutes.delta < 0 ? "down" : "up"}
          hint="vs période précédente"
          info="Heuristique de présence reconstruite depuis le journal d'activité — pas une mesure d'attention."
          spark={sparks.active_minutes}
          active={focus === "active_minutes"}
          focusHint={KPI_FOCUS_HINTS.active_minutes}
          onToggle={dash.toggleFocus}
        />
        <KpiFocusCard
          focus="active_days"
          label={KPI_LABELS.active_days}
          value={String(kpis.active_days.value)}
          unit={` / ${kpis.active_days.of} j`}
          delta={formatDelta(kpis.active_days.delta)}
          deltaDirection={kpis.active_days.delta < 0 ? "down" : "up"}
          hint="Séances courtes, réparties"
          spark={sparks.active_days}
          active={focus === "active_days"}
          focusHint={KPI_FOCUS_HINTS.active_days}
          onToggle={dash.toggleFocus}
        />
        <KpiFocusCard
          focus="consolidated"
          label={KPI_LABELS.consolidated}
          value={String(kpis.consolidated.value)}
          unit={` / ${kpis.consolidated.of}`}
          delta={formatDelta(kpis.consolidated.delta)}
          deltaDirection="up"
          hint="sur la période"
          spark={sparks.consolidated}
          active={focus === "consolidated"}
          focusHint={KPI_FOCUS_HINTS.consolidated}
          onToggle={dash.toggleFocus}
        />
        <KpiFocusCard
          focus="open_gaps"
          label={KPI_LABELS.open_gaps}
          value={String(kpis.open_gaps.value)}
          hint={
            kpis.open_gaps.without_mission > 0
              ? `${kpis.open_gaps.without_mission} sans mission`
              : "toutes prises en charge"
          }
          spark={sparks.open_gaps}
          active={focus === "open_gaps"}
          focusHint={KPI_FOCUS_HINTS.open_gaps}
          onToggle={dash.toggleFocus}
        />
      </div>

      {chipOptions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-widest text-papa-muted">
            Matière
          </span>
          <SubjectFilterChips
            subjects={chipOptions}
            value={activeSubject?.id ?? null}
            onChange={(id) =>
              dash.toggleSubject(id === null ? null : (chipOptions.find((s) => s.id === id)?.slug ?? null))
            }
          />
        </div>
      )}

      {/* Les huit cartes. Chacune porte sa clé de `CARD_SCOPES` : c'est elle qui décide si la
          carte répond au KPI en focus, ou si elle s'atténue. */}
      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-12">
        <WorkRhythmCard
          subjects={visibleSubjects}
          activeSubject={activeSubject}
          period={period}
          focus={focus}
          daysInactive={data.days_inactive}
          subjectNames={subjectNames}
        />
        <TimeSplitCard
          allSubjects={data.subjects}
          unattributed={data.unattributed_minutes[period] ?? 0}
          period={period}
          focus={focus}
          selectedSlug={dash.subject}
          onSelect={dash.toggleSubject}
        />
        <MemoryTrendCard
          series={sumSeries(visibleSubjects, period)}
          period={period}
          focus={focus}
        />
        <NotionsStackCard
          subjects={data.subjects}
          focus={focus}
          selectedSlug={dash.subject}
          onSelect={dash.toggleSubject}
        />
        <WhereToActCard
          subjects={data.subjects}
          period={period}
          focus={focus}
          selected={activeSubject}
          onSelect={dash.toggleSubject}
        />
        <ReviewLoadCard load={sumReviewLoad(visibleSubjects)} focus={focus} />
        <ContentChainCard stages={data.content_chain} focus={focus} />
        <ZetisReadingCard items={data.reading} focus={focus} />
      </div>
    </div>
  );
}
