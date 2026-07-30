// Table d'habillage des actions d'une notion (icône + libellé par type de contenu). UNE seule
// source, partagée par le panneau Galaxy (`NotionActionPanel`) et le menu de notion du chat
// (ADR-0027 Q1). Volontairement SANS dépendance lourde (pas de `@zetis/ui/galaxy` / three.js) :
// l'importer ne doit pas traîner le moteur 3D dans le bundle du chat (leçon du chantier galaxy).
import type { GalaxyAction } from "@zetis/types";

export const ACTION_UI: Record<GalaxyAction["kind"], { icon: string; label: string }> = {
  cours: { icon: "📖", label: "Voir le cours" },
  eli5: { icon: "💡", label: "Fais-moi comprendre" },
  fiche: { icon: "🗒️", label: "Lire la fiche" },
  capsule: { icon: "🎬", label: "Regarder la capsule" },
  mindmap: { icon: "🧠", label: "Reconstruire la carte" },
  revision: { icon: "🗂️", label: "Réviser mes cartes" },
  quiz: { icon: "🎯", label: "Me tester" },
};
