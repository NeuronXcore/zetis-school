import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type AgendaItemDraft,
  type AgendaItemPatch,
  type AgendaItemPilot,
  type CurriculumChapter,
} from "@zetis/types";
import { type SubjectOption } from "../components/agenda/AgendaBatchEntry";
import { type LessonOption } from "../components/agenda/LabelField";
import { fetchActiveSchoolYear, fetchChapters, fetchLessons } from "../lib/curriculum";
import {
  archiveAgendaItem,
  createAgendaItems,
  fetchAgendaItems,
  fetchAgendaSettings,
  patchAgendaItem,
  setAgendaNote,
  setAgendaSettings,
} from "../lib/agenda";
import {
  type AgendaFilter,
  type AgendaKpis,
  type AgendaPeriod,
  agendaKpis,
  filterItems,
  loadedRange,
} from "../lib/agendaModel";

// Toute la logique de la page « Agenda » vit ici (les composants restent présentationnels).
//
// **Une seule requête d'items**, sur une fenêtre large chargée au montage : les filtres et les
// compteurs en dérivent tous. Recharger à chaque changement de filtre ferait diverger un KPI
// d'une vue pour une raison purement technique, sur un volume qui tient largement en mémoire
// (un enfant, quelques échéances par semaine).
//
// **Aucune fonction de coche n'existe ici** : seul Massimo écrit `done_at` (ADR-0025 §2b).

export interface UseAgenda {
  items: AgendaItemPilot[];
  visible: AgendaItemPilot[];
  kpis: AgendaKpis;
  filter: AgendaFilter;
  loading: boolean;
  error: string | null;
  saving: boolean;
  studentEntryEnabled: boolean;
  today: Date;
  setPeriod: (period: AgendaPeriod) => void;
  setSubjectId: (subjectId: number | null) => void;
  reload: () => void;
  createItems: (drafts: AgendaItemDraft[]) => Promise<void>;
  updateItem: (id: number, body: AgendaItemPatch) => Promise<void>;
  updateNote: (id: number, note: string | null) => Promise<void>;
  archive: (id: number) => Promise<void>;
  toggleStudentEntry: (enabled: boolean) => Promise<void>;
}

/** Matières de l'année active + chapitres du référentiel + intitulés de cours, à la demande.
 *
 * Séparé de `useAgenda` parce que ce sont des données de RÉFÉRENTIEL, pas d'agenda : elles ne
 * changent pas quand une échéance bouge, et les recharger à chaque mutation serait du bruit.
 * Le chapitre est facultatif partout (ADR-0025 §11) — un référentiel vide n'empêche jamais
 * d'enregistrer une échéance, et l'intitulé retombe alors en texte libre (addendum §13.1). */
