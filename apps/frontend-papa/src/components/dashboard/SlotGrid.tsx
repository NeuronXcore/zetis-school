import { useState } from "react";
import { subjectColorFor } from "@zetis/ui";
import { maxSlotCell, type SlotCell } from "../../lib/dashboardDerive";

// Semaine type : 8 créneaux de 2 h (8 h → 24 h) × 7 jours, en CSS Grid pur.
//
// 8 h → 24 h et non 8 h → 22 h : la maquette porte huit étiquettes dont la dernière est 22 h,
// donc la plage va jusqu'à minuit (adr-0028 §6). Les minutes de 0 h à 8 h ne sont pas dans cette
// grille — elles sont annoncées en note plutôt que repliées dans un créneau qui les daterait
// faussement.
//
// ── La case est une BARRE, plus un aplat vert ───────────────────────────────────────────────────
// Sa LONGUEUR dit l'intensité (case pleine = le créneau le plus chargé de la semaine), ses
// SEGMENTS disent quelles matières s'y partagent le temps. Deux informations, deux canaux : la
// couleur ne peut pas dire à la fois « combien » et « laquelle ».
//
// C'est un écart assumé avec la vue Calendrier, qui garde son échelle verte : là-bas une case est
// UN JOUR, et un jour n'a pas de composition à montrer. Ici la question posée est « quand
// travaille-t-il, et à quoi » — la seconde moitié était invisible tant que tout était vert.
//
// L'échelle est RELATIVE au maximum de la grille, pas absolue : une semaine type se lit en
// comparant ses créneaux entre eux, et un seuil fixe écraserait toutes les cases d'un enfant qui
// travaille par sessions courtes.
//
// ── L'infobulle est en `position: fixed`, et c'est délibéré ─────────────────────────────────────
// La grille vit dans un `overflow-x-auto`, et `overflow-x` sur un axe force l'autre à `auto` : une
// bulle en absolu serait rognée EN HAUT ET EN BAS par le conteneur de défilement. Le `fixed`
// échappe au rognage — l'`overflow` d'un ancêtre ne clippe pas un descendant fixé.
// Une seule bulle dans le DOM, pas 56 : c'est l'état qui dit laquelle est ouverte.

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const SLOT_LABELS = ["8 h", "10 h", "12 h", "14 h", "16 h", "18 h", "20 h", "22 h"];

interface SlotGridProps {
  /** Grille 8 × 7, chaque case ventilée par matière. */
  cells: SlotCell[][];
  /** Écrire les minutes DANS les cases non vides. Réservé au cas filtré : sans filtre, 56 nombres
   *  additionnant des matières différentes se liraient moins bien que les couleurs elles-mêmes. */
  showValues: boolean;
}

/** Case survolée (ou au focus clavier) et l'ancre de sa bulle, en coordonnées écran. */
interface HoveredSlot {
  title: string;
  cell: SlotCell;
  x: number;
  y: number;
}

