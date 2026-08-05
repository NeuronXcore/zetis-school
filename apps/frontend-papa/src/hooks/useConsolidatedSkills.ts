import { useEffect, useState } from "react";
import type { ConsolidatedSkill } from "@zetis/types";
import { fetchConsolidatedSkills } from "../lib/activity";

// Les notions ACQUISES, nommées — source de la colonne « Acquis » dépliée (addendum ADR-0038 §6).
//
// ⚠️ **Chargées au PREMIER dépliage, une seule fois pour toute la page.** La route sert toutes les
// matières d'un coup ; l'appeler par ligne ferait huit requêtes pour une donnée unique. Et la
// charger au montage ferait payer à toute la page un détail que personne n'a encore demandé — la
// table garde sa requête unique.
//
// `GET /progress/consolidated` et son client existaient depuis des semaines **sans un seul
// appelant**. Ce hook est ce qui les branche enfin, plutôt que d'en écrire une seconde.

export interface UseConsolidatedSkills {
  loading: boolean;
  error: string | null;
  skills: ConsolidatedSkill[];
}

export function useConsolidatedSkills(enabled: boolean): UseConsolidatedSkills {
  const [skills, setSkills] = useState<ConsolidatedSkill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    // `fetched` verrouille : replier puis rouvrir une ligne, ou en ouvrir une autre, ne redemande
    // rien. Un dépliage est un geste de lecture, pas une raison de retourner au serveur.
    if (!enabled || fetched) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchConsolidatedSkills()
      .then((rows) => {
        if (!cancelled) {
          setSkills(rows);
          setFetched(true);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Les notions acquises n'ont pas pu être chargées.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fetched]);

  return { loading, error, skills };
}
