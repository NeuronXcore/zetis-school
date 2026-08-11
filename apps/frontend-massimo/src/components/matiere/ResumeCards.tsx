import type { ResumeItem } from "@zetis/types";
import type { NotionRoute } from "../../lib/notionRoutes";

export interface ResumeCardsProps {
  items: ResumeItem[];
  subjectSlug: string;
  subjectName: string;
  busy: boolean;
  onOpen: (route: NotionRoute) => void;
}

/** Le libellé dit CE QUE LE CLIC FAIT, et rien de plus. « Continuer » sur un cours qu'on
 *  rouvre à la bonne leçon ; « Reprendre » sur un quiz qu'on relance. Aucun des deux ne promet
 *  de reprendre là où Massimo s'était arrêté DANS le contenu — ni le cours ni le quiz ne
 *  gardent de position, et le prétendre serait mentir sur un détail qu'il vérifierait au
 *  premier clic. */
const UI = {
  cours: { icon: "📖", quoi: "Cours", verbe: "Continuer" },
  quiz: { icon: "🎯", quoi: "Quiz", verbe: "Reprendre" },
} as const;

/** « Reprendre mon dernier contenu » — les dernières choses que Massimo peut ROUVRIR.
 *
 *  Cette carte était refusée depuis le 2026-08-01 (« aucune route ne sert cette donnée, et
 *  l'inventer aurait menti »). Le read-before-code du 2026-08-11 a levé la réserve : les
 *  payloads de `learning_events` portent bien de quoi rouvrir — **mais pas pour tous les
 *  types**.
 *
 *  🔴 **Seuls `cours` et `quiz` arrivent ici**, filtrés SERVEUR. `fiche` n'a aucun lien profond
 *  et `revision` lance une nouvelle session : les afficher ferait nommer un contenu précis pour
 *  atterrir sur une liste — la dette « le libellé sur-promet » déjà consignée sur `capsule_id`,
 *  et le bouton mort que l'ADR-0050 a fait retirer.
 *
 *  ⚠️ **Aucune date, aucune durée, aucun compte.** Le serveur sert bien un `at`, et il n'est pas
 *  rendu : « il y a 6 jours » ferait de cette carte un rappel de ce que Massimo n'a pas fait —
 *  la lecture du temps que « Mon ciel » évite déjà en n'ayant aucun axe. */
export function ResumeCards({
  items,
  subjectSlug,
  subjectName,
  busy,
  onOpen,
}: ResumeCardsProps) {
  // Rien à rouvrir → aucune carte. Un « Reprendre » vide serait un réceptacle vide, et il
  // installerait l'idée qu'il devrait toujours y avoir quelque chose en cours.
  if (items.length === 0) return null;

  function routeFor(item: ResumeItem): NotionRoute {
    if (item.kind === "cours") {
      // `?lesson=` met la leçon en avant sur la page Cours — le lien profond de l'addendum
      // ADR-0025 §15, ajouté pour l'agenda et réutilisé tel quel ici.
      return {
        mode: "navigate",
        to: `/subjects/${encodeURIComponent(subjectSlug)}/cours?lesson=${item.target_id}`,
      };
    }
    // Le quiz passe par `mode: "quiz"` et NON par une navigation : il doit être chargé avant
    // d'être ouvert, et `useOpenNotionAction` gère déjà le cas où il a disparu entre
    // l'affichage et le clic (repli sur `/quiz`, sans message d'échec).
    return {
      mode: "quiz",
      quizId: item.target_id,
      label: `${subjectName} · ${item.title}`,
      returnTo: `/subjects/${subjectSlug}`,
      fallback: "/quiz",
    };
  }

  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-zetis-muted">
        Reprendre
      </h2>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const ui = UI[item.kind];
          return (
            <button
              key={`${item.kind}-${item.target_id}`}
              type="button"
              disabled={busy}
              onClick={() => onOpen(routeFor(item))}
              className="flex min-h-[5.5rem] flex-col justify-between rounded-2xl border border-zetis-border bg-zetis-surface p-4 text-left transition-colors hover:border-zetis-accent-2 disabled:opacity-60 motion-reduce:transition-none"
            >
              <span className="flex items-start gap-2">
                <span aria-hidden className="text-base leading-none">
                  {ui.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider text-zetis-muted">
                    {ui.quoi}
                  </span>
                  <span className="mt-0.5 block font-bold leading-snug">{item.title}</span>
                </span>
              </span>
              <span className="mt-2 text-xs font-bold text-zetis-accent-2">{ui.verbe} →</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
