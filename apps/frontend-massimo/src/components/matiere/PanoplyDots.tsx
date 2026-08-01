import type { GalaxyAction } from "@zetis/types";
// Table d'habillage partagée avec la Galaxy et le chat. Ses icônes sont des EMOJI, et c'est
// permis : l'interdit « jamais d'emoji » de la spec porte sur le PICTOGRAMME DE MARQUE d'une
// matière (`subjectIconFor`), pas sur les icônes d'activité.
import { ACTION_UI } from "../../lib/notionActionUi";

export interface PanoplyDotsProps {
  actions: GalaxyAction[];
}

/** Les sept activités en pastilles : pleine = disponible, creuse = bientôt.
 *
 *  C'est l'élément signature de la page — d'un regard, Massimo voit ce que ZETIS sait faire
 *  d'une notion. Masquée sous 620 px, où le panneau la remplace : sept pastilles sur un
 *  téléphone deviennent illisibles bien avant d'être informatives. */
export function PanoplyDots({ actions }: PanoplyDotsProps) {
  return (
    <span className="hidden shrink-0 items-center gap-1 min-[620px]:flex" aria-hidden={false}>
      {actions.map((action) => {
        const ui = ACTION_UI[action.kind];
        return (
          <span
            key={action.kind}
            // Le libellé complet vit dans l'`aria-label` : le rendu visuel est un point, il ne
            // porte aucun texte lisible par un lecteur d'écran.
            aria-label={`${ui.label} — ${action.available ? "disponible" : "bientôt"}`}
            role="img"
            title={`${ui.label} — ${action.available ? "disponible" : "bientôt"}`}
            className={
              "inline-block h-2 w-2 rounded-full " +
              (action.available
                ? "bg-zetis-accent-2"
                : "border border-zetis-border bg-transparent")
            }
          />
        );
      })}
    </span>
  );
}
