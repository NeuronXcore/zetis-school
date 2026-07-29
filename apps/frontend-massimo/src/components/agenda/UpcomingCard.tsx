import { type AgendaUpcomingItem } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";
import { daysLeftLabel, shortDayLabel } from "../../lib/agendaSections";

// « Ce qui arrive » — contrôles et rendus SEULEMENT, bornés serveur.
//
// Le décompte est un **gros chiffre neutre**, jamais une jauge qui change de couleur : le seul
// signal d'approche prévu est l'apparition du plan de préparation (Lot 2).
//
// Le CTA « Préparer » est **affiché mais grisé** en Lot 1, avec les trois garde-fous de
// l'ADR-0024 §4 : non cliquable, libellé « bientôt » (jamais « manquant » ni « indisponible »),
// et l'accent visuel de la carte reste sur ce qui est réellement faisable. Montrer la porte à
// venir a une valeur propre : elle montre le chemin.
//
// ⚠️ À ne pas confondre avec le composer de saisie, qui lui n'est PAS grisé mais ABSENT
// (ADR-0025 §10, règle 3) : ici on grise du contenu que ZETIS n'a pas encore produit ; là-bas
// on griserait une capacité retirée à l'enfant.

export function UpcomingCard({ item }: { item: AgendaUpcomingItem }) {
  return (
    <div
      style={{ borderLeftColor: item.subject?.color ?? undefined }}
      className={`flex items-center gap-3 rounded-2xl border border-l-2 border-zetis-border bg-zetis-surface p-3 ${
        item.subject?.color ? "" : "border-l-zetis-border"
      }`}
    >
      <div className="flex w-14 shrink-0 flex-col items-center leading-none">
        <span className="text-2xl font-bold">{Math.max(item.days_left, 0)}</span>
        <span className="mt-0.5 text-[10px] text-zetis-muted">
          {item.days_left > 1 ? "jours" : "jour"}
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">{item.label}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-zetis-muted">
          {item.subject && (
            <span className="inline-flex items-center gap-1">
              {subjectIconFor(item.subject.slug) && (
                <img
                  src={subjectIconFor(item.subject.slug)}
                  alt=""
                  aria-hidden
                  className="h-3.5 w-3.5 rounded-[22%] object-contain"
                />
              )}
              {item.subject.name}
            </span>
          )}
          <span>{shortDayLabel(item.due_on)}</span>
          <span>· {daysLeftLabel(item.days_left)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled
        aria-disabled
        className="shrink-0 cursor-not-allowed rounded-xl border border-white/10 px-3 py-1.5 text-xs text-zetis-muted opacity-60"
      >
        Préparer
        <span className="ml-1 text-[10px]">bientôt</span>
      </button>
    </div>
  );
}
