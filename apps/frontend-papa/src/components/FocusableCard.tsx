// Carte d'objet pouvant être la cible d'un lien profond (depuis la page Couverture).
//
// Un composant plutôt qu'un hook appelé dans la boucle : les hooks ne se déclarent pas dans un
// `map`. Chaque carte porte donc son propre `useFocusTarget`, et seule celle qui est visée
// défile et s'entoure.
import { type ReactNode } from "react";
import { FOCUS_RING, useFocusTarget } from "../hooks/useFocusTarget";

export function FocusableCard({
  focused,
  children,
  className = "",
}: {
  focused: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useFocusTarget<HTMLDivElement>(focused);
  return (
    <div
      ref={ref}
      className={`mt-3 rounded-lg border p-3 transition-[border-color,box-shadow,background-color] duration-500 ${
        focused ? FOCUS_RING : "border-papa-border/70 bg-papa-bg"
      } ${className}`}
    >
      {children}
    </div>
  );
}
