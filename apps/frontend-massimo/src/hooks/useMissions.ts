import { useCallback, useEffect, useRef, useState } from "react";
import { useCelebrate } from "@zetis/ui";
import {
  type CompletedMission,
  type Mission,
  type MissionStep,
  type MissionTodayResponse,
  type MotivationMessage,
  type StepCompleteResult,
} from "@zetis/types";
import { fetchCompletedToday, fetchMissions, fetchToday, startMission } from "../lib/missions";
import { fetchWrapUp } from "../lib/motivation";
import { fetchNotionsSummary } from "../lib/notions";

// Hook de la page Missions (ADR-0017). TOUTE l'orchestration vit ici ; le composant reste
// présentationnel. Rappel de frontière : le hook ne décide RIEN — l'élection, la preuve de chaque
// étape et le verdict sont 100 % serveur. Massimo ne quitte JAMAIS /missions : ouvrir une étape
// démarre la mission puis affiche l'activité EN MODALE (`activeActivity`) ; c'est la modale qui
// valide l'étape (via `completeStepSafely`) et remonte le résultat par `onStepDone`.

export type ActivityKind = "eli5" | "quiz" | "mindmap";

export interface ActiveActivity {
  mission: Mission;
  step: MissionStep;
  kind: ActivityKind;
}

// eli5 & vocal_explain partagent la modale ELI5 (une session comprendre→reformuler couvre les deux).
function activityKind(stepType: string): ActivityKind {
  if (stepType === "quiz") return "quiz";
  if (stepType === "mindmap") return "mindmap";
  return "eli5";
}

/** Étape courante = première non terminée (les étapes se complètent dans l'ordre `sort_order`). */
export function currentStep(mission: Mission): MissionStep | null {
  return (
    [...mission.steps].sort((a, b) => a.sort_order - b.sort_order).find((s) => s.status !== "done") ??
    null
  );
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // enlève les diacritiques (é → e)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface SubjectGroup {
  name: string;
  slug: string;
  missions: Mission[]; // disponibles (planned|active), hors mission élue
}

export interface CompletionBanner {
  verdict: "acquired" | "review_later";
  xp: number;
  /** Défi champion croisé (ADR-0022) → célébration dédiée 🏆. */
  champion: boolean;
  /** Mot de la fin servi par ZETIS (« demain on finit … »). `null` si l'appel échoue : une fin
   *  de mission ne doit JAMAIS être bloquée par un message d'accompagnement. */
  wrapUp: MotivationMessage | null;
}

export interface UseMissions {
  loading: boolean;
  error: string | null;
  today: MissionTodayResponse | null;
  groups: SubjectGroup[];
  /** Défis champion croisés (ADR-0022) — hors groupes matière (multi-matières). */
  champions: Mission[];
  upToDate: { name: string; slug: string }[];
  completed: CompletedMission[];
  /** Verdict de la mission qu'on vient de terminer (à afficher, deux issues positives). */
  completion: CompletionBanner | null;
  busy: boolean;
  /** Activité ouverte en modale (ou null). */
  activeActivity: ActiveActivity | null;
  /** Slug d'une matière depuis son nom (les missions ne portent que le nom) → icône PNG. */
  slugForSubject: (name: string) => string;
  /** Démarre la mission si besoin puis ouvre l'activité de l'étape EN MODALE (pas de navigation). */
  openStep: (mission: Mission, step: MissionStep) => void;
  /** Appelé par une modale quand le serveur a validé une étape (verdict/XP éventuel). */
  onStepDone: (result: StepCompleteResult) => void;
  closeActivity: () => void;
  reload: () => void;
  dismissCompletion: () => void;
}

