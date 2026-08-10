import { type AgendaItemPilot } from "@zetis/types";

// Le Commander, au niveau de l'ITEM — addendum ADR-0025 §14.5.
//
// L'action existe depuis le 2026-08-03 (addendum ADR-0035 §3), mais elle exigeait d'ouvrir le
// panneau de détail ET que l'échéance porte déjà un chapitre. Une capacité livrée que personne ne
// trouve est, à l'usage, une capacité absente.
//
// ⚠️ **Jamais de bouton mort.** `commandFor` rend un handler ou `null` : c'est la PAGE qui sait si
// l'échéance est commandable (il lui faut un chapitre ET une matière rattachée à l'année active —
// `sysId` peut être `null`). Rendre la puce puis ne rien faire au clic se lirait comme une panne,
// ce que tout le dispositif de messages `SKIP_*` existe pour éviter.
//
// ⚠️ **Indépendant du `kind`.** Recopier `TRIGGERING_KINDS` ici en ferait une seconde source de
// vérité, qui a divergé le jour même où `devoir` y est entré. La porte du Commander ne regarde
// aucun `kind` — elle regarde le chapitre.

interface Props {
  item: AgendaItemPilot;
  commandFor?: (item: AgendaItemPilot) => (() => void) | null;
  /** `corner` = dans l'angle (liste plate, large) · `below` = sous la carte (vue semaine).
   *
   *  ⚠️ Mesuré à l'écran le 2026-08-10 : une carte de la vue semaine fait **81 px de large**. Y
   *  réserver la gouttière d'un angle (`pr-7`) prenait un TIERS de la largeur du titre, qui
   *  passait de deux à trois lignes. Sous la carte, la puce coûte sa hauteur — pas la largeur du
   *  texte, qui est la ressource rare ici. */
  placement?: "corner" | "below";
}

export function CommandChip({ item, commandFor, placement = "corner" }: Props) {
  // Une échéance archivée ne commande plus rien : le travail se prescrit pour ce qui vient.
  const run = item.dismissed_at ? null : (commandFor?.(item) ?? null);
  if (!run) return null;

  return (
    <button
      type="button"
      aria-label={`Commander les missions du chapitre de « ${item.label} »`}
      title="Commander les missions de ce chapitre"
      onClick={run}
      className={`rounded px-1 text-xs leading-5 text-papa-muted transition-colors hover:bg-papa-accent/15 hover:text-papa-accent ${
        placement === "corner" ? "absolute right-1 top-1" : "mt-0.5 block w-full text-right"
      }`}
    >
      🎯
    </button>
  );
}
