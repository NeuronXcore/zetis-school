import { useCallback, useEffect, useMemo, useState } from "react";
import type { SubjectFilterOption } from "@zetis/ui";
import type {
  ActivityHeatmap,
  ActivitySessions,
  ConsolidatedSkill,
  DashboardKpis,
  KpiValue,
  OpenGap,
} from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { BackendStatus } from "../components/BackendStatus";
import { ProductionAlertCard } from "../components/ProductionAlertCard";
import { RegularityCard } from "../components/activity/RegularityCard";
import { KpiBreakdown } from "../components/activity/KpiBreakdown";
import {
  fetchConsolidatedSkills,
  fetchDashboardKpis,
  fetchHeatmap,
  fetchOpenGaps,
  fetchSessions,
} from "../lib/activity";
import { fetchSubjects } from "../lib/subjects";
import { formatDelta, formatMinutes, toLocalIso } from "../lib/heatmap";
import {
  activeMinutesByDay,
  completedMissions,
  consolidatedRows,
  openGapRows,
  sessionsByDay,
  xpByDay,
  type BreakdownRow,
} from "../lib/kpiBreakdown";
import { ALERTS, KPIS, PERIOD_LABEL, RECOMMENDATIONS, STUDENT } from "../data/mock";

// Dashboard Papa (Étape 8) — état pédagogique en une page.
//
// Six KPI, tous réels et tous dépliables sur leur détail :
// - quatre FLUX hebdomadaires (sessions, temps actif, XP, missions) avec leur écart vs semaine
//   précédente, servis par le module `activity` ;
// - deux STOCKS (lacunes ouvertes, notions consolidées) servis SANS delta par le module
//   `progress` — le modèle ne porte pas les horodatages qui permettraient de reconstituer
//   l'état d'il y a une semaine, et un `+0` laisserait croire à une semaine stable.
//
// Le mock `KPIS` ne sert plus que de repli d'affichage si le backend est injoignable.

type KpiKey =
  | "sessions"
  | "active_minutes"
  | "xp"
  | "missions"
  | "open_gaps"
  | "consolidated";

/** Le payload porte-t-il bien tous les KPI attendus ? Garde contre un backend d'une version
 *  antérieure : mieux vaut retomber sur les vignettes de repli que blanchir la page. */
export function isCompleteKpis(payload: DashboardKpis | null | undefined): payload is DashboardKpis {
  if (!payload) return false;
  const flows = [payload.sessions, payload.active_minutes, payload.xp, payload.missions_completed];
  const stocks = [payload.open_gaps, payload.consolidated_skills];
  return (
    typeof payload.week_start === "string" &&
    flows.every((kpi) => typeof kpi?.value === "number" && typeof kpi?.delta === "number") &&
    stocks.every((kpi) => typeof kpi?.value === "number")
  );
}

/** Repli mock, affiché seulement si `/api/parent/dashboard` ne répond pas ou répond incomplet. */
const FALLBACK_LABELS = [
  "Sessions (semaine)",
  "Temps actif",
  "XP (semaine)",
  "Missions terminées",
  "Lacunes ouvertes",
  "Notions consolidées",
];

