import { useState } from "react";
import { subjectColorFor } from "@zetis/ui";
import type { WeekDay } from "../../lib/dashboardDerive";
import { formatMinutes } from "../../lib/heatmap";
import { anchorFor, CellTooltip, type HoveredCell } from "./CellTooltip";

// « Semaine en cours » — la vraie semaine, datée, celle qui contient aujourd'hui.
//
// Elle existe parce que la semaine type se lit à tort comme un calendrier : des en-têtes `Lun…Dim`
// au-dessus d'une fenêtre glissante repliée, et une case remplie un jeudi passe pour une
// prédiction. Les deux vues répondent à deux questions différentes — « quelle habitude ? » et
// « qu'a-t-il fait cette semaine ? » — et cohabitent désormais dans la même carte.
//
// PAS de découpage horaire ici, et ce n'est pas un oubli : `slots` est déjà replié par jour de
// semaine côté serveur et a perdu les dates. Cette vue est bâtie sur `calendar`, qui porte les
// minutes par DATE mais pas par heure. Le dire dans la note plutôt que de laisser croire à un
// manque.
//
// Un jour à venir n'est pas un jour à zéro : il est marqué « à venir », sans barre ni chiffre.
// Afficher « 0 min » sur un vendredi qu'on n'a pas encore vécu se lirait comme un reproche.

interface CurrentWeekBarsProps {
  days: WeekDay[];
}

export function CurrentWeekBars({ days }: CurrentWeekBarsProps) {
  const [hovered, setHovered] = useState<HoveredCell | null>(null);
  const max = days.reduce((m, day) => Math.max(m, day.total), 0);

  // Légende bâtie sur ce qui est RÉELLEMENT tracé, comme dans la semaine type.
  const legend = new Map<string, { name: string; color: string | null }>();
  for (const day of days) {
    for (const part of day.parts) {
      if (!legend.has(part.slug)) legend.set(part.slug, { name: part.name, color: part.color });
    }
  }

  return (
    <div>
      <ul className="flex flex-col gap-1">
        {days.map((day) => {
          const detail = day.isFuture
            ? "à venir"
            : day.total > 0
              ? `${formatMinutes(day.total)} — ${day.parts.map((p) => `${p.name} ${p.minutes}`).join(", ")}`
              : "aucune séance";
          const text = `${day.label} ${day.dayOfMonth} — ${detail}`;
          const ouvrable = day.total > 0;

          return (
            <li
              key={day.date}
              title={ouvrable ? undefined : text}
              aria-label={text}
              tabIndex={ouvrable ? 0 : undefined}
              onMouseEnter={
                ouvrable
                  ? (e) =>
                      setHovered({
                        title: `${day.label} ${day.dayOfMonth}`,
                        parts: day.parts,
                        total: day.total,
                        ...anchorFor(e.currentTarget),
                      })
                  : undefined
              }
              onMouseLeave={ouvrable ? () => setHovered(null) : undefined}
              onFocus={
                ouvrable
                  ? (e) =>
                      setHovered({
                        title: `${day.label} ${day.dayOfMonth}`,
                        parts: day.parts,
                        total: day.total,
                        ...anchorFor(e.currentTarget),
                      })
                  : undefined
              }
              onBlur={ouvrable ? () => setHovered(null) : undefined}
              className={`grid items-center gap-2 rounded-md px-1 py-0.5 ${
                ouvrable ? "cursor-help outline-offset-1 focus-visible:outline focus-visible:outline-papa-accent" : ""
              } ${day.isToday ? "bg-papa-surface-2/60" : ""}`}
              style={{ gridTemplateColumns: "62px 1fr 62px" }}
            >
              <span
                className={`font-mono text-[11px] ${day.isToday ? "font-bold text-papa-accent" : "text-papa-muted"}`}
              >
                {day.label} {day.dayOfMonth}
                {/* Aujourd'hui est nommé, pas seulement teinté : la couleur seule ne dirait rien à
                    qui ne la perçoit pas, et « aujourd'hui » est le repère de toute la vue. */}
                {day.isToday && <span className="sr-only"> — aujourd'hui</span>}
              </span>

              <span className="flex h-5 items-stretch overflow-hidden rounded-[5px] bg-papa-surface-2">
                {day.total > 0 && max > 0 && (
                  <span className="flex h-full" style={{ width: `${(day.total / max) * 100}%` }}>
                    {day.parts.map((part) => (
                      <span
                        key={part.slug}
                        className="h-full"
                        style={{
                          width: `${(part.minutes / day.total) * 100}%`,
                          background: part.color ?? subjectColorFor(part.slug, null),
                        }}
                      />
                    ))}
                  </span>
                )}
              </span>

              <span
                className={`text-right font-mono text-[11px] ${
                  day.isFuture ? "italic text-papa-muted/60" : "text-papa-text"
                }`}
              >
                {day.isFuture ? "à venir" : day.total > 0 ? formatMinutes(day.total) : "—"}
              </span>
            </li>
          );
        })}
      </ul>

      {hovered && <CellTooltip {...hovered} />}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[11px] text-papa-muted">
        {[...legend.entries()].map(([slug, { name, color }]) => (
          <span key={slug} className="inline-flex items-center gap-1.5">
            <span
              className="h-[11px] w-[11px] shrink-0 rounded-[3px]"
              style={{ background: color ?? subjectColorFor(slug, null) }}
            />
            {name}
          </span>
        ))}
        <span className="italic">longueur = minutes du jour</span>
      </div>
    </div>
  );
}
