import { useState } from "react";
import type { DashboardFocus, DashboardPeriod, DashboardSubject } from "@zetis/types";
import { DashboardCard } from "./DashboardCard";
import { SlotGrid } from "./SlotGrid";
import { CurrentWeekBars } from "./CurrentWeekBars";
import { ActivityHeatmap } from "../activity/ActivityHeatmap";
import { DayDetailPanel } from "../activity/DayDetailPanel";
import {
  buildCurrentWeek,
  buildSlotCells,
  formatSlotWindow,
  sumCalendar,
  sumOutsideMinutes,
  DROPOUT_THRESHOLD,
} from "../../lib/dashboardDerive";

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
  /** `generated_at` de l'agrégat — sert à dater la fenêtre des créneaux avec les MÊMES bornes que
   *  le serveur, plutôt qu'avec l'horloge d'un onglet resté ouvert. */
  generatedAt: string;
}

export function WorkRhythmCard({
  subjects,
  activeSubject,
  period,
  focus,
  daysInactive,
  subjectNames,
  generatedAt,
}: WorkRhythmCardProps) {
  const [view, setView] = useState<"cal" | "slot" | "week">("cal");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const days = sumCalendar(subjects);
  // `subjects` est DÉJÀ filtré par la matière active (`visibleSubjects`) : filtrée, la grille ne
  // ventile plus qu'une matière, et chaque case n'a qu'un segment. C'est ce qui rend le nombre
  // lisible — il ne mélange alors plus rien.
  const slotCells = buildSlotCells(subjects, period);
  // Sur 7 jours chaque jour de semaine n'apparaît QU'UNE FOIS : le serveur divise par 1, et le
  // chiffre affiché est les minutes de ce jour-là, pas une moyenne. L'écrire « moyenne » serait
  // faux — la moyenne ne commence à porter sur quelque chose qu'à partir de 30 jours.
  const moyenne = period !== "7";
  // Bâtie sur `calendar`, indépendant de la période — comme la vue Calendrier. Le sélecteur
  // 7/30/90 ne pilote pas cette vue : « la semaine en cours » n'a qu'une seule définition.
  const weekDays = buildCurrentWeek(subjects, generatedAt);
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
              ["slot", "Semaine type"],
              ["week", "Semaine en cours"],
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
        ) : view === "week" ? (
          <>
            La semaine calendaire en cours, jour par jour et datée — à ne pas confondre avec la
            semaine type, qui replie une fenêtre glissante sur sept colonnes.{" "}
            <strong className="font-semibold">Pas de découpage horaire ici</strong> : le détail par
            créneau n'existe côté serveur que replié par jour de semaine, il a perdu les dates. Un
            jour à venir est marqué comme tel — il n'a pas zéro minute, il n'a pas encore eu lieu.
          </>
        ) : (
          <>
            Semaine type {formatSlotWindow(generatedAt, period)}, repliée par jour de semaine :
            la colonne « Jeu » est <strong className="font-semibold">le jeudi de cette fenêtre</strong>,
            pas le jeudi à venir.{" "}
            {moyenne
              ? "Chiffres = minutes actives moyennes du créneau de 2 h."
              : "Sur sept jours chaque jour n'apparaît qu'une fois : le chiffre est ses minutes, pas une moyenne."}{" "}
            Fuseau Europe/Paris. Sert à caler une séance, pas à contrôler un emploi du temps.{" "}
            {activeSubject
              ? `Les nombres sont les minutes de ${activeSubject.name} dans le créneau.`
              : "Chaque barre est découpée par matière ; sa longueur compare le créneau au plus chargé de la semaine."}
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
      ) : view === "week" ? (
        <CurrentWeekBars days={weekDays} />
      ) : (
        <SlotGrid cells={slotCells} showValues={activeSubject !== null} averaged={moyenne} />
      )}
    </DashboardCard>
  );
}
