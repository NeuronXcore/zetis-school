import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  undismissAgendaItem,
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
  /** Le dernier item masqué, TANT QU'IL EST RATTRAPABLE — `null` sinon.
   *
   *  🔴 La croix ✕ n'avait aucun retour : le devoir quittait l'agenda **définitivement**, et
   *  Papa lui-même ne pouvait que le ressaisir (`dismissed_at` est hors des deux listes de
   *  champs éditables). Défaut trouvé à la relecture humaine du 2026-08-10 ; le §2c de
   *  l'ADR-0025 n'avait rien décidé sur l'irréversibilité, il tranchait « masquer ≠ supprimer ». */
  undoable: AgendaItemStudent | null;
  undoDismiss: () => void;
}

const EMPTY: AgendaSections = { today: [], tomorrow: [], later: [], resume: [] };

/** Fenêtre de rattrapage du masquage.
 *
 *  ⚠️ **Généreuse exprès.** Le geste à rattraper est un tap accidentel sur un écran de
 *  téléphone : le temps de comprendre que la carte a disparu, de la chercher, puis de vouloir la
 *  ramener. Les 5 s d'un « toast » habituel sont calibrées pour un adulte qui savait ce qu'il
 *  faisait. Au-delà de cette fenêtre, le rattrapage reste possible **chez Papa**, qui voit
 *  l'archive et peut la rendre — c'est la seconde moitié du correctif, et le filet du filet. */
const UNDO_MS = 20_000;

export function useAgenda(): UseAgenda {
  const [week, setWeek] = useState<AgendaWeek | null>(null);
  const [upcoming, setUpcoming] = useState<AgendaUpcomingItem[]>([]);
  const [items, setItems] = useState<AgendaItemStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date());
  const [undoable, setUndoable] = useState<AgendaItemStudent | null>(null);
  const undoTimer = useRef<number | null>(null);

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

  const dismiss = useCallback(
    (item: AgendaItemStudent) => {
      setItems((all) => all.filter((i) => i.id !== item.id));
      setUpcoming((all) => all.filter((u) => u.id !== item.id));
      // Le masquage devient RATTRAPABLE (relecture humaine du 2026-08-10) : il ne se
      // confirme pas d'avance — un dialogue sur l'écran d'un enfant met une friction sur
      // chaque geste, y compris les bons — il se DÉFAIT après coup.
      setUndoable(item);
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoable(null), UNDO_MS);
      dismissAgendaItem(item.id).catch(() => void load());
    },
    [load],
  );

  /** Rend l'item masqué à l'agenda. Optimiste comme le masquage : `splitSections` retrie par
   *  date, l'item retrouve donc sa place sans qu'on ait à mémoriser son index. */
  const undoDismiss = useCallback(() => {
    setUndoable((item) => {
      if (item === null) return null;
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
      setItems((all) => (all.some((i) => i.id === item.id) ? all : [...all, item]));
      undismissAgendaItem(item.id).catch(() => void load());
      return null;
    });
  }, [load]);

  // Le minuteur ne survit pas au démontage : sans ça, `setUndoable` s'exécuterait sur un
  // composant parti, et React le signalerait en console à chaque navigation.
  useEffect(
    () => () => {
      if (undoTimer.current !== null) window.clearTimeout(undoTimer.current);
    },
    [],
  );

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
    undoable,
    undoDismiss,
  };
}