export function SlotGrid({ cells, showValues }: SlotGridProps) {
  const [hovered, setHovered] = useState<HoveredSlot | null>(null);
  const max = maxSlotCell(cells);

  // Légende construite depuis ce qui est RÉELLEMENT tracé : lister les matières du programme
  // ferait une légende de couleurs qu'on ne trouve nulle part dans la grille.
  const legend = new Map<string, { name: string; color: string | null }>();
  for (const row of cells) {
    for (const cell of row) {
      for (const part of cell.parts) {
        if (!legend.has(part.slug)) legend.set(part.slug, { name: part.name, color: part.color });
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-1" style={{ gridTemplateColumns: "38px repeat(7, 1fr)" }}>
        <span />
        {DAYS.map((day) => (
          <span key={day} className="pb-0.5 text-center font-mono text-[11px] text-papa-muted">
            {day}
          </span>
        ))}

        {cells.map((row, slot) => (
          <Row
            key={slot}
            label={SLOT_LABELS[slot]}
            cells={row}
            max={max}
            showValues={showValues}
            onHover={setHovered}
          />
        ))}
      </div>

      {hovered && <SlotTooltip {...hovered} />}

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
        <span className="italic">longueur = minutes du créneau</span>
      </div>
    </div>
  );
}

/** Bulle de détail d'un créneau : le créneau, puis une ligne par matière avec sa couleur.
 *
 *  `aria-hidden` : la même information est déjà dans l'`aria-label` de la case, qui est ce que lit
 *  un lecteur d'écran au focus. L'annoncer deux fois ferait bégayer la grille. */
function SlotTooltip({ title, cell, x, y }: HoveredSlot) {
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
        {title} · {cell.total} min
      </p>
      <ul className="flex flex-col gap-1">
        {cell.parts.map((part) => (
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

function Row({
  label,
  cells,
  max,
  showValues,
  onHover,
}: {
  label: string;
  cells: SlotCell[];
  max: number;
  showValues: boolean;
  onHover: (slot: HoveredSlot | null) => void;
}) {
  return (
    <>
      <span className="flex items-center justify-end pr-1.5 font-mono text-[11px] text-papa-muted">
        {label}
      </span>
      {cells.map((cell, day) => {
        // Le `title` porte la valeur ET la ventilation : l'information ne doit jamais tenir à la
        // seule couleur, et depuis que la couleur nomme une matière, la ventilation en fait partie.
        const detail =
          cell.total > 0
            ? `${cell.total} min en moyenne — ${cell.parts
                .map((p) => `${p.name} ${p.minutes}`)
                .join(", ")}`
            : "aucune séance";
        const text = `${DAYS[day]} ${label} — ${detail}`;
        const ouvrable = cell.total > 0;

        const ouvrir = (cible: HTMLElement) => {
          const r = cible.getBoundingClientRect();
          onHover({ title: `${DAYS[day]} ${label}`, cell, x: r.left + r.width / 2, y: r.bottom + 6 });
        };

        return (
          <span
            key={day}
            // `title` natif RETIRÉ sur les cases ouvrables : le navigateur superposerait sa propre
            // bulle grise à la nôtre, une seconde plus tard. Il reste sur les cases vides, qui
            // n'ouvrent rien. L'`aria-label`, lui, ne bouge pas — c'est par lui que l'information
            // existe pour qui n'a ni souris ni écran.
            title={ouvrable ? undefined : text}
            aria-label={text}
            // Seules les cases qui ont quelque chose à dire prennent le focus : rendre les 56
            // tabulables ferait traverser huit rangées de vide au clavier.
            tabIndex={ouvrable ? 0 : undefined}
            onMouseEnter={ouvrable ? (e) => ouvrir(e.currentTarget) : undefined}
            onMouseLeave={ouvrable ? () => onHover(null) : undefined}
            onFocus={ouvrable ? (e) => ouvrir(e.currentTarget) : undefined}
            onBlur={ouvrable ? () => onHover(null) : undefined}
            // Le fond de piste reste visible même à zéro : l'absence d'activité est une
            // information, elle ne doit pas se confondre avec l'absence de case.
            className={`relative flex h-6 items-stretch overflow-hidden rounded-[5px] bg-papa-surface-2 ${
              ouvrable ? "cursor-help outline-offset-1 focus-visible:outline focus-visible:outline-papa-accent" : ""
            }`}
          >
            {cell.total > 0 && max > 0 && (
              <span className="flex h-full" style={{ width: `${(cell.total / max) * 100}%` }}>
                {cell.parts.map((part) => (
                  <span
                    key={part.slug}
                    className="h-full"
                    style={{
                      width: `${(part.minutes / cell.total) * 100}%`,
                      background: part.color ?? subjectColorFor(part.slug, null),
                    }}
                  />
                ))}
              </span>
            )}

            {showValues && cell.total > 0 && (
              // Ombre portée et non une couleur choisie : le nombre passe au-dessus de la barre
              // comme du fond de piste selon la longueur, et aucune couleur unique n'est lisible
              // sur les deux.
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-semibold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.9)]">
                {cell.total}
              </span>
            )}
          </span>
        );
      })}
    </>
  );
}
