import { useEffect, useState } from "react";
import type { AgendaUpcomingItem } from "@zetis/types";
import { fetchAgendaUpcoming } from "../lib/agenda";

/** Les échéances RÉELLES de cette matière — contrôles et rendus du cahier de texte.
 *
 *  🔴 **Rien n'est fabriqué ici, et c'est la condition qui rend cette carte acceptable.**
 *  `CLAUDE.md` interdit la « pression quotidienne anxiogène ». Une échéance que ZETIS invente
 *  (« 5 questions à revoir », « à faire avant demain ») EST cette pression. Une échéance que le
 *  professeur a posée existe déjà dans le monde de Massimo — la lui rappeler ne l'ajoute pas.
 *
 *  Le contrat le dit à la source : `AgendaUpcomingItem.days_left` est un « décompte **SUBI**
 *  […] jamais fabriqué ».
 *
 *  ⚠️ **Aucun `due_count`, aucun arriéré, aucun compte de retard** ne transite par ce hook. La
 *  seule source est l'agenda, dont l'horizon et le nombre sont déjà **bornés serveur**.
 *
 *  Le filtre par matière est CLIENT : la route sert déjà une liste courte, et `subject.slug`
 *  voyage avec chaque item. Ajouter un paramètre serveur coûterait une route de plus pour
 *  filtrer trois lignes.
 */
export function useSubjectUpcoming(slug: string | undefined): AgendaUpcomingItem[] {
  return useUpcoming(slug ?? null, slug !== undefined);
}

/** Les mêmes échéances, **toutes matières** — la grille `/matieres` est au-dessus des matières.
 *
 *  Toutes les réserves de `useSubjectUpcoming` valent ici mot pour mot : rien n'est fabriqué,
 *  la source est l'agenda seul, et aucun arriéré ne transite. */
export function useAllUpcoming(): AgendaUpcomingItem[] {
  return useUpcoming(null, true);
}

function useUpcoming(slug: string | null, enabled: boolean): AgendaUpcomingItem[] {
  const [items, setItems] = useState<AgendaUpcomingItem[]>([]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetchAgendaUpcoming()
      .then((all) => {
        if (!active) return;
        setItems(slug === null ? all : all.filter((item) => item.subject?.slug === slug));
      })
      // Silence : une panne d'agenda retire la carte, elle n'emporte pas la page. Même
      // principe que le résumé de révision dans `useSubjectPanoply`.
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, [slug, enabled]);

  return items;
}
