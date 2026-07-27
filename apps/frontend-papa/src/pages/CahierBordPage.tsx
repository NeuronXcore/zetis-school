import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SubjectFilterChips, type SubjectFilterOption } from "@zetis/ui";
import type { ActivitySessions } from "@zetis/types";
import { PageHeader } from "../components/PageHeader";
import { KpiCard } from "../components/KpiCard";
import { SessionDayBlock } from "../components/activity/SessionDayBlock";
import { fetchSessions } from "../lib/activity";
import { fetchSubjects } from "../lib/subjects";
import { formatMinutes } from "../lib/heatmap";
import {
  PERIOD_DAYS,
  type PeriodDays,
  periodRange,
  periodRangeForDate,
  periodTotals,
} from "../lib/sessions";

// Cahier de bord IA — vue SESSIONS (Lot 1 de la page).
//
// Montre à Papa tout ce que fait Massimo dans ZETIS : connexions, pages, leçons, activités,
// regroupées en sessions avec leur temps de travail. Les volets IA de la page (résumés de
// journal, notes parent) restent au backlog : cette vue en est le socle.
//
// Les sessions ne sont PAS stockées : le serveur les reconstruit à la lecture. Le client affiche.

const DEFAULT_PERIOD: PeriodDays = 7;

export function CahierBordPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  // Jour ciblé par le pont depuis le dashboard (`/cahier?date=AAAA-MM-JJ`).
  const targetDate = searchParams.get("date");

  const [period, setPeriod] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [subjects, setSubjects] = useState<SubjectFilterOption[]>([]);
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [data, setData] = useState<ActivitySessions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // La période chargée dépend du jour ciblé : arriver depuis le dashboard doit montrer CE jour,
  // pas la semaine en cours.
  const range = useMemo(
    () => (targetDate ? periodRangeForDate(targetDate, period) : periodRange(period)),
    [targetDate, period],
  );

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
        if (!cancelled) {
          setData(res);
          setError(null);
        }
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

  // Positionnement sur le jour ciblé, une fois ses blocs rendus.
  useEffect(() => {
    if (!targetDate || !data) return;
    document
      .getElementById(`jour-${targetDate}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [targetDate, data]);

  const subjectNames = useMemo(
    () => new Map(subjects.map((s) => [s.slug, s.name])),
    [subjects],
  );
  const totals = periodTotals(data?.days ?? []);
  const isEmpty = totals.sessions === 0;

  /** Changer de filtre relâche le jour ciblé : la période affichée ne doit pas rester
   *  commandée par un lien dont on vient de sortir. */
  function clearTarget() {
    if (targetDate) setSearchParams({}, { replace: true });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Cahier de bord — sessions"
        subtitle="Connexions, pages, leçons, activités — regroupées en sessions avec leur temps de travail."
      />

      <div className="grid grid-cols-3 gap-4">
        <KpiCard label="Sessions sur la période" value={String(totals.sessions)} />
        <KpiCard label="Temps actif total" value={formatMinutes(totals.activeMinutes)} />
        <KpiCard
          label="Moyenne par session"
          value={totals.sessions > 0 ? `${totals.averageMinutes} min` : "—"}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PERIOD_DAYS.map((days) => (
          <button
            key={days}
            type="button"
            aria-pressed={period === days}
            onClick={() => {
              setPeriod(days);
              clearTarget();
            }}
            className={`rounded-full border px-3.5 py-1 text-sm transition-colors ${
              period === days
                ? "border-papa-accent bg-papa-accent/10 font-semibold text-papa-accent"
                : "border-papa-border text-papa-muted hover:border-papa-accent/60"
            }`}
          >
            {days} jours
          </button>
        ))}
      </div>

      {subjects.length > 0 && (
        <SubjectFilterChips
          subjects={subjects}
          value={subjectId}
          onChange={(next) => {
            setSubjectId(next);
            clearTarget();
          }}
          className="mt-3"
        />
      )}

      <section className="mt-4 rounded-xl border border-papa-border bg-papa-surface p-5">
        {loading && <p className="text-sm text-papa-muted">Chargement des sessions…</p>}
        {error && <p className="text-sm text-papa-warn">{error}</p>}

        {!loading && !error && isEmpty && (
          <p className="py-6 text-center text-sm text-papa-muted">
            Aucune session sur cette période
            {subjectId != null ? " pour cette matière" : ""}. Massimo n'a pas travaillé dans ZETIS
            sur cet intervalle — élargis la période pour remonter plus loin.
          </p>
        )}

        {!loading &&
          !error &&
          !isEmpty &&
          data?.days.map((day) => (
            <SessionDayBlock
              key={day.date}
              day={day}
              subjectNames={subjectNames}
              filtered={subjectId != null}
              highlighted={day.date === targetDate}
            />
          ))}

        <p className="mt-3.5 border-t border-papa-border pt-2.5 text-xs text-papa-muted">
          Sessions reconstruites côté serveur : des événements espacés de moins de 15 min forment
          une session. Le temps actif somme les écarts entre interactions, plafonnés à 5 min —
          c'est un indicateur de <strong>présence</strong>, pas une mesure d'attention.
        </p>
      </section>
    </div>
  );
}
