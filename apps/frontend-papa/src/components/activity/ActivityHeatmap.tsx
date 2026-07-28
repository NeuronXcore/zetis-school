import { HEAT_CLASSES, buildHeatmapGrid, formatLongDate, monthLabels } from "../../lib/heatmap";
import type { ActivityHeatmapDay } from "@zetis/types";

// Grille type calendrier, 26 semaines × 7 jours (lundi en haut), en CSS pur — aucune lib de
// calendrier : c'est une grille de carrés, pas un composant de date.
//
// L'intensité encode les MINUTES ACTIVES, jamais le nombre d'événements : une lecture de cours de
// 20 min vaut plus qu'un clic, et compter les événements biaiserait en faveur des révisions SRS
// (une carte = un événement).

interface ActivityHeatmapProps {
  days: ActivityHeatmapDay[];
  weeks?: number;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
}

const DOW_LABELS = ["Lun", "", "Mer", "", "Ven", "", ""];

export function ActivityHeatmap({
  days,
  weeks = 26,
  selectedDate,
  onSelectDay,
}: ActivityHeatmapProps) {
  const grid = buildHeatmapGrid(days, new Date(), weeks);
  const months = monthLabels(grid);

  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-max">
        {/* En-tête des mois : une colonne par semaine, alignée sur la grille. */}
        <div
          className="mb-1 ml-9 grid text-[11px] text-papa-muted"
          style={{ gridTemplateColumns: `repeat(${weeks}, 16px)` }}
        >
          {months.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="grid grid-rows-7 gap-[3px] text-[11px] leading-[13px] text-papa-muted">
            {DOW_LABELS.map((label, index) => (
              <span key={index} className="h-[13px]">
                {label}
              </span>
            ))}
          </div>

          <div className="grid grid-flow-col grid-rows-7 gap-[3px]">
            {grid.flatMap((column) =>
              column.map((cell) => {
                if (cell.future) {
                  // Jour à venir : simple réserve d'espace, sans bordure ni interaction.
                  return <span key={cell.date} className="h-[13px] w-[13px]" />;
                }
                const title = `${formatLongDate(cell.date)} — ${
                  cell.activeMinutes > 0 ? `${cell.activeMinutes} min actives` : "aucune activité"
                }`;
                return (
                  <button
                    key={cell.date}
                    type="button"
                    title={title}
                    aria-label={title}
                    aria-pressed={selectedDate === cell.date}
                    onClick={() => onSelectDay(cell.date)}
                    className={`h-[13px] w-[13px] rounded-[3px] ${HEAT_CLASSES[cell.level]} ${
                      selectedDate === cell.date
                        ? "outline outline-2 outline-offset-1 outline-papa-text"
                        : ""
                    }`}
                  />
                );
              }),
            )}
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-end gap-1.5 text-xs text-papa-muted">
          <span>0</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <span key={level} className={`h-[13px] w-[13px] rounded-[3px] ${HEAT_CLASSES[level]}`} />
          ))}
          <span>40 min+</span>
        </div>
      </div>
    </div>
  );
}