export function useMissions(): UseMissions {
  const celebrate = useCelebrate();

  const [today, setToday] = useState<MissionTodayResponse | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [completed, setCompleted] = useState<CompletedMission[]>([]);
  const [nameToSlug, setNameToSlug] = useState<Record<string, string>>({});
  const [allSubjects, setAllSubjects] = useState<{ name: string; slug: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<CompletionBanner | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeActivity, setActiveActivity] = useState<ActiveActivity | null>(null);

  const load = useCallback(async () => {
    const [todayRes, missionsRes, completedRes] = await Promise.all([
      fetchToday(),
      fetchMissions(),
      fetchCompletedToday(),
    ]);
    setToday(todayRes);
    setMissions(missionsRes);
    setCompleted(completedRes);
  }, []);

  const mountedOnce = useRef(false);
  useEffect(() => {
    if (mountedOnce.current) return;
    mountedOnce.current = true;
    setLoading(true);
    setError(null);
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => setLoading(false));
    // Source secondaire (non bloquante) : nom→slug des matières + liste « à jour ».
    fetchNotionsSummary()
      .then((data) => {
        setNameToSlug(Object.fromEntries(data.subjects.map((s) => [s.name, s.slug])));
        setAllSubjects(data.subjects.map((s) => ({ name: s.name, slug: s.slug })));
      })
      .catch(() => {
        /* dégradation douce : icônes en repli, pas de lignes « à jour » */
      });
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Chargement impossible"))
      .finally(() => setLoading(false));
  }, [load]);

  const openStep = useCallback(
    (mission: Mission, step: MissionStep) => {
      if (busy || activeActivity) return;
      setBusy(true);
      void (async () => {
        try {
          // La preuve doit être POSTÉRIEURE au start → on démarre avant d'ouvrir l'activité.
          const started = mission.status === "planned" ? await startMission(mission.id) : mission;
          setActiveActivity({ mission: started, step, kind: activityKind(step.step_type) });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Un petit souci — réessaie dans un instant ✨");
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, activeActivity],
  );

  // Une modale a validé une étape : on rafraîchit (frise/hero avancent) et, si la mission est finie,
  // on montre le verdict + la mini-victoire (les deux issues sont positives).
  const onStepDone = useCallback(
    (result: StepCompleteResult) => {
      if (result.mission_status === "completed" && result.verdict) {
        const verdict = result.verdict as "acquired" | "review_later";
        const champion = activeActivity?.mission.mission_type === "champion";
        setCompletion({ verdict, xp: result.xp_awarded, champion, wrapUp: null });
        // Le mot de la fin arrive après coup : la bannière s'affiche immédiatement, ZETIS
        // complète quand il a répondu. Un seul appel par fin de mission, jamais de polling.
        void fetchWrapUp()
          .then((wrapUp) =>
            setCompletion((current) => (current ? { ...current, wrapUp } : current)),
          )
          .catch(() => {
            /* silence : la bannière reste, simplement sans mot de la fin */
          });
        celebrate({
          title: champion ? "Défi champion relevé ! 🏆" : "Mission terminée !",
          subtitle:
            verdict === "acquired"
              ? champion
                ? "Toutes les notions bien en place — bravo champion 🏆"
                : "Notion bien en place ✓"
              : "On la reverra bientôt, tranquille 🌙",
        });
      }
      void load().catch(() => {
        /* le rafraîchissement échoue silencieusement : l'état courant reste affiché */
      });
    },
    [celebrate, load, activeActivity],
  );

  const closeActivity = useCallback(() => {
    setActiveActivity(null);
    reload(); // reflète l'avancée (mission démarrée / étape validée) derrière la modale
  }, [reload]);

  // --- Dérivations (regroupement par matière côté client, ADR-0017 §3) ---------------------
  // L'élue est INCLUSE dans son groupe matière (sinon une matière dont la seule mission est l'élue
  // serait classée « à jour » à tort). Le disque « Mission du jour » n'est qu'un raccourci vers elle.
  const available = missions.filter((msn) => msn.status === "planned" || msn.status === "active");
  // Les champions croisées (ADR-0022) sont HORS matière (subject vide) → leur propre deck 🏆,
  // jamais dans un groupe matière (ni dans le décompte « à jour »).
  const champions = available.filter((msn) => msn.mission_type === "champion");
  const regular = available.filter((msn) => msn.mission_type !== "champion");

  const groupMap = new Map<string, Mission[]>();
  for (const msn of regular) {
    const list = groupMap.get(msn.subject) ?? [];
    list.push(msn);
    groupMap.set(msn.subject, list);
  }
  const groups: SubjectGroup[] = [...groupMap.entries()]
    .map(([name, list]) => ({ name, slug: nameToSlug[name] ?? slugify(name), missions: list }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  // Matières « à jour » : au programme mais sans aucune mission disponible (élue incluse dans le
  // décompte des « à traiter » — une matière dont la seule mission est l'élue n'est pas à jour).
  const subjectsWithMissions = new Set(regular.map((msn) => msn.subject));
  const upToDate = allSubjects
    .filter((s) => !subjectsWithMissions.has(s.name))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const slugForSubject = useCallback(
    (name: string) => nameToSlug[name] ?? slugify(name),
    [nameToSlug],
  );

  return {
    loading,
    error,
    today,
    groups,
    champions,
    upToDate,
    completed,
    completion,
    busy,
    activeActivity,
    slugForSubject,
    openStep,
    onStepDone,
    closeActivity,
    reload,
    dismissCompletion: () => setCompletion(null),
  };
}
