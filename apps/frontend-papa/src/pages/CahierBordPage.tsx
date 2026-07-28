import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SubjectFilterChips, type SubjectFilterOption } from "@zetis/ui";
import type { ActivitySessions } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { MonthCalendar } from "../components/activity/MonthCalendar";
import { SessionDayBlock } from "../components/activity/SessionDayBlock";
import { KpiBreakdown } from "../components/activity/KpiBreakdown";
import { fetchSessions } from "../lib/activity";
import { fetchSubjects } from "../lib/subjects";
import { formatMinutes, toLocalIso } from "../lib/heatmap";
import {
  dayActiveMinutes,
  latestDayWithSessions,
  monthRange,
  periodTotals,
  shiftMonth,
} from "../lib/sessions";
import { sessionDurations, sessionsByDay, type BreakdownRow } from "../lib/kpiBreakdown";

type CahierKpi = "sessions" | "active_minutes" | "average";

// Cahier de bord IA — vue SESSIONS (Lot 1 de la page).
//
// Montre à Papa tout ce que fait Massimo dans ZETIS : connexions, pages, leçons, activités,
// regroupées en sessions avec leur temps de travail. Les volets IA de la page (résumés de
// journal, notes parent) restent au backlog : cette vue en est le socle.
//
// Navigation par MOIS, comme on tourne les pages d'un cahier : le calendrier donne l'aperçu du
// mois, le clic sur une date ouvre le détail de ses sessions. Les sessions ne sont PAS stockées —
// le serveur les reconstruit à la lecture, le client affiche.

