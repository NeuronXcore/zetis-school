import { subjectColorFor } from "@zetis/ui";
import type { DashboardFocus, DashboardPeriod, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { formatMinutes } from "../../lib/heatmap";

// « Répartition du temps » — part de chaque matière dans le temps actif de la fenêtre.
//
// Donut en SVG pur (`stroke-dasharray` sur un cercle), aucune lib de graphes : le dépôt n'en a
// pas et n'en veut pas. Même technique que `ProgressRingView` de `@zetis/ui`.
//
// Les matières à 0 minute sont EXCLUES du tracé : un segment d'épaisseur nulle serait invisible
// mais occuperait une entrée de légende, et la légende deviendrait une liste de matières
// inactives plutôt qu'une clé de lecture.

const R = 58;
const C = 2 * Math.PI * R;

/** Part « hors matière » — pseudo-matière, pour que le donut totalise le MÊME temps que le KPI. */
const UNATTRIBUTED = {
  slug: "__hors_matiere__",
  name: "Hors matière",
  color: "#5f7a6e",
} as const;

interface TimeSplitCardProps {
  /** TOUTES les matières, y compris quand un filtre est actif : le donut montre la répartition
   *  complète, sans quoi une matière filtrée occuperait 100 % du disque et ne dirait plus rien
   *  de sa part réelle. La sélection s'exprime par l'épaisseur et l'opacité. */
  allSubjects: DashboardSubject[];
  /** Temps actif non imputable à une matière (connexion, navigation, chat). */
  unattributed: number;
  period: DashboardPeriod;
  focus: DashboardFocus | null;
  selectedSlug: string | null;
  onSelect: (slug: string) => void;
}

export function TimeSplitCard({
  allSubjects,
  unattributed,
  period,
  focus,
  selectedSlug,
  onSelect,
}: TimeSplitCardProps) {
  // Le donut montre TOUJOURS la répartition complète, même quand un filtre est actif : c'est ce
  // qui permet de voir la part relative de la matière sélectionnée. La sélection s'exprime par
  // l'épaisseur et l'opacité, pas en retirant les autres parts.
  //
  // « Hors matière » est une part À PART ENTIÈRE : sans elle, le centre du donut affichait 42 min
  // à côté d'un KPI annonçant 7 h 05, sur le même écran. Ce temps est mesuré, il n'appartient
  // simplement à aucune matière — le taire aurait été plus trompeur que le nommer.
  const parts: { slug: string; name: string; color: string | null; minutes: number }[] = [
    ...allSubjects
      .filter((s) => (s.minutes[period] ?? 0) > 0)
      .map((s) => ({ slug: s.slug, name: s.name, color: s.color, minutes: s.minutes[period] })),
    ...(unattributed > 0
      ? [{ slug: UNATTRIBUTED.slug, name: UNATTRIBUTED.name, color: UNATTRIBUTED.color, minutes: unattributed }]
      : []),
  ];
  const total = parts.reduce((sum, part) => sum + part.minutes, 0);

  let offset = 0;

  return (
    <DashboardCard
      card="repartition"
      title="Répartition du temps"
      tagline="par matière"
      focus={focus}
      className="xl:col-span-5"
      note={
        <>
          À comparer avec « Où agir » : une matière qui prend du temps sans consolider signale une
          méthode à changer, pas un effort à augmenter.
          {unattributed > 0 && (
            <>
              {" "}
              « Hors matière » = connexion, navigation et échanges avec ZETIS — du temps de présence
              réel, qui n'appartient à aucune matière.
            </>
          )}
        </>
      }
    >
      {total === 0 ? (
        <p className="py-6 text-sm italic text-papa-muted">
          Aucun temps actif sur cette période. Le donut apparaîtra dès la première séance.
        </p>
      ) : (
        <div className="grid items-center gap-4 sm:grid-cols-[150px_1fr]">
          <svg viewBox="0 0 160 160" className="w-full max-w-[150px]" role="img" aria-label="Répartition du temps actif par matière">
            <circle cx={80} cy={80} r={R} fill="none" stroke="currentColor" strokeWidth={20} className="text-papa-surface-2" />
            {parts.map((part) => {
              const fraction = part.minutes / total;
              const selectable = part.slug !== UNATTRIBUTED.slug;
              const dimmed = selectedSlug !== null && selectedSlug !== part.slug;
              const dash = `${(C * fraction - 2).toFixed(1)} ${C}`;
              const element = (
                <circle
                  key={part.slug}
                  cx={80}
                  cy={80}
                  r={R}
                  fill="none"
                  stroke={part.color ?? subjectColorFor(part.slug, null)}
                  strokeWidth={dimmed ? 13 : 20}
                  strokeDasharray={dash}
                  strokeDashoffset={(-C * offset).toFixed(1)}
                  transform="rotate(-90 80 80)"
                  opacity={dimmed ? 0.28 : 1}
                  className={selectable ? "cursor-pointer" : undefined}
                  onClick={selectable ? () => onSelect(part.slug) : undefined}
                >
                  <title>{`${part.name} — ${formatMinutes(part.minutes)} · ${Math.round(fraction * 100)} %`}</title>
                </circle>
              );
              offset += fraction;
              return element;
            })}
            <text x={80} y={78} textAnchor="middle" className="fill-papa-text font-mono text-[19px]">
              {formatMinutes(total)}
            </text>
            <text x={80} y={95} textAnchor="middle" className="fill-papa-muted text-[10px]">
              temps actif
            </text>
          </svg>

          <ul className="flex flex-col gap-1">
            {parts.map((part) => {
              const percent = Math.round((part.minutes / total) * 100);
              const selectable = part.slug !== UNATTRIBUTED.slug;
              const dimmed = selectedSlug !== null && selectedSlug !== part.slug;
              const swatch = (
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                  style={{ background: part.color ?? subjectColorFor(part.slug, null) }}
                />
              );
              return (
                <li key={part.slug}>
                  {selectable ? (
                    <button
                      type="button"
                      aria-pressed={selectedSlug === part.slug}
                      onClick={() => onSelect(part.slug)}
                      className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-papa-surface-2 ${
                        dimmed ? "opacity-50" : ""
                      }`}
                    >
                      {swatch}
                      <span className="min-w-0 flex-1 truncate text-papa-muted">{part.name}</span>
                      <span className="font-mono text-papa-text">{percent} %</span>
                    </button>
                  ) : (
                    // Non cliquable : « hors matière » n'est pas une matière, la filtrer n'aurait
                    // aucun sens. Elle reste affichée pour que les parts totalisent 100 %.
                    <span className={`flex w-full items-center gap-2 px-1.5 py-1 text-xs ${dimmed ? "opacity-50" : ""}`}>
                      {swatch}
                      <span className="min-w-0 flex-1 truncate italic text-papa-muted">
                        {part.name}
                      </span>
                      <span className="font-mono text-papa-muted">{percent} %</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </DashboardCard>
  );
}
