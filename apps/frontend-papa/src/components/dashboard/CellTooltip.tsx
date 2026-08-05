import { subjectColorFor } from "@zetis/ui";
import type { SlotCell } from "../../lib/dashboardDerive";

// Bulle de détail d'une case ventilée par matière — partagée par la semaine type (créneaux) et la
// semaine en cours. Les deux montrent la même chose : un total, puis qui l'a rempli. Deux bulles
// dessinées séparément auraient fini par diverger.
//
// ── `position: fixed`, et c'est délibéré ────────────────────────────────────────────────────────
// Les grilles vivent dans un `overflow-x-auto`, et `overflow-x` sur un axe force l'autre à `auto` :
// une bulle en absolu serait rognée EN HAUT ET EN BAS par le conteneur de défilement. Le `fixed`
// échappe au rognage — l'`overflow` d'un ancêtre ne clippe pas un descendant fixé.

/** Case survolée (ou au focus clavier) et l'ancre de sa bulle, en coordonnées écran. */
export interface HoveredCell {
  title: string;
  parts: SlotCell["parts"];
  total: number;
  x: number;
  y: number;
}

/** Ancre une bulle sous l'élément visé, en coordonnées écran. */
export function anchorFor(target: HTMLElement): Pick<HoveredCell, "x" | "y"> {
  const r = target.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.bottom + 6 };
}

/** `aria-hidden` : la même information est déjà dans l'`aria-label` de la case, qui est ce que lit
 *  un lecteur d'écran au focus. L'annoncer deux fois ferait bégayer la grille. */
export function CellTooltip({ title, parts, total, x, y }: HoveredCell) {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 -translate-x-1/2 rounded-lg border border-papa-border bg-papa-bg/95 px-3 py-2 shadow-[0_8px_24px_rgb(0_0_0/55%)] backdrop-blur-sm"
      style={{
        // Bornée à l'écran : sur la colonne « Dim », une bulle centrée sortirait à droite.
        left: Math.min(Math.max(x, 96), window.innerWidth - 96),
        top: y,
      }}
    >
      <p className="mb-1.5 font-mono text-[11px] font-semibold text-papa-text">
        {title} · {total} min
      </p>
      <ul className="flex flex-col gap-1">
        {parts.map((part) => (
          <li key={part.slug} className="flex items-center gap-2 whitespace-nowrap text-[11px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: part.color ?? subjectColorFor(part.slug, null) }}
            />
            <span className="flex-1 text-papa-muted">{part.name}</span>
            <span className="font-mono text-papa-text">{part.minutes} min</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
