import type { ActivitySessionDay } from "@zetis/types";
import { formatLongDate } from "../../lib/heatmap";
import { dayActiveMinutes } from "../../lib/sessions";
import { ActivityEntryRow } from "./ActivityEntryRow";

// Un jour de la vue Sessions : en-tête + une carte par session.
//
// Les jours SANS session sont affichés explicitement plutôt que masqués : l'absence d'activité
// est une information pour Papa, un trou dans la liste n'en serait pas une.

interface SessionDayBlockProps {
  day: ActivitySessionDay;
  subjectNames: Map<string, string>;
  /** Un filtre matière est actif : le nuance le message d'absence. */
  filtered: boolean;
  /** Jour ciblé par le pont depuis le dashboard : mis en évidence. */
  highlighted?: boolean;
}

export function SessionDayBlock({
  day,
  subjectNames,
  filtered,
  highlighted = false,
}: SessionDayBlockProps) {
  const minutes = dayActiveMinutes(day);
  const count = day.sessions.length;

  return (
    <div
      id={`jour-${day.date}`}
      className={`border-t border-papa-border py-3.5 first:border-t-0 first:pt-0 ${
        highlighted ? "-mx-3 rounded-lg bg-papa-surface-2/60 px-3" : ""
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* `first-letter` et non `capitalize` : en français, seul le jour prend la majuscule. */}
        <b className="text-sm first-letter:uppercase">{formatLongDate(day.date)}</b>
        {count > 0 ? (
          <span className="text-xs text-papa-muted">
            {count} session{count > 1 ? "s" : ""} · {minutes} min actives
          </span>
        ) : (
          <span className="text-xs italic text-papa-muted">
            aucune session{filtered ? " pour cette matière" : ""}
          </span>
        )}
      </div>

      {day.sessions.map((session) => (
        <div
          key={session.started_at}
          className="mt-2.5 rounded-xl border border-papa-border bg-papa-surface-2/40 px-4 py-3"
        >
          <div className="mb-2 flex items-baseline justify-between gap-3">
            {/* Bornes déjà formatées en Europe/Paris par le serveur : les reformater depuis
                `started_at` (UTC) suivrait le fuseau du navigateur et pourrait contredire
                l'heure des événements listés juste en dessous. */}
            <b className="text-sm tabular-nums">
              {session.started_time} → {session.ended_time}
            </b>
            <span className="rounded-full bg-papa-accent/15 px-2.5 py-0.5 text-xs font-semibold text-papa-accent">
              {session.active_minutes} min actives
            </span>
          </div>
          {session.events.map((entry, index) => (
            <ActivityEntryRow
              key={`${entry.time}-${entry.event_type}-${index}`}
              entry={entry}
              subjectNames={subjectNames}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
