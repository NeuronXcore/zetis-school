import { type AgendaDay, type AgendaItemStudent } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";

// Bande GLISSANTE : 3 jours avant aujourd'hui, aujourd'hui, 10 après (14 colonnes, réglables
// serveur). Jamais alignée sur lundi–dimanche — une bande calendaire passerait de 6 jours
// d'horizon le lundi à 0 le dimanche soir, au pire moment.
//
// Le nombre de colonnes n'est JAMAIS présumé ici : la bande rend ce que le serveur envoie.
// D'où une grille de 7 colonnes qui se replie naturellement en deux rangées sur téléphone —
// 14 colonnes à 380 px feraient 27 px chacune, illisibles au doigt (ADR-0024 §6 : trois
// appareils, pas un).
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
  /** Jour actuellement ouvert sous la bande (addendum §17), ou `null`. */
  pickedDay?: string | null;
}

const DAY_NAMES = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export function AgendaWeekStrip({ days, itemsByDate, onPickDay, pickedDay }: Props) {
  return (
    <div
      className="grid grid-cols-7 gap-1.5 sm:gap-2 xl:grid-cols-[repeat(auto-fit,minmax(0,1fr))] xl:grid-flow-col"
    >
      {days.map((day) => {
        const [year, month, date] = day.date.split("-").map(Number);
        const jsDate = new Date(year, month - 1, date);
        const isToday = day.offset === 0;
        // Asymétrie passé/futur : un jour PASSÉ n'a plus d'échéance à annoncer (§6).
        // Le serveur la tient déjà (`fixed_items: []` sur le passé) — mais la bande lit la
        // liste vivante pour que la coche optimiste s'y reflète, ce qui court-circuiterait la
        // règle si on ne la rejouait pas ici. Vu à l'écran le 2026-07-29 : un item passé
        // apparaissait dans la bande, à côté de ses traces.
        const items = day.offset >= 0 ? (itemsByDate[day.date] ?? []) : [];
        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onPickDay(day.date)}
            aria-expanded={pickedDay === day.date}
            // ⚠️ Le jour OUVERT porte une marque distincte de celle d'aujourd'hui, et elle ne la
            // remplace pas : les deux se cumulent quand Massimo ouvre le jour même. Le cyan dit
            // « on est ici dans le temps », l'anneau blanc dit « c'est ce que tu regardes ».
            className={`flex flex-col items-center gap-1 rounded-2xl px-1 py-2 transition-colors ${
              isToday
                ? // Seul jour marqué : encadré + halo cyan.
                  "border border-cyan-400/60 bg-cyan-400/5 shadow-[0_0_18px_-6px_rgba(34,211,238,0.6)]"
                : "border border-transparent hover:bg-white/5"
            } ${pickedDay === day.date ? "ring-2 ring-white/70" : ""}`}
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
                // Deux marqueurs de nature, et aucun ne change de couleur en approchant (pas de
                // jauge d'urgence) : le fuchsia du contrôle, et l'indigo — plus calme — de la
                // leçon à apprendre. Le devoir et le rendu n'en portent aucun.
                //
                // ⚠️ Le teal a été essayé puis écarté sur MESURE : 16° de teinte seulement le
                // séparaient de l'émeraude « ajouté par papa » de la ligne d'item.
                const ring =
                  item.kind === "controle"
                    ? "ring-1 ring-fuchsia-400/80"
                    : item.kind === "lecon"
                      ? "ring-1 ring-indigo-400/70"
                      : "";
                const shape = `h-4 w-4 rounded-[22%] ${ring} ${item.done ? "opacity-40" : ""}`;
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
