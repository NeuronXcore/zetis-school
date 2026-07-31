import { useState } from "react";
import type { DashboardFocus, DashboardPeriod, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { SlotGrid } from "./SlotGrid";
import { ActivityHeatmap } from "../activity/ActivityHeatmap";
import { DayDetailPanel } from "../activity/DayDetailPanel";
import { sumCalendar, sumOutsideMinutes, sumSlots, DROPOUT_THRESHOLD } from "../../lib/dashboardDerive";

// « Quand Massimo travaille » — UNE carte, DEUX vues du même journal (ADR-0028 §6).
//
// Calendrier : *est-ce régulier ?* (tendance longue, décrochage).
// Créneaux    : *quand travaille-t-il ?* (semaine type, utile pour caler une séance).
//
// Deux cartes distinctes auraient imposé deux légendes et deux échelles sur une page déjà dense.
// La grille calendrier réutilise `ActivityHeatmap` et `lib/heatmap.ts` tels quels — déjà testés,
// et déjà en échelle émeraude sans rouge.
//
// ⚠️ Le calendrier couvre 26 semaines QUELLE QUE SOIT la période : le sélecteur 7/30/90 pilote
// les KPI et les séries, pas cette grille, qui est là pour la tendance longue. Seul le filtre
// matière l'affecte.

interface WorkRhythmCardProps {
  subjects: DashboardSubject[];
  activeSubject: DashboardSubject | null;
  period: DashboardPeriod;
  focus: DashboardFocus | null;
  daysInactive: number;
  subjectNames: Map<string, string>;
}

export function WorkRhythmCard({
  subjects,
  activeSubject,
  period,
  focus,
  daysInactive,
  subjectNames,
}: WorkRhythmCardProps) {
  const [view, setView] = useState<"cal" | "slot">("cal");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = sumCalendar(subjects);
  const slots = sumSlots(subjects, period);
  const outside = sumOutsideMinutes(subjects, period);
  const selected = days.find((d) => d.date === selectedDate);

  return (
    <DashboardCard
      card="heatmap"
      title="Quand Massimo travaille"
      focus={focus}
      className="xl:col-span-7"
      badge={
        // Décrochage : visible À LA CONSULTATION, jamais poussé en notification. Le pilotage par
        // l'anxiété est refusé côté Papa comme côté Massimo.
        daysInactive >= DROPOUT_THRESHOLD ? (
          <span className="rounded-full border border-papa-warn/30 bg-papa-warn/10 px-2.5 py-0.5 text-[11px] font-semibold text-papa-warn">
            aucune activité depuis {daysInactive} j
          </span>
        ) : null
      }
      action={
        <span className="inline-flex gap-0.5 rounded-lg border border-papa-border bg-papa-surface-2 p-0.5">
          {(
            [
              ["cal", "Calendrier"],
              ["slot", "Créneaux"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                view === value ? "bg-papa-accent text-[#042f1f]" : "text-papa-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </span>
      }
      note={
        view === "cal" ? (
          <>
            Intensité = minutes actives du jour, jamais le nombre d'événements. Aucune couleur
            d'alerte : une case dense n'est pas « bien », une case vide n'est pas « mal ».
          </>
        ) : (
          <>
            Semaine type sur la période : minutes actives moyennes par créneau de 2 h, fuseau
            Europe/Paris. Sert à caler une séance, pas à contrôler un emploi du temps.
            {outside > 0 && ` + ${outside} min hors plage (avant 8 h).`}
          </>
        )
      }
    >
      {view === "cal" ? (
        <>
          <ActivityHeatmap
            days={days}
            weeks={26}
            selectedDate={selectedDate}
            onSelectDay={setSelectedDate}
          />
          {selectedDate ? (
            // SEULE exception au « zéro état de chargement » (ADR-0028 §4) : ce n'est pas un
            // filtre mais une descente vers un détail non borné. Le précharger pour 26 semaines
            // × 8 matières annulerait tout le bénéfice de l'agrégat unique.
            <DayDetailPanel
              date={selectedDate}
              summary={selected}
              subjectId={activeSubject?.id ?? null}
              subjectNames={subjectNames}
            />
          ) : (
            <p className="mt-3 border-t border-papa-border pt-3 text-sm italic text-papa-muted">
              Sélectionne un jour dans la grille pour voir le journal de la séance.
            </p>
          )}
        </>
      ) : (
        <SlotGrid matrix={slots} />
      )}
    </DashboardCard>
  );
}
