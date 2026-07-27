import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { ActivityDayDetail, ActivityHeatmapDay } from "@zetis/types";
import { fetchDayDetail } from "../../lib/activity";
import { formatLongDate } from "../../lib/heatmap";
import { ActivityEntryRow } from "./ActivityEntryRow";

// Panneau détail-jour, INLINE sous la grille (pas de modale) : Papa compare plusieurs jours
// sans perdre le contexte de la heatmap. Le journal est chargé PARESSEUSEMENT, au clic.
//
// Les chiffres d'en-tête (minutes, XP) viennent de la case de heatmap déjà servie par le
// serveur — on ne les recalcule pas depuis la liste d'événements.

interface DayDetailPanelProps {
  date: string;
  /** La case correspondante de la heatmap (déjà chargée) : minutes actives et XP du jour. */
  summary: ActivityHeatmapDay | undefined;
  subjectId: number | null;
  /** slug → nom affichable. Le serveur sert le slug (identifiant stable) ; Papa lit
   *  « Mathématiques », pas « mathematiques ». Pure présentation. */
  subjectNames: Map<string, string>;
}

export function DayDetailPanel({
  date,
  summary,
  subjectId,
  subjectNames,
}: DayDetailPanelProps) {
  const [detail, setDetail] = useState<ActivityDayDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchDayDetail(date, subjectId)
      .then((data) => {
        if (!cancelled) setDetail(data);
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
  }, [date, subjectId]);

  return (
    <div className="mt-4 border-t border-papa-border pt-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {/* `first-letter` et non `capitalize` : en français seul le jour prend la majuscule
            (« Lundi 6 juillet »), pas le mois. */}
        <b className="text-sm first-letter:uppercase">{formatLongDate(date)}</b>
        <span className="text-xs text-papa-muted">
          {summary && summary.active_minutes > 0
            ? `${summary.active_minutes} min actives${summary.xp ? ` · +${summary.xp} XP` : ""}`
            : "aucune activité"}
          {subjectId != null && " · filtré par matière"}
        </span>
      </div>

      {loading && <p className="text-sm text-papa-muted">Chargement du journal…</p>}
      {error && <p className="text-sm text-papa-warn">{error}</p>}

      {!loading && !error && detail && detail.events.length === 0 && (
        <p className="text-sm italic text-papa-muted">
          {subjectId != null ? "Aucune activité pour cette matière." : "Aucune activité ce jour-là."}
        </p>
      )}

      {!loading &&
        !error &&
        detail?.events.map((event, index) => (
          <ActivityEntryRow
            key={`${event.time}-${event.event_type}-${index}`}
            entry={event}
            subjectNames={subjectNames}
          />
        ))}

      {/* Pont vers le cahier de bord : la vue Sessions du même jour, avec ses bornes horaires. */}
      {!loading && !error && detail && detail.events.length > 0 && (
        <div className="mt-3">
          <Link
            to={`/cahier?date=${date}`}
            className="inline-block rounded-lg border border-papa-border px-3.5 py-2 text-sm font-medium hover:border-papa-accent"
          >
            Ouvrir dans le cahier de bord →
          </Link>
        </div>
      )}
    </div>
  );
}
