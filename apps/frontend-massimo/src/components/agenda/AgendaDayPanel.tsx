import { type AgendaItemStudent, type AgendaPlanStep } from "@zetis/types";
import { AgendaItemRow } from "./AgendaItemRow";
import { longDayLabel } from "../../lib/agendaSections";

// Le jour ouvert depuis la bande (addendum ADR-0025 §17).
//
// La bande n'était qu'un INDEX : un tap faisait défiler vers les items du jour. Sur un jour
// PASSÉ, le serveur ne renvoie jamais d'échéance (§6, asymétrie calculée serveur) — le tap ne
// faisait donc **rien**, alors que des points de trace étaient allumés dessous. Un jour qui
// montre quelque chose et ne répond pas se lit comme une panne.
//
// **Ce panneau répond toujours**, y compris pour dire qu'il n'y avait rien à rendre.
//
// ⚠️ Registre : aucun rouge, aucun « en retard », aucun compteur d'arriéré (§7). Un item passé
// non fait est « à reprendre », en ambre doux — le même ton que la section du bas, parce que
// c'est le même objet vu par une autre porte.

interface Props {
  date: string;
  items: AgendaItemStudent[];
  /** Traces d'activité du jour — `null` sur un jour à venir, et `0` ne s'affiche pas (§7). */
  traces: number | null;
  onClose: () => void;
  onToggle: (item: AgendaItemStudent) => void;
  onDismiss: (item: AgendaItemStudent) => void;
  /** Plans indexés par échéance (ADR-0050). ⚠️ **Ce panneau montre le plan de SES échéances, pas
   *  les étapes qui tombent CE jour-là** : ce sont deux questions différentes, et c'est la
   *  seconde que le `✦` de la bande porte. Un plan se lit sous ce qu'il prépare. */
  planByItem?: Record<number, AgendaPlanStep[]>;
  onToggleStep?: (step: AgendaPlanStep) => void;
}

export function AgendaDayPanel({
  date,
  items,
  traces,
  onClose,
  onToggle,
  onDismiss,
  planByItem,
  onToggleStep,
}: Props) {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const passe = new Date(`${date}T00:00:00`) < aujourdhui;

  return (
    <section
      id="agenda-jour"
      aria-label={`Travail du ${longDayLabel(date)}`}
      className="mt-3 rounded-3xl border border-zetis-border bg-zetis-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
          {longDayLabel(date)}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le jour"
          className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
        >
          ✕
        </button>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 flex flex-col gap-2">
          {items.map((item) => (
            <AgendaItemRow
              key={item.id}
              item={item}
              // Le ton « resume » n'est PAS un jugement sur le retard : c'est l'ambre doux du
              // rattrapage, et il ne s'applique qu'à ce qui reste à faire d'un jour passé.
              tone={passe && !item.done ? "resume" : "normal"}
              onToggle={() => onToggle(item)}
              onDismiss={() => onDismiss(item)}
              planSteps={planByItem?.[item.id]}
              onToggleStep={onToggleStep}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zetis-muted">
          {passe ? "Rien à rendre ce jour-là." : "Rien de noté pour ce jour."}
        </p>
      )}

      {/* Traces : la moitié POSITIVE du passé. Elles disent ce qui a été fait, jamais ce qui a
          manqué — et `0` ne se rend pas, sans quoi la ligne deviendrait un constat de vide
          (§7 : un jour sans trace est identique à un jour hors plage). */}
      {traces !== null && traces > 0 && (
        <p className="mt-3 flex items-center gap-2 text-xs text-zetis-muted">
          <span aria-hidden className="flex gap-1">
            {Array.from({ length: traces }, (_, index) => (
              <span key={index} className="block h-1.5 w-1.5 rounded-full bg-emerald-400/80" />
            ))}
          </span>
          tu as travaillé {traces} fois
        </p>
      )}
    </section>
  );
}