export function useAgendaReferential() {
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [chaptersBySys, setChaptersBySys] = useState<Record<number, CurriculumChapter[]>>({});
  const [chaptersLoading, setChaptersLoading] = useState<Set<number>>(new Set());
  const [lessonsByChapter, setLessonsByChapter] = useState<Record<number, LessonOption[]>>({});
  const [lessonsLoading, setLessonsLoading] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchActiveSchoolYear()
      .then((year) =>
        setSubjects(
          year.subjects.map((s) => ({ id: s.subject_id, name: s.subject_name, sysId: s.id })),
        ),
      )
      // Sans année active, la grille reste utilisable sans matière : on ne bloque pas la
      // saisie sur une donnée facultative.
      .catch(() => setSubjects([]));
  }, []);

  const loadChapters = useCallback((sysId: number) => {
    setChaptersLoading((s) => new Set(s).add(sysId));
    fetchChapters(sysId)
      .then((rows) => setChaptersBySys((all) => ({ ...all, [sysId]: rows })))
      .catch(() => setChaptersBySys((all) => ({ ...all, [sysId]: [] })))
      .finally(() =>
        setChaptersLoading((s) => {
          const next = new Set(s);
          next.delete(sysId);
          return next;
        }),
      );
  }, []);

  // Intitulés proposés pour un chapitre — même patron que `loadChapters`, à trois différences
  // près, toutes voulues :
  //
  // 1. On ne garde que `{id, title}`, et seulement pour les leçons **validées** (addendum
  //    ADR-0025 §13.2). Le filtre vit ICI et nulle part ailleurs : `label` est la seule chaîne de
  //    l'agenda que Massimo lit, et deux composants la consomment — une seule règle, un seul
  //    endroit. L'`id` s'est ajouté au §15 : c'est lui qui ouvrira le cours chez Massimo.
  // 2. Un `Set` d'ids en cours, pas un id unique comme `useSubjects.chapterLessonsLoadingId` :
  //    la grille de saisie a plusieurs lignes sur des chapitres différents qui chargent en même
  //    temps, un accordéon n'en a qu'un.
  // 3. `catch → []` : un référentiel injoignable fait retomber l'intitulé en texte libre, il ne
  //    bloque jamais une saisie.
  const loadLessons = useCallback((chapterId: number) => {
    setLessonsLoading((s) => new Set(s).add(chapterId));
    fetchLessons(chapterId)
      .then((rows) =>
        setLessonsByChapter((all) => ({
          ...all,
          [chapterId]: rows
            .filter((l) => l.status === "validated")
            .map((l) => ({ id: l.id, title: l.title })),
        })),
      )
      .catch(() => setLessonsByChapter((all) => ({ ...all, [chapterId]: [] })))
      .finally(() =>
        setLessonsLoading((s) => {
          const next = new Set(s);
          next.delete(chapterId);
          return next;
        }),
      );
  }, []);

  return {
    subjects,
    chaptersBySys,
    chaptersLoading,
    loadChapters,
    lessonsByChapter,
    lessonsLoading,
    loadLessons,
  };
}

export function useAgenda(): UseAgenda {
  const [items, setItems] = useState<AgendaItemPilot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [studentEntryEnabled, setStudentEntryEnabled] = useState(false);
  const [filter, setFilter] = useState<AgendaFilter>({ period: "current", subjectId: null });

  // Figé au montage : recalculer « aujourd'hui » à chaque rendu ferait bouger les bornes de
  // période pendant l'usage (et casserait la mémoïsation pour rien).
  const [today] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = loadedRange(today);
    try {
      const [rows, settings] = await Promise.all([
        fetchAgendaItems(from, to),
        fetchAgendaSettings(),
      ]);
      setItems(rows);
      setStudentEntryEnabled(settings.student_entry_enabled);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Toute mutation recharge la fenêtre : le serveur reste la source de vérité (il pose
   *  lui-même `edited_by_parent_at`, un état optimiste le manquerait). */
  const mutate = useCallback(
    async (action: () => Promise<unknown>, failure: string) => {
      setSaving(true);
      setError(null);
      try {
        await action();
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : failure);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const visible = useMemo(() => filterItems(items, filter, today), [items, filter, today]);
  const kpis = useMemo(() => agendaKpis(items, today), [items, today]);

  return {
    items,
    visible,
    kpis,
    filter,
    loading,
    error,
    saving,
    studentEntryEnabled,
    today,
    setPeriod: (period) => setFilter((f) => ({ ...f, period })),
    setSubjectId: (subjectId) => setFilter((f) => ({ ...f, subjectId })),
    reload: () => void load(),
    createItems: (drafts) => mutate(() => createAgendaItems(drafts), "Enregistrement impossible"),
    updateItem: (id, body) => mutate(() => patchAgendaItem(id, body), "Modification impossible"),
    updateNote: (id, note) => mutate(() => setAgendaNote(id, note), "Note non enregistrée"),
    archive: (id) => mutate(() => archiveAgendaItem(id), "Archivage impossible"),
    toggleStudentEntry: async (enabled) => {
      setError(null);
      try {
        const next = await setAgendaSettings(enabled);
        setStudentEntryEnabled(next.student_entry_enabled);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Réglage non enregistré");
      }
    },
  };
}
