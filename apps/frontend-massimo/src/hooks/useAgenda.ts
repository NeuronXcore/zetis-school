import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgendaItemStudent,
  type AgendaPlanStep,
  type AgendaUpcomingItem,
  type AgendaWeek,
} from "@zetis/types";
import {
  dismissAgendaItem,
  fetchAgendaItems,
  fetchAgendaUpcoming,
  fetchAgendaWeek,
  markAgendaSeen,
  setAgendaItemDone,
  setAgendaPlanStepDone,
} from "../lib/agenda";
import {
  type AgendaSections,
  addDays,
  groupPlanByItem,
  isoDay,
  splitSections,
} from "../lib/agendaSections";

// Logique de la page `/agenda` côté Massimo. Les composants restent présentationnels.
//
// **Coche OPTIMISTE** : le geste doit répondre instantanément. C'est le seul geste que Massimo
// possède en phase 0, une latence réseau le rendrait mou. En cas d'échec, on revient
// silencieusement à l'état serveur — jamais de message d'erreur technique à l'écran de
// l'enfant (règle de tenue de l'Accueil, reprise ici).
//
// Aucun XP, aucune célébration : cocher est déclaratif, il ne se récompense pas (§3).

export interface UseAgenda {
  week: AgendaWeek | null;
  upcoming: AgendaUpcomingItem[];
  /** Items de la bande. La bande LIT cette liste (et non `week.fixed_items`) pour que la coche
   *  optimiste s'y reflète immédiatement ; `week` ne sert que pour les dates et les traces,
   *  qui sont les seules données que le serveur seul peut calculer. */
  items: AgendaItemStudent[];
  sections: AgendaSections;
  /** Les étapes du plan, GROUPÉES PAR ÉCHÉANCE (ADR-0050 Décision 2 ter).
   *
   *  Le serveur les sert par JOUR — c'est ce dont la bande a besoin pour son `✦`. Mais Massimo
   *  lit un plan sous le contrôle qu'il prépare : sur une semaine à deux contrôles, une étape
   *  posée sous le jour flotterait sans dire de quel chapitre elle parle. Le regroupement se
   *  fait donc ici, une fois, sur `agenda_item_id`. */
  planByItem: Record<number, AgendaPlanStep[]>;
  loading: boolean;
  today: Date;
  toggleDone: (item: AgendaItemStudent) => void;
  /** Coche une étape. Optimiste, comme la coche d'item — et aussi déclarative : aucun XP,
   *  aucune célébration (Décision 5, option A). */
  toggleStep: (step: AgendaPlanStep) => void;
  dismiss: (item: AgendaItemStudent) => void;
}

const EMPTY: AgendaSections = { today: [], tomorrow: [], later: [], resume: [] };

export function useAgenda(): UseAgenda {
  const [week, setWeek] = useState<AgendaWeek | null>(null);
  const [upcoming, setUpcoming] = useState<AgendaUpcomingItem[]>([]);
  const [items, setItems] = useState<AgendaItemStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date());

  const load = useCallback(async () => {
    const [weekData, upcomingData] = await Promise.all([
      fetchAgendaWeek().catch(() => null),
      fetchAgendaUpcoming().catch(() => [] as AgendaUpcomingItem[]),
    ]);
    setWeek(weekData);
    setUpcoming(upcomingData);

    // La fenêtre des items est DÉRIVÉE de la bande servie, jamais recalculée ici : l'amplitude
    // est un réglage serveur (`AGENDA_BAND_DAYS_*`), et la dupliquer côté client garantissait
    // qu'elles divergent au premier changement. Repli sur ±3 jours seulement si `/week` a
    // échoué — Massimo ne remonte de toute façon jamais au-delà de ses 3 jours passés.
    const days = weekData?.days ?? [];
    const from = days[0]?.date ?? isoDay(addDays(today, -3));
    const to = days[days.length - 1]?.date ?? isoDay(addDays(today, 3));
    setItems(await fetchAgendaItems(from, to).catch(() => [] as AgendaItemStudent[]));
    setLoading(false);
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ouvrir `/agenda` EST le regard (addendum ADR-0025 §12.3) : le témoin de nouveauté retombe.
  // Effet séparé et sans dépendance, donc UNE fois à l'ouverture — le mettre dans `load()` le
  // rejouerait à chaque coche, ce qui marcherait mais confondrait « regarder » et « agir ».
  useEffect(() => {
    void markAgendaSeen();
  }, []);

  const sections = useMemo(
    () => (items.length === 0 ? EMPTY : splitSections(items, today)),
    [items, today],
  );

  // Jour → échéance. Le regroupement ET son tri vivent dans le module pur, où ils sont testés :
  // le sens du tri est un piège (l'offset compte à rebours) et un piège se verrouille.
  const planByItem = useMemo(() => groupPlanByItem(week?.days ?? []), [week]);

  const toggleStep = useCallback((step: AgendaPlanStep) => {
    const next = !step.done;
    // La coche vit dans `week` (c'est là que le serveur sert les étapes) : on y écrit
    // optimistement, et `planByItem` s'en dérive.
    const patch = (value: boolean) =>
      setWeek((current) =>
        current === null
          ? current
          : {
              ...current,
              days: current.days.map((day) => ({
                ...day,
                plan_steps: day.plan_steps.map((s) =>
                  s.id === step.id ? { ...s, done: value } : s,
                ),
              })),
            },
      );
    patch(next);
    // Retour silencieux à l'état serveur en cas d'échec : jamais de rouge chez Massimo.
    setAgendaPlanStepDone(step.id, next).catch(() => patch(!next));
  }, []);

  const toggleDone = useCallback(
    (item: AgendaItemStudent) => {
      const next = !item.done;
      setItems((all) => all.map((i) => (i.id === item.id ? { ...i, done: next } : i)));
      setAgendaItemDone(item.id, next)
        .then((updated) =>
          setItems((all) => all.map((i) => (i.id === updated.id ? updated : i))),
        )
        // Retour silencieux à l'état serveur : pas de message, pas de rouge.
        .catch(() =>
          setItems((all) => all.map((i) => (i.id === item.id ? { ...i, done: !next } : i))),
        );
    },
    [],
  );

  const dismiss = useCallback((item: AgendaItemStudent) => {
    setItems((all) => all.filter((i) => i.id !== item.id));
    setUpcoming((all) => all.filter((u) => u.id !== item.id));
    dismissAgendaItem(item.id).catch(() => void load());
  }, [load]);

  return {
    week,
    upcoming,
    items,
    sections,
    planByItem,
    loading,
    today,
    toggleDone,
    toggleStep,
    dismiss,
  };
}
