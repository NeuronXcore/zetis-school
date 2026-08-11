import { useEffect, useState } from "react";
import type { GalaxySubject } from "@zetis/types";
import { fetchGamificationSummary } from "../lib/gamification";
import { fetchGalaxyOverview } from "../lib/galaxy";

// Données de la page Matières. Toute la logique vit ici : le composant reste présentationnel.
//
// **Débranché du mock le 2026-08-11** (addendum ADR-0024 « page matière onglets »). La page
// affichait jusque-là « Niveau 5 », « 62 % du chapitre » et une « Meilleure matière » tirés de
// `data/mock.ts` — trois choses fausses, dont deux interdites par l'ADR-0024 §5 (pourcentage,
// classement des matières).
//
// ⚠️ **Aucune route n'a été créée.** `GET /api/student/galaxy` servait déjà une ligne par
// matière ; elle porte désormais aussi `xp` et `mastered`. Le plan de chantier annonçait une
// route neuve : le read-before-code l'a démentie.

export interface Progression {
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
  totalXp: number;
  levelProgress: number; // 0–100
}

export interface MatieresData {
  loading: boolean;
  error: string | null;
  progression: Progression | null;
  /** ⚠️ **Dans l'ordre du PROGRAMME, servi par le serveur.** Ne jamais trier ici : par XP, par
   *  `mastered` ou par `lit`, la grille deviendrait un podium — la mise en concurrence des
   *  matières que le §5 interdit. Un test-verrou serveur tient l'ordre ; celui-ci le respecte. */
  subjects: GalaxySubject[];
}

export function useMatieres(): MatieresData {
  const [progression, setProgression] = useState<Progression | null>(null);
  const [subjects, setSubjects] = useState<GalaxySubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // `allSettled` : une gamification en panne ne doit pas emporter la liste des matières, et
    // réciproquement. Massimo voit toujours ses matières, même dégradées.
    void Promise.allSettled([fetchGamificationSummary(), fetchGalaxyOverview()]).then(
      ([summary, overview]) => {
        if (!active) return;
        if (summary.status === "fulfilled") {
          const s = summary.value;
          setProgression({
            level: s.level,
            xpIntoLevel: s.xp_into_level,
            xpForNext: s.xp_for_next,
            totalXp: s.total_xp,
            levelProgress:
              s.xp_for_next > 0 ? Math.round((s.xp_into_level / s.xp_for_next) * 100) : 0,
          });
        }
        if (overview.status === "fulfilled") setSubjects(overview.value.subjects);
        // L'erreur n'est levée que si TOUT a échoué : une page à moitié servie vaut mieux
        // qu'un écran d'erreur chez un enfant.
        if (summary.status === "rejected" && overview.status === "rejected") {
          setError("Erreur de chargement");
        }
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  return { loading, error, progression, subjects };
}
