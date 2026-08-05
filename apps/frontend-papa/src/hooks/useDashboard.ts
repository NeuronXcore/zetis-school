import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  DashboardFocus,
  DashboardPayload,
  DashboardPeriod,
  DashboardSubject,
} from "@zetis/types";
import { fetchDashboard } from "../lib/dashboard";
import { isDashboardPeriod } from "../lib/dashboardDerive";

// État de la page Dashboard : UN appel au montage, puis plus aucun (ADR-0028 §1, §4).
//
// Patron maison à trois couches, comme `useCouncilClass` : le hook possède l'état et les
// dérivations, la page reste présentationnelle. Il n'y a ni react-query ni swr dans le dépôt —
// en ajouter un serait un ADR.
//
// La règle qui tient toute la page : **changer de période, de matière ou de focus ne déclenche
// aucune requête**. Tout ci-dessous est une projection sur un payload déjà en mémoire.

const FOCUSES: DashboardFocus[] = [
  "active_minutes",
  "active_days",
  "consolidated",
  "open_gaps",
];

function isFocus(value: string | null): value is DashboardFocus {
  return value !== null && (FOCUSES as string[]).includes(value);
}

export interface UseDashboard {
  loading: boolean;
  error: string | null;
  data: DashboardPayload | null;
  reload: () => void;

  period: DashboardPeriod;
  setPeriod: (next: DashboardPeriod) => void;
  /** `null` = toutes matières. Re-cliquer la matière active la désélectionne. */
  subject: string | null;
  toggleSubject: (slug: string | null) => void;
  /** `null` = aucun focus. Second clic sur le même KPI = relâche. */
  focus: DashboardFocus | null;
  toggleFocus: (next: DashboardFocus) => void;

  /** Matières après filtrage — une seule quand un filtre est actif, toutes sinon. */
  visibleSubjects: DashboardSubject[];
  /** La matière sélectionnée, ou `null`. */
  activeSubject: DashboardSubject | null;
}

export function useDashboard(): UseDashboard {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboard());
    } catch (e) {
      // Pas de rendu partiel : la page affiche un bandeau et un bouton Réessayer. Un dashboard
      // à moitié rempli laisserait croire que les cartes vides sont des zéros mesurés.
      setError(e instanceof Error ? e.message : "Le tableau de bord n'a pas pu être chargé.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // L'URL est le miroir de l'état de lecture : `?period=&subject=&focus=` rend la vue
  // rechargeable et partageable. Le rechargement seul refait l'unique appel — le filtrage, lui,
  // ne touche jamais au réseau.
  // Le `as DashboardPeriod` d'avant a disparu : le prédicat de `isDashboardPeriod` restreint le
  // type, là où la double lecture de `searchParams` obligeait à réaffirmer à la main ce que la
  // garde venait de vérifier.
  const rawPeriod = searchParams.get("period");
  const period: DashboardPeriod = isDashboardPeriod(rawPeriod) ? rawPeriod : "7";
  const subject = searchParams.get("subject");
  const focus = isFocus(searchParams.get("focus")) ? (searchParams.get("focus") as DashboardFocus) : null;

  const patchParams = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(searchParams);
      if (value === null) next.delete(key);
      else next.set(key, value);
      // `replace` : filtrer n'est pas naviguer. Sans lui, revenir en arrière déferait un à un
      // chaque clic de chip au lieu de quitter la page.
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setPeriod = useCallback(
    (next: DashboardPeriod) => patchParams("period", next),
    [patchParams],
  );

  const toggleSubject = useCallback(
    (slug: string | null) => patchParams("subject", slug === null || slug === subject ? null : slug),
    [patchParams, subject],
  );

  const toggleFocus = useCallback(
    (next: DashboardFocus) => patchParams("focus", next === focus ? null : next),
    [patchParams, focus],
  );

  const activeSubject = useMemo(
    () => data?.subjects.find((s) => s.slug === subject) ?? null,
    [data, subject],
  );

  const visibleSubjects = useMemo(() => {
    if (!data) return [];
    // Un slug d'URL qui ne correspond à aucune matière (matière supprimée, lien périmé) ne doit
    // pas vider la page : on retombe sur « toutes ».
    return activeSubject ? [activeSubject] : data.subjects;
  }, [data, activeSubject]);

  return {
    loading,
    error,
    data,
    reload: () => void load(),
    period,
    setPeriod,
    subject: activeSubject ? subject : null,
    toggleSubject,
    focus,
    toggleFocus,
    visibleSubjects,
    activeSubject,
  };
}
