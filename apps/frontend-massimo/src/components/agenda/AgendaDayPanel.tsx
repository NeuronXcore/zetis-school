import { Link } from "react-router-dom";
import { type AgendaItemStudent, type AgendaPlanStep } from "@zetis/types";
import { AgendaItemRow } from "./AgendaItemRow";
import {
  type DayPreparation,
  longDayLabel,
  planStepTarget,
  shortDayLabel,
} from "../../lib/agendaSections";

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
  /** Les étapes qui tombent CE jour-là — la seconde question, celle que le `✦` porte. Servie
   *  à part de `planByItem` **exprès** : les fusionner reviendrait à répondre à une question
   *  avec les données de l'autre, ce qui est précisément le défaut corrigé ici. */
  preparations?: DayPreparation[];
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
  preparations = [],
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
        {/* 🔴 `▴` ET NON `✕` (2026-08-11, relecture humaine). Ce bouton portait **exactement le
            même `className` et le même glyphe** que la croix de masquage des cartes : sur un
            panneau qui montre trois devoirs, l'écran affichait donc **trois `✕` indiscernables**,
            un qui referme et deux qui archivent définitivement. C'est très probablement là que
            deux devoirs de la base de dev sont partis la veille.

            Le masquage a été borné aux items de Massimo le même jour, donc les deux mauvais ont
            disparu — mais le survivant gardait une forme qui, au milieu de devoirs, se lit encore
            « fais disparaître ça ». Et le commanditaire l'a lu ainsi, à la relecture.

            ⚠️ **Le chevron n'est pas un choix de goût : c'est le vocabulaire DÉJÀ employé par la
            page** deux blocs plus bas — « Replier la suite ▴ ». Un même geste, un même signe.
            L'addendum §17 rappelle par ailleurs que **retaper le jour le referme** : ce bouton est
            une affordance secondaire, il n'a pas à emprunter la forme du geste destructeur. */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Replier le jour"
          title="Replier"
          className="shrink-0 rounded-lg px-1.5 py-0.5 text-xs text-zetis-muted transition-colors hover:text-white motion-reduce:transition-none"
        >
          ▴
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
      ) : preparations.length === 0 ? (
        <p className="mt-3 text-sm text-zetis-muted">
          {passe ? "Rien à rendre ce jour-là." : "Rien de noté pour ce jour."}
        </p>
      ) : null}

      {/* ✦ CE QUE LE JOUR PRÉPARE — la promesse du marqueur, enfin tenue.
          Le `✦` de la bande s'allume sur les `plan_steps` du JOUR ; le panneau ne rendait que
          les échéances DU jour. Deux questions différentes (l'en-tête des props le disait déjà),
          et la Décision 3 garantit qu'elles ne coïncident jamais : une étape tombe toujours
          AVANT l'échéance qu'elle prépare. D'où des jours marqués qui s'ouvraient sur du vide.

          🔴 **Aucune coche ici, et c'est le point.** L'étape se coche sous l'échéance, où le plan
          vit (Décision 2 ter). Deux cases pour un même état, c'est exactement le défaut que le
          reste de ce correctif retire. Ces lignes MÈNENT à l'activité, elles ne la déclarent pas. */}
      {preparations.length > 0 && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zetis-accent-2">
            ✦ Ce jour-là, tu prépares
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {preparations.map(({ step, item }) => {
              const target = planStepTarget(step, item);
              const inner = (
                <>
                  <span aria-hidden>{target.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{target.label}</span>
                  {/* Le SUJET de l'étape, jamais un rouage : sans lui, « réviser ce chapitre »
                      ne dit pas lequel — le motif même de la Décision 2 ter. */}
                  <span className="shrink-0 text-[11px] text-zetis-muted">
                    pour {item.label} · {shortDayLabel(item.due_on)}
                  </span>
                </>
              );
              return (
                <li key={step.id} className="flex">
                  {target.to === null ? (
                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zetis-muted">
                      {inner}
                    </span>
                  ) : (
                    <Link
                      to={target.to}
                      state={target.state}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-slate-100 transition-colors hover:border-violet-400/45 motion-reduce:transition-none"
                    >
                      {inner}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
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
