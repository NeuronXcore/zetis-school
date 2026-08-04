import { useEffect, useState } from "react";
import { type Autonomy } from "@zetis/types";
import { AUTONOMY_CHANGED_EVENT, fetchAutonomy } from "../lib/settings";

/** TROIS états, jamais deux.
 *
 *  « Pas encore lu » et « illisible » ne se confondent pas : le premier autorise un squelette, le
 *  second l'interdit — et AUCUN des deux n'autorise un régime (addendum ADR-0032 §7.4). Un
 *  booléen `loading` à côté d'un `Autonomy | null` offrirait quatre combinaisons pour trois états,
 *  dont une impossible ; c'est cette combinaison-là qui finit par afficher « Manuel » à l'erreur. */
export type AutonomyState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; autonomy: Autonomy };

/** Repli d'un point de montage qui n'a pas encore lu — il ne dit AUCUN régime, c'est tout son
 *  intérêt. Miroir d'`EMPTY_NEWS` côté Massimo. */
export const AUTONOMY_LOADING: AutonomyState = { status: "loading" };

/** L'état d'autonomie de ZETIS, pour le bloc de tête de la sidebar (addendum ADR-0032 §7).
 *
 *  Monté **une seule fois**, dans `PapaLayout`. Un appel au montage, puis un refetch uniquement
 *  quand Papa a enregistré un réglage — jamais sur horloge (§7.4, verrou repris de l'ADR-0030).
 *
 *  Retourne l'`Autonomy` ENTIER et ne dérive rien : `preset` est calculé par le serveur, et le
 *  recalculer ici créerait la seconde source de vérité que l'ADR-0032 §2 a refusée.
 */
export function useAutonomyState(): AutonomyState {
  const [state, setState] = useState<AutonomyState>(AUTONOMY_LOADING);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      fetchAutonomy()
        .then((autonomy) => {
          if (alive) setState({ status: "ready", autonomy });
        })
        // ⚠️ DIVERGENCE assumée d'avec `useNewsSummary` : là-bas l'échec est silencieux et garde la
        // valeur précédente, parce qu'un badge absent est un état correct. Ici non — un régime
        // périmé est un régime FAUX, et un régime faux affiché une seconde est un mensonge
        // (`page-parametres.md`, §États). Un échec efface donc l'état, il ne le conserve pas.
        .catch(() => {
          if (alive) setState({ status: "error" });
        });
    };

    // Coalescence des rafales, et surtout PAS un rafraîchissement périodique : ce délai ne s'arme
    // que sur un événement et ne se déclenche jamais spontanément. Verrouillé par un test
    // (« 60 s de timers avancés sans événement → toujours un seul appel »).
    const onChanged = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };

    load();
    window.addEventListener(AUTONOMY_CHANGED_EVENT, onChanged);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener(AUTONOMY_CHANGED_EVENT, onChanged);
    };
  }, []);

  return state;
}
