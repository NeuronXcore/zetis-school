import type { MotivationWeek } from "@zetis/types";

// « Ma semaine » — 7 cases, une par jour.
//
// Nommé au possessif et non « Régularité » : ce dernier est le mot de Papa (son dashboard
// s'appelle « Régularité de Massimo »), un mot d'évaluation. Côté enfant, c'est SA semaine.
//
// INVARIANT ANTI-PUNITION, testé : un jour passé sans activité et un jour à venir sont rendus
// EXACTEMENT pareil — mêmes classes, même libellé accessible. Aucun signe ne distingue « pas
// encore » de « pas venu ». Il n'existe donc aucun état visuel négatif : ni rouge, ni croix, ni
// case barrée, ni opacité de deuil.

const INITIALS = ["L", "M", "M", "J", "V", "S", "D"];

interface WeekDotsProps {
  week: MotivationWeek;
  /** Variante compacte (bandeau d'une autre page) : cases plus petites, sans ligne de résumé. */
  compact?: boolean;
}

export function WeekDots({ week, compact = false }: WeekDotsProps) {
  const size = compact ? "h-7 w-7" : "h-9 w-9";

  return (
    <div>
      <ul aria-label="Ma semaine" className="flex gap-1.5">
        {week.days.map((day, index) => {
          const invitation = day.is_today && !day.active;
          // Deux états seulement en dehors du « venu » : aujourd'hui (invitation) et neutre.
          // Le neutre couvre indifféremment le passé sans activité et le futur.
          const tone = day.active
            ? "bg-gradient-to-br from-cyan-400 to-indigo-500 text-white"
            : invitation
              ? "border border-cyan-300/60 text-cyan-200"
              : "bg-white/10 text-zetis-muted";
          return (
            <li key={day.date} className="flex flex-col items-center gap-1">
              <span
                aria-label={ariaLabel(day.active, day.is_today)}
                className={`flex items-center justify-center rounded-xl text-xs font-bold ${size} ${tone}`}
              >
                {/* Un glyphe, pas seulement une couleur : l'information ne passe jamais par la
                    seule teinte. */}
                {day.active ? "✓" : ""}
              </span>
              <span className="text-[10px] text-zetis-muted">{INITIALS[index]}</span>
            </li>
          );
        })}
      </ul>

      {!compact && (
        <p className="mt-2 text-sm text-zetis-muted">
          {summaryLine(week)}
          {week.goal_met && (
            <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-200">
              objectif atteint
            </span>
          )}
        </p>
      )}
    </div>
  );
}

/** Jamais « tu n'es pas venu » : un jour sans activité n'a rien à annoncer. */
function ariaLabel(active: boolean, isToday: boolean): string {
  if (active) return "tu es venu";
  if (isToday) return "aujourd'hui";
  return "";
}

/** Jamais de pourcentage, jamais « il te reste N » — un compte qui monte, rien d'autre. */
function summaryLine(week: MotivationWeek): string {
  const days = `${week.days_done} jour${week.days_done > 1 ? "s" : ""} cette semaine`;
  return week.goal_days != null ? `${days} · objectif ${week.goal_days}` : days;
}
