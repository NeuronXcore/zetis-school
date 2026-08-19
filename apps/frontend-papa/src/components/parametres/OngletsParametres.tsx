// La barre d'onglets de la page Paramètres (ADR-0062 §1, §3, §5).
//
// 🔴 **Seuls les onglets qui ont du contenu sont rendus.** Un onglet « à venir » est le toggle
// mort du 2026-08-02 à l'échelle d'un écran : il promet une surface qui n'existe pas. Les onglets
// non construits vivent dans la CARTE, avec leur statut et leur motif.
//
// ⚠️ Aucun composant `Tabs` n'existe dans `packages/ui` ; le patron le plus proche est
// `components/programme/SubjectPills.tsx`, dont on reprend `role="tablist"` et `aria-selected`.
import { cn } from "@zetis/ui";

import { type OngletId } from "../../lib/inventaireReglages";

export interface OngletDef {
  id: OngletId;
  label: string;
  /** Décoratif : le libellé porte déjà le sens, donc `aria-hidden`. */
  icone: string;
}

/** Les onglets réellement rendus, dans leur ordre d'affichage.
 *
 *  ⚠️ **La carte est le premier ET le défaut** (ADR-0062 §1) : elle n'est pas une annexe qu'on
 *  ouvre parfois, c'est la porte et la navigation de la page. */
export const ONGLETS: OngletDef[] = [
  { id: "carte", label: "La carte", icone: "🗺" },
  { id: "autonomie", label: "Autonomie", icone: "⚡" },
  { id: "machine", label: "La machine", icone: "🧠" },
  { id: "donnees", label: "Données", icone: "💾" },
];

export const ONGLET_DEFAUT: OngletId = "carte";

/** L'onglet demandé est-il rendu ? Sert à retomber sur la carte plutôt qu'à montrer un vide.
 *
 *  ⚠️ Une URL peut nommer un onglet non construit (`?onglet=donnees`) — un lien gardé, un
 *  signet. On ne montre pas une page blanche : on ouvre la carte, qui dit justement où en est
 *  ce réglage-là. */
export function estOngletRendu(id: string | null): id is OngletId {
  return ONGLETS.some((o) => o.id === id);
}

export function OngletsParametres({
  actif,
  onSelect,
  /** Les onglets qui portent un brouillon non enregistré, ou un fait à voir (un échec non
   *  acquitté). Une pastille, jamais un blocage : changer d'onglet ne perd rien. */
  pastilles = [],
}: {
  actif: OngletId;
  onSelect: (id: OngletId) => void;
  pastilles?: OngletId[];
}) {
  return (
    <div
      role="tablist"
      aria-label="Sections des paramètres"
      // Les onglets deviennent une liste en mobile (ADR-0062 §6) : `flex-wrap` suffit tant que
      // rien de destructif n'y vit.
      className="mb-6 flex flex-wrap gap-1 border-b border-papa-border"
    >
      {ONGLETS.map((o) => {
        const active = o.id === actif;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            id={`onglet-${o.id}`}
            aria-selected={active}
            aria-controls={`panneau-${o.id}`}
            onClick={() => onSelect(o.id)}
            className={cn(
              "-mb-px flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active
                ? "border-papa-accent text-papa-accent"
                : "border-transparent text-papa-muted hover:bg-white/5 hover:text-papa-text",
            )}
          >
            <span aria-hidden>{o.icone}</span>
            {o.label}
            {pastilles.includes(o.id) && (
              // Le titre porte le sens pour un lecteur d'écran ; le point seul ne dirait rien.
              <span
                title="modifications non enregistrées"
                className="h-1.5 w-1.5 rounded-full bg-papa-warn"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
