import type { ActivitySessionDay } from "@zetis/types";
import { buildMonthGrid, monthLabel, type MonthCell } from "../../lib/sessions";

// Calendrier du mois : une page du cahier. Chaque date porte son intensité d'activité et
// s'ouvre au clic sur le détail de ses sessions.
//
// Granularité MOIS, à distinguer de la heatmap du dashboard (26 semaines) : celle-ci répond à
// « Massimo est-il régulier ? », celui-ci à « que s'est-il passé le 6 ? ».
//
// Grille CSS pure, aucune lib de calendrier : sept colonnes et des cases.

const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

/** Fond de case selon les minutes actives. Teintes TRANSPARENTES (et non les aplats de la
 *  heatmap) : le numéro du jour doit rester lisible par-dessus, ce qu'un emerald-300 plein
 *  interdirait. */
function tint(cell: MonthCell): string {
  if (cell.sessions === 0) return "bg-transparent";
  if (cell.activeMinutes < 10) return "bg-emerald-500/15";
  if (cell.activeMinutes < 20) return "bg-emerald-500/30";
  if (cell.activeMinutes < 40) return "bg-emerald-500/45";
  return "bg-emerald-500/65";
}

interface MonthCalendarProps {
  days: ActivitySessionDay[];
  anchor: Date;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  onShiftMonth: (offset: number) => void;
  /** Interdit d'avancer au-delà du mois courant : le futur n'a pas de journal. */
  canGoNext: boolean;
}

export function MonthCalendar({
  days,
  anchor,
  selectedDate,
  onSelectDay,
  onShiftMonth,
  canGoNext,
}: MonthCalendarProps) {
  const weeks = buildMonthGrid(days, anchor);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => onShiftMonth(-1)}
          aria-label="Mois précédent"
          className="rounded-lg border border-papa-border px-2.5 py-1 text-sm text-papa-muted hover:border-papa-accent hover:text-papa-text"
        >
          ←
        </button>
        <b className="text-sm first-letter:uppercase">{monthLabel(anchor)}</b>
        <button
          type="button"
          onClick={() => onShiftMonth(1)}
          disabled={!canGoNext}
          aria-label="Mois suivant"
          className="rounded-lg border border-papa-border px-2.5 py-1 text-sm text-papa-muted hover:border-papa-accent hover:text-papa-text disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-papa-border"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-papa-muted">
        {DOW.map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {weeks.flat().map((cell) => {
          // Jours des mois voisins : présents pour l'alignement des colonnes, mais inertes.
          if (!cell.inMonth) {
            return <span key={cell.date} className="h-14 rounded-lg" />;
          }
          const label =
            cell.sessions > 0
              ? `${cell.dayOfMonth} — ${cell.sessions} session${cell.sessions > 1 ? "s" : ""}, ${cell.activeMinutes} min actives`
              : `${cell.dayOfMonth} — aucune session`;
          return (
            <button
              key={cell.date}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={selectedDate === cell.date}
              onClick={() => onSelectDay(cell.date)}
              className={`flex h-14 flex-col items-start justify-between rounded-lg border p-1.5 text-left transition-colors ${tint(cell)} ${
                selectedDate === cell.date
                  ? "border-papa-accent ring-1 ring-papa-accent"
                  : "border-papa-border hover:border-papa-accent/60"
              } ${cell.future ? "opacity-40" : ""}`}
            >
              <span className="text-xs font-semibold tabular-nums">{cell.dayOfMonth}</span>
              {cell.sessions > 0 && (
                <span className="text-[10px] leading-tight text-papa-text/80">
                  {cell.activeMinutes} min
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