export function CahierBordPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Jour ciblé par le pont depuis le dashboard (`/cahier?date=AAAA-MM-JJ`).
  const targetDate = searchParams.get("date");

  // Mois affiché : celui du jour ciblé si on arrive par le pont, sinon le mois courant.
  const [anchor, setAnchor] = useState<Date>(() =>
    targetDate ? new Date(`${targetDate}T00:00:00`) : new Date(),
  );
  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(targetDate);
  const [data, setData] = useState<ActivitySessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openKpi, setOpenKpi] = useState<CahierKpi | null>(null);

  const range = useMemo(() => monthRange(anchor), [anchor]);
  const currentMonthStart = toLocalIso(new Date()).slice(0, 7);
  const canGoNext = range.from.slice(0, 7) < currentMonthStart;

  useEffect(() => {
    fetchSubjects()
      .then((rows) => setSubjects(rows.map((s) => ({ id: s.id, slug: s.slug, name: s.name }))))
      .catch(() => setSubjects([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSessions(range.from, range.to, subjectId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setError(null);
        // Sélection par défaut : le jour actif le plus récent du mois. Ouvrir un calendrier
        // sans aucun détail affiché n'apprendrait rien. Un jour explicitement ciblé (pont) ou
        // déjà choisi par Papa n'est jamais écrasé.
        setSelectedDate((current) => {
          if (current && res.days.some((day) => day.date === current)) return current;
          return latestDayWithSessions(res.days);
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range.from, range.to, subjectId]);

  const subjectNames = useMemo(() => new Map(subjects.map((s) => [s.slug, s.name])), [subjects]);
  const totals = periodTotals(data?.days ?? []);
  const selectedDay = data?.days.find((day) => day.date === selectedDate);

  // Détail des KPI : tout se calcule depuis le mois DÉJÀ chargé — aucune requête supplémentaire,
  // et donc aucun risque d'afficher un détail qui divergerait du total juste au-dessus.
  const kpiDetail: Record<CahierKpi, { title: string; rows: BreakdownRow[]; empty: string }> = {
    sessions: {
      title: "Sessions du mois, jour par jour",
      rows: sessionsByDay(data?.days ?? []),
      empty: "Aucune session ce mois-ci.",
    },
    active_minutes: {
      title: "Temps actif par jour",
      rows: sessionsByDay(data?.days ?? []).map((row) => {
        const day = data?.days.find((d) => d.date === row.key);
        const minutes = day ? dayActiveMinutes(day) : 0;
        return { ...row, value: minutes, display: minutes > 0 ? `${minutes} min` : "—" };
      }),
      empty: "Aucune minute active ce mois-ci.",
    },
    average: {
      title: "Durée de chaque session, de la plus longue à la plus courte",
      rows: sessionDurations(data?.days ?? []),
      empty: "Aucune session à comparer ce mois-ci.",
    },
  };

  function toggleKpi(key: CahierKpi) {
    setOpenKpi((current) => (current === key ? null : key));
  }

  /** Sortir du jour ciblé : la vue ne doit pas rester commandée par un lien dont on vient de
   *  sortir (changement de mois, de matière, ou choix d'une autre date). */
  function clearTarget() {
    if (targetDate) setSearchParams({}, { replace: true });
  }

  function handleShiftMonth(offset: number) {
    setAnchor((current) => shiftMonth(current, offset));
    setSelectedDate(null); // la sélection appartient au mois qu'on quitte
    clearTarget();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Cahier de bord — sessions"
        subtitle="Connexions, pages, leçons, activités — regroupées en sessions avec leur temps de travail."
      />

      <div className="grid grid-cols-3 gap-4">
        <KpiCard
          label="Sessions du mois"
          value={String(totals.sessions)}
          onClick={() => toggleKpi("sessions")}
          expanded={openKpi === "sessions"}
        />
        <KpiCard
          label="Temps actif total"
          value={formatMinutes(totals.activeMinutes)}
          onClick={() => toggleKpi("active_minutes")}
          expanded={openKpi === "active_minutes"}
        />
        <KpiCard
          label="Moyenne par session"
          value={totals.sessions > 0 ? `${totals.averageMinutes} min` : "—"}
          onClick={() => toggleKpi("average")}
          expanded={openKpi === "average"}
        />
      </div>

      {openKpi && (
        <KpiBreakdown
          title={kpiDetail[openKpi].title}
          rows={kpiDetail[openKpi].rows}
          emptyLabel={kpiDetail[openKpi].empty}
          onClose={() => setOpenKpi(null)}
        />
      )}

      {subjects.length > 0 && (
        <SubjectFilterChips
          subjects={subjects}
          value={subjectId}
          onChange={(next) => {
            setSubjectId(next);
            clearTarget();
          }}
          className="mt-4"
        />
      )}

      <section className="mt-4 rounded-xl border border-papa-border bg-papa-surface p-5">
        {error && <p className="mb-3 text-sm text-papa-warn">{error}</p>}

        <MonthCalendar
          days={data?.days ?? []}
          anchor={anchor}
          selectedDate={selectedDate}
          onSelectDay={(date) => {
            setSelectedDate(date);
            clearTarget();
          }}
          onShiftMonth={handleShiftMonth}
          canGoNext={canGoNext}
        />

        <div className="mt-4 border-t border-papa-border pt-4">
          {loading && <p className="text-sm text-papa-muted">Chargement des sessions…</p>}

          {!loading && !error && totals.sessions === 0 && (
            <p className="py-4 text-center text-sm text-papa-muted">
              Aucune session ce mois-ci{subjectId != null ? " pour cette matière" : ""}. Change de
              mois pour remonter plus loin.
            </p>
          )}

          {!loading && !error && totals.sessions > 0 && !selectedDay && (
            <p className="py-4 text-center text-sm italic text-papa-muted">
              Clique une date du calendrier pour voir le détail de ses sessions.
            </p>
          )}

          {!loading && !error && selectedDay && (
            <SessionDayBlock
              day={selectedDay}
              subjectNames={subjectNames}
              filtered={subjectId != null}
            />
          )}
        </div>

        <p className="mt-3.5 border-t border-papa-border pt-2.5 text-xs text-papa-muted">
          Sessions reconstruites côté serveur : des événements espacés de moins de 15 min forment
          une session. Le temps actif somme les écarts entre interactions, plafonnés à 5 min —
          c'est un indicateur de <strong>présence</strong>, pas une mesure d'attention.
        </p>
      </section>
    </div>
  );
}
