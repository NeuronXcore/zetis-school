import { buildSparseCalendar } from "@zetis/ui";
import type { XpHistoryDay } from "../../lib/gamification";

// « Mon ciel » — les jours de gain posés sur un CALENDRIER (addendum ADR-0024 « Accueil vivant »).
//
// Semaines en colonnes, jours en lignes (lundi en haut) : la même lecture d'un coup d'œil qu'une
// heatmap, et le repère temporel qu'une constellation libre n'avait pas.
//
// ⚠️ CE QUI FAIT LA DIFFÉRENCE AVEC UNE HEATMAP, et qui n'est pas négociable : **aucune case
// vide n'est dessinée**. Pas de carré gris, pas de bordure, rien — les jours sans gain n'ont
// aucun élément dans le DOM. Chaque étoile est placée en `grid-column` / `grid-row` explicites,
// donc la grille n'a jamais besoin de cases de remplissage.
//
// C'est ce qui tient la règle de `CLAUDE.md` (« décompte de jours manqués, sous quelque forme que
// ce soit ») : dans la heatmap de Papa, la case grise EST l'information d'absence, et elle est
// légitime pour du pilotage. Ici, l'absence n'existe ni dans les données (le serveur omet les
// jours sans XP) ni dans le rendu.
//
// Trois choses à ne jamais ajouter : un fond quadrillé, une case pour les jours sans gain, un
// « depuis N jours ». Chacune ramènerait l'interdit par la porte de derrière.

/** Côté d'une case, selon le nombre de semaines à tenir.
 *
 * ⚠️ Réglé après vérification en vrai : à taille fixe, cinq semaines faisaient 70 px perdus dans
 * une carte de 480 — la grille avait l'air d'un accident. Elle grossit quand l'histoire est
 * courte, et rétrécit quand elle s'allonge. */
function cellSize(weeks: number): number {
  if (weeks <= 8) return 22;
  if (weeks <= 16) return 16;
  return 11;
}

const GAP = 3;

/** Hauteur de la ligne des libellés de mois (`h-3` + `mb-1`), en pixels. */
const MONTH_ROW_HEIGHT = 16;

const DOW_LABELS = ["L", "", "M", "", "V", "", "D"];

/** Rampe de l'ADR-0024 §5 : indigo → cyan → blanc. Jamais de rouge, jamais de vert d'échec. */
function starColor(intensity: number): string {
  if (intensity > 0.66) return "#ffffff";
  if (intensity > 0.33) return "#22d3ee";
  return "#8b7bff";
}

export interface SkyMapProps {
  /** Jours de gain, du plus ancien au plus récent. Série creuse — jamais complétée. */
  days: XpHistoryDay[];
  /** Injectable pour les tests : la grille dépend d'« aujourd'hui ». */
  today?: Date;
  className?: string;
}

export function SkyMap({ days, today = new Date(), className = "" }: SkyMapProps) {
  // Un ciel vide n'est pas un état d'erreur, mais il n'a rien à montrer : la carte ne se rend
  // pas plutôt que d'afficher un cadre vide (la page décide, cf. `AccueilMassimoPage`).
  if (days.length === 0) return null;

  const { slots, weeks, months } = buildSparseCalendar(
    days.map((day) => day.date),
    today,
  );
  const cell = cellSize(weeks);
  const xpByDate = new Map(days.map((day) => [day.date, day.xp]));
  const maxXp = Math.max(...days.map((day) => day.xp));

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-zetis-border bg-zetis-surface p-5 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">Mon ciel</p>

      {/* La légende porte l'information : un COMPTE qui ne peut que monter. La grille est
          décorative (`aria-hidden`) — sans elle, un lecteur d'écran n'aurait rien à lire. */}
      <p className="mt-2 text-sm">
        <span className="text-2xl font-bold tabular-nums">{days.length}</span>{" "}
        jour{days.length > 1 ? "s" : ""} d'apprentissage
      </p>
      <p className="mt-0.5 text-xs text-zetis-muted">
        Chaque jour où tu travailles allume une étoile de plus. Elles restent.
      </p>

      <div aria-hidden className="mt-4 flex gap-2 overflow-x-auto pb-1">
        {/* Initiales des jours, en regard des lignes.
            Le `marginTop` compense la ligne des libellés de mois, qui ne surmonte que la grille :
            sans lui, « L » se retrouve une demi-case au-dessus du lundi qu'il désigne. */}
        <div
          className="grid shrink-0 text-[9px] leading-none text-zetis-muted"
          style={{
            gridTemplateRows: `repeat(7, ${cell}px)`,
            rowGap: `${GAP}px`,
            marginTop: MONTH_ROW_HEIGHT,
          }}
        >
          {DOW_LABELS.map((label, i) => (
            <span key={i} className="flex items-center">
              {label}
            </span>
          ))}
        </div>

        <div className="shrink-0">
          {/* Libellés de mois : c'est ce qui fait de cette grille un calendrier plutôt qu'un
              damier. Posés seulement quand le mois change. */}
          <div
            className="relative mb-1 h-3 text-[9px] leading-none text-zetis-muted"
            style={{ width: weeks * (cell + GAP) }}
          >
            {months.map((month) => (
              <span
                key={month.week}
                className="absolute top-0"
                style={{ left: month.week * (cell + GAP) }}
              >
                {month.label}
              </span>
            ))}
          </div>

          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${weeks}, ${cell}px)`,
              gridTemplateRows: `repeat(7, ${cell}px)`,
              gap: `${GAP}px`,
            }}
          >
            {/* UNIQUEMENT les jours qui ont eu lieu. Le placement explicite en grille rend les
                cases de remplissage inutiles — il n'y a littéralement rien à dessiner ailleurs. */}
            {slots.map((slot) => {
              const xp = xpByDate.get(slot.date) ?? 0;
              const intensity = maxXp > 0 ? xp / maxXp : 0;
              const color = starColor(intensity);
              return (
                <span
                  key={slot.date}
                  // Point d'ancrage stable : une case = un jour qui a eu lieu. Sélectionner sur
                  // `style` ne marcherait pas — le navigateur normalise `gridColumn`/`gridRow` en
                  // `grid-area`, là où jsdom les garde tels quels. La valeur n'est jamais
                  // AFFICHÉE : aucune date ne doit être lisible sur cette page.
                  data-day={slot.date}
                  className="rounded-[3px] motion-safe:animate-pulse"
                  style={{
                    gridColumn: slot.week + 1,
                    gridRow: slot.dow + 1,
                    background: color,
                    boxShadow: `0 0 ${Math.round(3 + intensity * 9)}px ${color}99`,
                    animationDelay: `${((slot.week * 7 + slot.dow) % 9) * 0.4}s`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
