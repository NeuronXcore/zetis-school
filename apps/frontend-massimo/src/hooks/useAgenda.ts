import { useCallback, useEffect, useMemo, useState } from "react";
import { type AgendaItemStudent, type AgendaUpcomingItem, type AgendaWeek } from "@zetis/types";
import {
  dismissAgendaItem,
  fetchAgendaItems,
  fetchAgendaUpcoming,
  fetchAgendaWeek,
  setAgendaItemDone,
} from "../lib/agenda";
import { type AgendaSections, addDays, isoDay, splitSections } from "../lib/agendaSections";

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
  loading: boolean;
  today: Date;
  toggleDone: (item: AgendaItemStudent) => void;
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

  const sections = useMemo(
    () => (items.length === 0 ? EMPTY : splitSections(items, today)),
    [items, today],
  );

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

  return { week, upcoming, items, sections, loading, today, toggleDone, dismiss };
}
