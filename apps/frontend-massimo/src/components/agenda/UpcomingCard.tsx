import { type AgendaUpcomingItem } from "@zetis/types";
import { subjectIconFor } from "../../lib/subjectIcons";
import { daysLeftLabel, shortDayLabel } from "../../lib/agendaSections";

// « Ce qui arrive » — contrôles et rendus SEULEMENT, bornés serveur.
//
// Le décompte est un **gros chiffre neutre**, jamais une jauge qui change de couleur : le seul
// signal d'approche prévu est l'apparition du plan de préparation (Lot 2).
//
// 🔴 **Le CTA « Préparer · bientôt » a été RETIRÉ le 2026-08-10** (ADR-0050). Il était grisé
// depuis le Lot 1 au titre de l'ADR-0024 §4 — *« montrer la porte à venir montre le chemin »* —
// et cette justification est morte avec la livraison du plan : « bientôt » est devenu **faux**.
// Le défaut a été vu à l'écran, pas par un test.
//
// À la place, `has_plan` — servi par le serveur pour cette carte, et **sans consommateur jusqu'à
// aujourd'hui** :
//
//   • `true`  → un bouton qui OUVRE le plan (il vit sous l'échéance, sur cette même page) ;
//   • `false` → **rien**. Une échéance sans chapitre, ou à J+1, n'aura JAMAIS de plan : lui
//     promettre « bientôt » serait mentir une seconde fois. *« Un bouton mort se lit comme une
//     panne »* (addendum ADR-0025 §14.6).
//
// ⚠️ Ce n'est PAS un revirement sur l'ADR-0024 §4 : là-bas le gris dit *« Papa ne l'a pas encore
// produit »* sur un catalogue fait pour être parcouru. Ici, il disait *« ZETIS ne sait pas encore
// le faire »* — et ZETIS sait, désormais.

export function UpcomingCard({
  item,
  onOpenPlan,
  hideSubject = false,
}: {
  item: AgendaUpcomingItem;
  /** Amène Massimo au plan de cette échéance. L'appelant sait où il est rendu (il peut être dans
   *  une section repliée) — d'où le rappel plutôt qu'une ancre posée ici. */
  onOpenPlan?: () => void;
  /** Sur une surface DÉJÀ scopée à une matière (le rail de `/subjects/:slug`), répéter son nom
   *  sur chaque échéance ne dit rien et mange la largeur. Défaut `false` : l'agenda global, où
   *  la matière est l'information qui distingue les lignes, ne change pas d'un pixel. */
  hideSubject?: boolean;
}) {
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
          {item.subject && !hideSubject && (
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

      {/* Les MÊMES mots que l'encadré qu'il ouvre — « ✦ Ton plan ». Un bouton qui nomme sa
          destination ne demande aucune explication (règle de l'`adr-0047`). */}
      {item.has_plan && onOpenPlan && (
        <button
          type="button"
          onClick={onOpenPlan}
          className="shrink-0 rounded-xl border border-violet-400/30 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-100 transition-colors hover:border-violet-400/60 motion-reduce:transition-none"
        >
          <span aria-hidden className="mr-1">
            ✦
          </span>
          Ton plan
        </button>
      )}
    </div>
  );
}