export function DashboardPage() {
  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);
  const [openKpi, setOpenKpi] = useState<KpiKey | null>(null);

  // Données du détail, chargées PARESSEUSEMENT au premier dépliage puis conservées : rouvrir
  // une carte ne doit pas relancer une requête.
  const [weekDays, setWeekDays] = useState<ActivityHeatmap | null>(null);
  const [weekSessions, setWeekSessions] = useState<ActivitySessions | null>(null);
  const [gaps, setGaps] = useState<OpenGap[] | null>(null);
  const [consolidated, setConsolidated] = useState<ConsolidatedSkill[] | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    // Échec silencieux : le dashboard reste lisible même si l'activité n'est pas joignable.
    // Le payload est aussi VÉRIFIÉ avant usage : un backend d'une version antérieure (qui ne
    // sert pas encore les deux stocks) renvoie un objet incomplet, et lire `.value` dessus
    // faisait mourir toute la page en écran blanc. Décalage de version = repli, pas de crash.
    fetchDashboardKpis()
      .then((payload) => setKpis(isCompleteKpis(payload) ? payload : null))
      .catch(() => setKpis(null));
    fetchSubjects()
      .then((rows) => setSubjects(rows.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))))
      .catch(() => setSubjects([]));
  }, []);

  const weekStart = kpis?.week_start ?? null;

  /** Détail des KPI de la SEMAINE (flux). Deux requêtes, une seule fois. */
  const loadWeekDetail = useCallback(async () => {
    if (!weekStart || (weekDays && weekSessions)) return;
    setDetailLoading(true);
    try {
      // `weeks=1` = la semaine courante seule : la même route que la heatmap, bornée au strict
      // nécessaire plutôt qu'un second scan de 26 semaines.
      const [heatmap, sessions] = await Promise.all([
        fetchHeatmap(1),
        fetchSessions(weekStart, toLocalIso(new Date())),
      ]);
      setWeekDays(heatmap);
      setWeekSessions(sessions);
    } catch {
      // Le détail reste vide et le dit ; les KPI eux-mêmes restent affichés.
    } finally {
      setDetailLoading(false);
    }
  }, [weekStart, weekDays, weekSessions]);

  /** Détail des KPI de STOCK (progression). Chargé séparément : ouvrir « lacunes » n'a aucune
   *  raison de déclencher un scan de la semaine, et réciproquement. */
  const loadProgressDetail = useCallback(async () => {
    if (gaps && consolidated) return;
    setDetailLoading(true);
    try {
      const [openGaps, consolidatedSkills] = await Promise.all([
        fetchOpenGaps(),
        fetchConsolidatedSkills(),
      ]);
      setGaps(openGaps);
      setConsolidated(consolidatedSkills);
    } catch {
      setGaps([]);
      setConsolidated([]);
    } finally {
      setDetailLoading(false);
    }
  }, [gaps, consolidated]);

  function toggle(key: KpiKey) {
    setOpenKpi((current) => (current === key ? null : key));
    if (key === "open_gaps" || key === "consolidated") {
      void loadProgressDetail();
    } else {
      void loadWeekDetail();
    }
  }

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.slug, s.name])), [subjects]);
  const weekEnd = toLocalIso(new Date());

  const detail: Record<KpiKey, { title: string; rows: BreakdownRow[]; empty: string }> = {
    sessions: {
      title: "Sessions de la semaine, jour par jour",
      rows: sessionsByDay(weekSessions?.days ?? []),
      empty: "Aucune session cette semaine.",
    },
    active_minutes: {
      title: "Temps actif par jour",
      rows: weekStart ? activeMinutesByDay(weekDays?.days ?? [], weekStart, weekEnd) : [],
      empty: "Aucune minute active cette semaine.",
    },
    xp: {
      title: "XP gagné par jour",
      rows: weekStart ? xpByDay(weekDays?.days ?? [], weekStart, weekEnd) : [],
      empty: "Aucun XP gagné cette semaine.",
    },
    missions: {
      title: "Missions terminées cette semaine",
      rows: completedMissions(weekSessions?.days ?? [], subjectNames),
      empty: "Aucune mission terminée cette semaine.",
    },
    open_gaps: {
      title: "Notions à renforcer, les plus urgentes d'abord",
      rows: openGapRows(gaps ?? []),
      empty: "Aucune notion à renforcer pour le moment.",
    },
    consolidated: {
      title: "Notions consolidées (maîtrise ≥ 90 %)",
      rows: consolidatedRows(consolidated ?? []),
      empty: "Aucune notion consolidée pour le moment.",
    },
  };

  function card(
    key: KpiKey,
    label: string,
    kpi: KpiValue,
    format: (n: number) => string,
    unit = "",
  ) {
    return (
      <KpiCard
        key={label}
        label={label}
        value={format(kpi.value)}
        delta={formatDelta(kpi.delta, unit)}
        deltaDirection={kpi.delta < 0 ? "down" : "up"}
        onClick={() => toggle(key)}
        expanded={openKpi === key}
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

      {/* Le Dashboard SIGNALE, la Couverture TRAITE : une ligne, une action, rien de plus. */}
      <ProductionAlertCard />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {kpis ? (
          <>
            {card("sessions", "Sessions (semaine)", kpis.sessions, String)}
            {card("active_minutes", "Temps actif", kpis.active_minutes, formatMinutes, "min")}
            {card("xp", "XP (semaine)", kpis.xp, (n) => `+${n}`)}
            {card("missions", "Missions terminées", kpis.missions_completed, String)}
            {/* Stocks : pas de delta à passer, la carte n'en affiche donc aucun. */}
            <KpiCard
              label="Lacunes ouvertes"
              value={String(kpis.open_gaps.value)}
              onClick={() => toggle("open_gaps")}
              expanded={openKpi === "open_gaps"}
            />
            <KpiCard
              label="Notions consolidées"
              value={String(kpis.consolidated_skills.value)}
              onClick={() => toggle("consolidated")}
              expanded={openKpi === "consolidated"}
            />
          </>
        ) : (
          // Backend injoignable : on retombe sur les vignettes mock, non cliquables — mieux vaut
          // une page lisible qu'un écran vide, mais rien ne doit se faire passer pour du réel.
          KPIS.filter((k) => FALLBACK_LABELS.includes(k.label)).map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} />
          ))
        )}
      </div>

      {openKpi && (
        <KpiBreakdown
          title={detail[openKpi].title}
          rows={detail[openKpi].rows}
          emptyLabel={detail[openKpi].empty}
          loading={detailLoading}
          onClose={() => setOpenKpi(null)}
        />
      )}

      <RegularityCard subjects={subjects} />

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
