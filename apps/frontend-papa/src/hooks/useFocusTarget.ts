// Cible d'un lien profond : la mettre à portée de regard, et la désigner.
//
// Arriver sur une page de pilotage « quelque part » ne sert à rien si l'objet visé est la
// 40ᵉ ligne d'une liste. Ce hook fait les deux gestes attendus : amener l'objet au centre de
// l'écran, et l'entourer assez nettement pour qu'on le distingue de ses voisins.
//
// Purement visuel : aucune action n'est déclenchée sur l'objet ciblé.
import { useEffect, useRef } from "react";

/** Anneau émeraude — même langage que la ligne de leçon ciblée dans Programme. */
export const FOCUS_RING =
  "border-emerald-400 bg-emerald-500/10 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]";

export function useFocusTarget<T extends HTMLElement>(focused: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!focused) return;
    // `?.` sur la MÉTHODE aussi : jsdom ne l'implémente pas, et un défilement raté ne doit
    // jamais empêcher l'objet de s'afficher — l'anneau suffit à le désigner.
    // `block: "center"` : arriver collé au bord haut désoriente, on veut voir le contexte.
    ref.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }, [focused]);

  return ref;
}
