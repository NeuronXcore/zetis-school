import { type AgendaDay, type AgendaItemStudent } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";

// Bande GLISSANTE de 7 jours : 3 jours avant aujourd'hui, aujourd'hui, 3 jours après.
// Jamais alignée sur lundi–dimanche — une bande calendaire passerait de 6 jours d'horizon le
// lundi à 0 le dimanche soir, au pire moment.
//
// **La bande est un INDEX, pas une seconde liste** : un tap fait défiler vers les items du
// jour, il n'ouvre rien.
//
// Ce qu'elle ne montre JAMAIS (ADR-0024 §5, ADR-0025 §7) :
//   – aucun gabarit de cases dont certaines resteraient éteintes. Un jour passé sans trace ne
//     rend RIEN : il est visuellement identique à un jour hors plage. Une case grise en
//     attente de remplissage est un décompte de jours manqués, interdit « sous aucune forme » ;
//   – aucun item non fait du passé, aucun libellé sur les jours passés ;
//   – aucun bouton « + » sur un jour vide. Un jour vide est normalement vide.

interface Props {
  days: AgendaDay[];
  /** Items par date, lus depuis la liste vivante (la coche s'y reflète immédiatement). */
  itemsByDate: Record<string, AgendaItemStudent[]>;
  onPickDay: (date: string) => void;
}

const DAY_NAMES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export function AgendaWeekStrip({ days, itemsByDate, onPickDay }: Props) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((day) => {
        const [year, month, date] = day.date.split("-").map(Number);
        const jsDate = new Date(year, month - 1, date);
        const isToday = day.offset === 0;
        const items = itemsByDate[day.date] ?? [];
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onPickDay(day.date)}
            className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-colors ${
              isToday
                ? // Seul jour marqué : encadré + halo cyan.
                  "border border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]"
                : "border border-transparent hover:bg-white/5"
            }`}
          >
            <span className="text-[10px] uppercase tracking-wide text-zetis-muted">
              {DAY_NAMES[jsDate.getDay()]}
            </span>
            <span className={`text-base font-bold ${isToday ? "text-cyan-300" : ""}`}>{date}</span>

            {/* Traces d'un jour passé : 0 à 3 points ALLUMÉS, sans réceptacle. `traces` vaut
                `null` sur un jour à venir — le serveur ne laisse jamais croire qu'il existe
                des cases à remplir. Une trace ne s'efface jamais. */}
            <span className="flex h-1.5 items-center gap-0.5">
              {Array.from({ length: day.traces ?? 0 }, (_, index) => (
                <i
                  key={index}
                  className="block h-1.5 w-1.5 rounded-full bg-emerald-400/80"
                  aria-hidden
                />
              ))}
            </span>

            {/* Points fixes : jours à venir seulement (le serveur rend `[]` sur le passé). */}
            <span className="flex h-5 flex-wrap items-center justify-center gap-0.5">
              {items.slice(0, 3).map((item) => {
                // Un contrôle porte un anneau fuchsia : le seul marqueur de nature, et il ne
                // change jamais de couleur en approchant (pas de jauge d'urgence).
                const shape = `h-4 w-4 rounded-[22%] ${
                  item.kind === "controle" ? "ring-1 ring-fuchsia-400/80" : ""
                } ${item.done ? "opacity-40" : ""}`;
                const icon = item.subject ? subjectIconFor(item.subject.slug) : undefined;
                // Repli sans asset (ou item sans matière) : une pastille neutre, jamais un
                // emoji codé en dur — et jamais un `<img>` cassé.
                return icon ? (
                  <img
                    key={item.id}
                    src={icon}
                    alt=""
                    aria-hidden
                    title={item.subject?.name ?? undefined}
                    className={`${shape} object-contain`}
                  />
                ) : (
                  <span key={item.id} aria-hidden className={`${shape} bg-white/20`} />
                );
              })}
            </span>

            {/* Emplacement du plan de préparation (Lot 2) : prévu, JAMAIS occupé en Lot 1 —
                `plan_steps` est toujours vide, et rien de grisé ne le remplace en attendant. */}
            <span className="h-3 text-[10px] leading-3 text-violet-300">
              {day.plan_steps.length > 0 ? "✦" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}
