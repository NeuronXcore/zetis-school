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

// Clé de carte de `CARD_SCOPES` / attribut `data-card`, et non un vocabulaire neuf : si une autre
// carte gagne un panneau un jour, elle réutilise le même paramètre d'URL.
const PANEL_KEY = "ou-agir";

// ⚠️ `Record<DashboardFocus, true>` et NON `DashboardFocus[]` — et c'est TOUT l'objet de cette
// table. Un tableau de `DashboardFocus` reste parfaitement valide en étant **incomplet** : en
// ajoutant le KPI « À renforcer » (addendum ADR-0028), élargir `DashboardKpis` a bien fait tomber
// `KPI_LABELS` et `KPI_FOCUS_HINTS` — tous deux des `Record` — mais **pas cette liste**. Le clic
// écrivait `?focus=fragile`, le garde ci-dessous le refusait, la carte ne s'activait jamais, et
// `tsc` ne voyait rien. Même leçon que `Record<DashboardPeriod, …>` pour la fenêtre « Année » :
// le filet n'est pas dans l'union, il est dans le `Record` typé PAR l'union.
const FOCUSES: Record<DashboardFocus, true> = {
  active_minutes: true,
  active_days: true,
  consolidated: true,
  fragile: true,
  open_gaps: true,
};

function isFocus(value: string | null): value is DashboardFocus {
  return value !== null && Object.prototype.hasOwnProperty.call(FOCUSES, value);
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
  /** FILTRER. Pastilles, donut, barres empilées. **Referme toujours le panneau d'analyse.** */
  toggleSubject: (slug: string | null) => void;
  /** ANALYSER — le seul geste qui déplie le panneau : le clic sur une bulle de « Où agir ». */
  analyseSubject: (slug: string) => void;
  /** Matière dont le panneau d'analyse est déplié, ou `null`. */
  panelSubject: DashboardSubject | null;
  /** Referme le panneau SANS désélectionner la matière. */
  closePanel: () => void;
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

  /** Écrit PLUSIEURS clés d'URL **en un seul appel**. `null` supprime la clé.
   *
   *  🔴 **RÈGLE : un geste = UN appel.** Deux appels dans le même tick en perdent un, et aucune
   *  écriture de ce fichier n'y changera rien.
   *
   *  La raison est dans `react-router` (7.18.1, vérifié dans la source) : `setSearchParams` n'est
   *  **pas** un setter React, c'est un enrobage de `navigate()`. La forme fonctionnelle reçoit
   *  `new URLSearchParams(searchParams)` où `searchParams` est mémoïsé sur le `location.search` du
   *  **rendu courant** — donc exactement le même instantané périmé que si on le lisait
   *  directement. Deux appels successifs partent tous deux de l'URL d'avant, et le second gagne.
   *
   *  D'où la signature par LOT, qui est le vrai correctif : le panneau d'analyse doit écrire
   *  `subject` et `panel` ensemble (`adr-0028-addendum-analyse-par-matiere` §3). En deux appels,
   *  le panneau ne s'ouvrirait pas — et la cause serait à des lieues du symptôme.
   *
   *  ⚠️ La forme fonctionnelle ci-dessous n'achète donc **rien** aujourd'hui : elle est l'usage
   *  documenté, et elle deviendra juste le jour où `react-router` la câblera vraiment. Ne pas lui
   *  prêter de vertu qu'elle n'a pas — en particulier, `patchParams` n'est **pas** stable :
   *  `setSearchParams` dépend lui-même de `searchParams` et change à chaque changement d'URL. */
  const patchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) next.delete(key);
            else next.set(key, value);
          }
          return next;
        },
        // `replace` : filtrer n'est pas naviguer. Sans lui, revenir en arrière déferait un à un
        // chaque clic de chip au lieu de quitter la page.
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPeriod = useCallback(
    (next: DashboardPeriod) => patchParams({ period: next }),
    [patchParams],
  );

  // 🔴 `panel: null` EST la ligne qui protège l'invariant du §1. Sans elle, un `panel=ou-agir`
  // resté dans l'URL ferait qu'un clic de pastille ROUVRE le panneau — donc qu'un geste de
  // filtrage parte au réseau. L'invariant cesserait d'être une propriété du code pour devenir une
  // coïncidence d'ordre des clics.
  const toggleSubject = useCallback(
    (slug: string | null) =>
      patchParams({
        subject: slug === null || slug === subject ? null : slug,
        panel: null,
      }),
    [patchParams, subject],
  );

  // Le clic sur une bulle sélectionne ET déplie, en UN SEUL appel — deux appels en perdraient un
  // (cf. le commentaire de `patchParams`). Re-cliquer la bulle active referme et désélectionne,
  // comme avant ce chantier.
  const analyseSubject = useCallback(
    (slug: string) =>
      patchParams(
        slug === subject && searchParams.get("panel") === PANEL_KEY
          ? { subject: null, panel: null }
          : { subject: slug, panel: PANEL_KEY },
      ),
    [patchParams, searchParams, subject],
  );

  const closePanel = useCallback(() => patchParams({ panel: null }), [patchParams]);

  const toggleFocus = useCallback(
    (next: DashboardFocus) => patchParams({ focus: next === focus ? null : next }),
    [patchParams, focus],
  );

  const activeSubject = useMemo(
    () => data?.subjects.find((s) => s.slug === subject) ?? null,
    [data, subject],
  );

  // Exige `panel=ou-agir` ET une matière CONNUE : un lien périmé referme, il n'ouvre pas un vide.
  // Même repli que `visibleSubjects` sur un slug inconnu.
  // `activeSubject` est déjà `null` pour un slug inconnu (matière supprimée, lien périmé) : le
  // panneau se referme donc de lui-même, sans garde supplémentaire. Un `&& activeSubject !== null`
  // serait un no-op — vérifié en le sabotant, le test restait vert dans les deux sens.
  const panelSubject = searchParams.get("panel") === PANEL_KEY ? activeSubject : null;

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
    analyseSubject,
    panelSubject,
    closePanel,
    focus,
    toggleFocus,
    visibleSubjects,
    activeSubject,
  };
}
