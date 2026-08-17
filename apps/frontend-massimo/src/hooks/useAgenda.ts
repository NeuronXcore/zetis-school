import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type AgendaAhead,
  type AgendaLateAlert,
  type AgendaItemStudent,
  type AgendaMonth,
  type AgendaPlanStep,
  type AgendaTraceDetail,
  type AgendaWeek,
} from "@zetis/types";
import {
  dismissAgendaItem,
  fetchAgendaDayTraces,
  fetchAgendaItems,
  fetchAgendaAhead,
  fetchLateAlert,
  markLateAlertSeen,
  fetchAgendaMonth,
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
  /** La grille mois — chargée **à la demande**, la première fois qu'on bascule dessus (§D7 : la
   *  bande est le défaut). La précharger ferait naître les plans de tout le mois pour une vue
   *  que Massimo n'ouvrira peut-être jamais. */
  month: AgendaMonth | null;
  view: AgendaView;
  setView: (view: AgendaView) => void;
  goToMonth: (anchor: string) => void;
  /** Ce que Massimo a travaillé le jour OUVERT (Amdt 8 §D2). Une requête par jour ouvert : le
   *  détail n'intéresse que le jour qu'on ouvre, le précharger sur 42 jours coûterait autant de
   *  jointures pour rien. */
  dayTraces: AgendaTraceDetail[];
  openDay: (date: string | null) => void;
  pickedDay: string | null;
  /** Items de la bande. La bande LIT cette liste (et non `week.fixed_items`) pour que la coche
   *  optimiste s'y reflète immédiatement ; `week` ne sert que pour les dates et les traces,
   *  qui sont les seules données que le serveur seul peut calculer. */
  items: AgendaItemStudent[];
  /** « Prendre de l'avance » (Amdt 9) — la prochaine échéance et les gestes qui la préparent.
   *
   *  `null` = le chargement a échoué (la page perd un bloc, pas sa raison d'être). Un objet dont
   *  l'`anchor` est `null` n'est PAS la même chose : c'est une réponse, et le bloc la rend. */
  ahead: AgendaAhead | null;
  /** L'échéance à signaler à l'ouverture (§D12), ou `null` — du NOUVEAU retard seulement, une
   *  fois par jour. C'est le serveur qui tranche : le client ne calcule aucun retard. */
  lateAlert: AgendaLateAlert | null;
  /** Accuse réception de l'alerte. Appelé par le toast, une fois RÉELLEMENT affiché. */
  markLateAlertSeen: (itemId: number) => void;
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

export type AgendaView = "bande" | "mois";

/** Où le choix de vue survit. Le sélecteur est persisté — c'est ce qui rend l'arbitrage §D7
 *  (« la bande par défaut ») réversible **sans code** si l'usage le dément. */
const CLE_VUE = "zetis.agenda.vue";

function vueInitiale(): AgendaView {
  try {
    return localStorage.getItem(CLE_VUE) === "mois" ? "mois" : "bande";
  } catch {
    // Navigation privée, stockage refusé : la bande, comme le défaut.
    return "bande";
  }
}

export function useAgenda(): UseAgenda {
  const [week, setWeek] = useState<AgendaWeek | null>(null);
  const [month, setMonth] = useState<AgendaMonth | null>(null);
  const [view, setViewState] = useState<AgendaView>(vueInitiale);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [dayTraces, setDayTraces] = useState<AgendaTraceDetail[]>([]);
  const [items, setItems] = useState<AgendaItemStudent[]>([]);
  const [ahead, setAhead] = useState<AgendaAhead | null>(null);
  const [lateAlert, setLateAlert] = useState<AgendaLateAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [today] = useState(() => new Date());
  const [undoable, setUndoable] = useState<AgendaItemStudent | null>(null);
  const undoTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    // 🔴 `fetchAgendaUpcoming` n'est PLUS appelée ici (Amdt 8 §D8) : la section « Ce qui arrive »
    // a quitté `/agenda`. ⚠️ **La fonction et la route restent vivantes** — `HomeAgendaBanner` et
    // `useSubjectUpcoming` les consomment. Ne pas les supprimer en croyant nettoyer du mort.
    const weekData = await fetchAgendaWeek().catch(() => null);
    setWeek(weekData);

    // La fenêtre des items est DÉRIVÉE de la bande servie, jamais recalculée ici : l'amplitude
    // est un réglage serveur (`AGENDA_BAND_DAYS_*`), et la dupliquer côté client garantissait
    // qu'elles divergent au premier changement. Repli sur ±3 jours seulement si `/week` a
    // échoué — Massimo ne remonte de toute façon jamais au-delà de ses 3 jours passés.
    const days = weekData?.days ?? [];
    const from = days[0]?.date ?? isoDay(addDays(today, -3));
    const to = days[days.length - 1]?.date ?? isoDay(addDays(today, 3));
    // ⚠️ `/ahead` part EN PARALLÈLE de la fenêtre d'items : il ne dépend pas de la bande, et
    // l'enchaîner ajouterait un aller-retour à la chaîne critique. `/items`, lui, doit attendre
    // `/week` — sa fenêtre en est dérivée.
    const [fenetre, avance, alerte] = await Promise.all([
      fetchAgendaItems(from, to).catch(() => [] as AgendaItemStudent[]),
      // Échec silencieux : sans lui la page perd un bloc, elle ne perd pas sa raison d'être.
      fetchAgendaAhead().catch(() => null),
      // ⚠️ **Lire ne consomme pas** (§D12) : l'accusé de réception part du toast, une fois monté.
      fetchLateAlert().catch(() => null),
    ]);
    setItems(fenetre);
    setAhead(avance);
    setLateAlert(alerte);
    setLoading(false);
  }, [today]);

  /** Charge un mois ET les items qu'il rend. ⚠️ Les deux fenêtres doivent coïncider, sinon la
   *  grille afficherait des glyphes d'échéances que `itemsByDate` ne connaît pas. */
  const goToMonth = useCallback(async (anchor: string) => {
    const data = await fetchAgendaMonth(anchor).catch(() => null);
    if (data === null) return;
    setMonth(data);
    const jours = data.days;
    const from = jours[0]?.date;
    const to = jours[jours.length - 1]?.date;
    if (!from || !to) return;
    const mois = await fetchAgendaItems(from, to).catch(() => [] as AgendaItemStudent[]);
    // Fusion sur l'`id` : les items de la bande restent en mémoire (la coche optimiste y vit),
    // ceux du mois s'y ajoutent. Remplacer la liste ferait disparaître les jours de la bande
    // hors du mois affiché.
    setItems((current) => {
      const par_id = new Map(current.map((item) => [item.id, item]));
      for (const item of mois) par_id.set(item.id, item);
      return [...par_id.values()];
    });
  }, []);

  const setView = useCallback(
    (next: AgendaView) => {
      setViewState(next);
      try {
        localStorage.setItem(CLE_VUE, next);
      } catch {
        // stockage refusé : le choix vaut pour la session, ce qui suffit
      }
      // Le chargement lui-même est tenu par l'effet ci-dessus, qui couvre AUSSI le montage avec
      // une vue « mois » persistée. Le faire ici en plus le dédoublerait au premier clic.
    },
    [],
  );

  /** Ouvre (ou referme) un jour, et va chercher ce qui y a été travaillé. */
  const openDay = useCallback((date: string | null) => {
    setPickedDay(date);
    setDayTraces([]);
    if (date === null) return;
    void fetchAgendaDayTraces(date)
      .then((data) => setDayTraces(data.subjects))
      // Échec silencieux : le panneau rend ses échéances, il perd seulement son récit. Un
      // message d'erreur pour ça coûterait plus qu'il ne rapporte.
      .catch(() => setDayTraces([]));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 🔴 **Le choix de vue est PERSISTÉ : il faut donc aussi charger au MONTAGE.**
  // Vu à l'écran le 2026-08-17 : après avoir choisi « Mois » puis rechargé la page, le sélecteur
  // affichait bien « Mois » — et la grille était **absente**. `setView` chargeait paresseusement
  // au clic, mais un retour sur la page ne passe par aucun clic. Le sélecteur disait donc une
  // chose que l'écran ne montrait pas, ce qui se lit comme une panne.
  useEffect(() => {
    if (view === "mois" && month === null) void goToMonth(isoDay(today).slice(0, 7));
  }, [view, month, goToMonth, today]);

  // Ouvrir `/agenda` EST le regard (addendum ADR-0025 §12.3) : le témoin de nouveauté retombe.
  // Effet séparé et sans dépendance, donc UNE fois à l'ouverture — le mettre dans `load()` le
  // rejouerait à chaque coche, ce qui marcherait mais confondrait « regarder » et « agir ».
  useEffect(() => {
    void markAgendaSeen();
  }, []);

  /** Accuse réception de l'alerte, et l'efface localement pour que le toast ne remonte pas si la
   *  page se re-rend. Le serveur, lui, ne la resservira plus de la journée. */
  const accuserAlerte = useCallback((itemId: number) => {
    void markLateAlertSeen(itemId);
    setLateAlert(null);
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
      // `setUpcoming` a disparu avec la section « Ce qui arrive » (Amdt 8 §D8). Le retrait
      // optimiste de la liste `items` suffit : c'est elle que les deux vues et le panneau lisent.
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
    items,
    ahead,
    lateAlert,
    markLateAlertSeen: accuserAlerte,
    sections,
    planByItem,
    loading,
    today,
    toggleDone,
    toggleStep,
    dismiss,
    undoable,
    undoDismiss,
    month,
    view,
    setView,
    goToMonth,
    dayTraces,
    openDay,
    pickedDay,
  };
}
