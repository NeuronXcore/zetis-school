// Toute la logique de la page matière (addendum ADR-0024). Le composant n'en calcule AUCUNE :
// il rend ce que ce hook lui donne. C'est la règle `CLAUDE.md` (« pas de logique métier lourde
// dans les composants »), et ici elle a une conséquence concrète — les interdits de l'ADR
// (aucun score, aucun arriéré, aucun vocabulaire d'échec) se tiennent à un seul endroit.
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ContentRequestKind,
  GalaxyAction,
  GalaxyActionKind,
  GalaxySubjectRef,
  PanoplyNotion,
} from "@zetis/types";
import { PanoplyError, createContentRequest, fetchSubjectPanoply } from "../lib/panoply";
import { fetchReviewsSummary } from "../lib/reviews";
import { matchesQuery } from "../lib/searchFold";
import { type NotionRoute, missingRequestKinds, notionRouteFor } from "../lib/notionRoutes";

export interface PanoplyChapterView {
  chapter_id: number;
  title: string;
  /** Notions DÉJÀ filtrées par la recherche. */
  notions: PanoplyNotion[];
  open: boolean;
}

export interface UseSubjectPanoply {
  loading: boolean;
  /** 404 : matière inconnue ou hors année active. */
  notFound: boolean;
  subject: GalaxySubjectRef | null;

  /** Décomptes du CATALOGUE, insensibles au filtre : « 3 chapitres · 9 notions » décrit ce qui
   *  existe, pas ce que la recherche a laissé. */
  chapterCount: number;
  notionCount: number;

  /** Ce que servirait la session de révision de cette matière. `0` → la carte ne se rend pas.
   *  JAMAIS `due_count` : un compteur d'arriéré est la pression quotidienne interdite. */
  reviewSessionSize: number;

  query: string;
  setQuery: (q: string) => void;
  clearQuery: () => void;
  /** `null` quand rien n'est cherché — « rien de cherché » n'est pas « zéro trouvé », et
   *  afficher « 0 notion trouvée » au chargement serait un échec inventé. */
  matchCount: number | null;
  chapters: PanoplyChapterView[];

  toggleChapter: (chapterId: number) => void;
  selectedSkillId: number | null;
  selectNotion: (skillId: number) => void;

  routeFor: (action: GalaxyAction) => NotionRoute;
  /** La première activité FAISABLE — celle qui porte l'accent. `null` si rien n'est faisable. */
  primaryKindOf: (notion: PanoplyNotion) => GalaxyActionKind | null;
  missingKindsOf: (notion: PanoplyNotion) => ContentRequestKind[];
  isRequested: (skillId: number, kind: ContentRequestKind) => boolean;
  request: (skillId: number, kinds: ContentRequestKind[]) => Promise<void>;
  toast: string | null;
}

const TOAST_MS = 2800;
export const REQUEST_TOAST = "C'est noté pour Papa";

export function useSubjectPanoply(slug: string | undefined): UseSubjectPanoply {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [subject, setSubject] = useState<GalaxySubjectRef | null>(null);
  const [rawChapters, setRawChapters] = useState<
    { chapter_id: number; title: string; notions: PanoplyNotion[] }[]
  >([]);
  const [reviewSessionSize, setReviewSessionSize] = useState(0);

  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState<Set<number> | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<number | null>(null);
  const [requested, setRequested] = useState<Record<number, Set<ContentRequestKind>>>({});
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    setNotFound(false);
    // `allSettled` et jamais `all` : un résumé de révision en panne ne doit pas emporter
    // l'index des notions — Massimo doit toujours voir sa matière, même dégradée.
    void Promise.allSettled([fetchSubjectPanoply(slug), fetchReviewsSummary()]).then(
      ([panoply, reviews]) => {
        if (!active) return;
        if (panoply.status === "fulfilled") {
          setSubject(panoply.value.subject);
          setRawChapters(panoply.value.chapters);
          // TOUS les chapitres sont repliés à l'ouverture (décision du 2026-08-01). L'index
          // s'ouvre donc sur la carte de la matière — la liste des chapitres — et non sur le
          // contenu de l'un d'eux : Massimo choisit où il entre. La recherche, elle, ouvre
          // d'office ce qu'elle trouve, donc rien ne reste caché quand on cherche.
          setOpenIds(new Set());
        } else {
          setNotFound(panoply.reason instanceof PanoplyError && panoply.reason.status === 404);
        }
        if (reviews.status === "fulfilled") {
          const mine = reviews.value.subjects.find((s) => s.slug === slug);
          setReviewSessionSize(mine?.session_size ?? 0);
        }
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const searching = query.trim().length > 0;

  const chapters = useMemo<PanoplyChapterView[]>(() => {
    if (!searching) {
      return rawChapters.map((c) => ({ ...c, open: openIds?.has(c.chapter_id) ?? false }));
    }
    // En recherche, l'arbre obéit aux résultats : un chapitre porteur s'OUVRE, un chapitre
    // sans trouvaille DISPARAÎT (il ne se contente pas de se replier — le laisser afficherait
    // du bruit entre les réponses).
    return rawChapters
      .map((c) => ({
        ...c,
        notions: c.notions.filter((n) => matchesQuery(n.name, query)),
        open: true,
      }))
      .filter((c) => c.notions.length > 0);
  }, [rawChapters, openIds, query, searching]);

  const matchCount = useMemo(
    () => (searching ? chapters.reduce((sum, c) => sum + c.notions.length, 0) : null),
    [chapters, searching],
  );

  const notionCount = useMemo(
    () => rawChapters.reduce((sum, c) => sum + c.notions.length, 0),
    [rawChapters],
  );

  const toggleChapter = useCallback((chapterId: number) => {
    setOpenIds((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }, []);

  const selectNotion = useCallback((skillId: number) => {
    setSelectedSkillId((prev) => (prev === skillId ? null : skillId));
  }, []);

  const clearQuery = useCallback(() => setQuery(""), []);

  const routeFor = useCallback(
    (action: GalaxyAction): NotionRoute => {
      const notion = rawChapters
        .flatMap((c) => c.notions)
        .find((n) => n.skill_id === selectedSkillId);
      if (!notion || !subject) return { mode: "none" };
      return notionRouteFor(action, {
        skillId: notion.skill_id,
        name: notion.name,
        subjectSlug: subject.slug,
        subjectName: subject.name,
        // Depuis l'index, on revient à l'index — c'est ce que l'extraction de la table de
        // routes a rendu possible (le `returnTo` y était figé à « /galaxy »).
        returnTo: `/subjects/${subject.slug}`,
      });
    },
    [rawChapters, selectedSkillId, subject],
  );

  const primaryKindOf = useCallback(
    (notion: PanoplyNotion) => notion.actions.find((a) => a.available)?.kind ?? null,
    [],
  );

  const missingKindsOf = useCallback(
    (notion: PanoplyNotion) => missingRequestKinds(notion.actions),
    [],
  );

  const isRequested = useCallback(
    (skillId: number, kind: ContentRequestKind) => requested[skillId]?.has(kind) ?? false,
    [requested],
  );

  const request = useCallback(async (skillId: number, kinds: ContentRequestKind[]) => {
    if (kinds.length === 0) return;
    // Optimiste : la pastille passe en « demandé » tout de suite. Massimo n'attend pas le
    // réseau pour un geste qui, de son point de vue, est déjà fait.
    setRequested((prev) => ({ ...prev, [skillId]: new Set([...(prev[skillId] ?? []), ...kinds]) }));
    setToast(REQUEST_TOAST);
    try {
      await createContentRequest({ skill_id: skillId, content_kinds: kinds });
    } catch {
      // Retour arrière SILENCIEUX. Une demande perdue ne vaut pas un écran d'erreur chez un
      // enfant : il retapera. Un message d'échec, lui, se retient.
      setRequested((prev) => {
        const next = new Set(prev[skillId] ?? []);
        for (const kind of kinds) next.delete(kind);
        return { ...prev, [skillId]: next };
      });
      setToast(null);
    }
  }, []);

  return {
    loading,
    notFound,
    subject,
    chapterCount: rawChapters.length,
    notionCount,
    reviewSessionSize,
    query,
    setQuery,
    clearQuery,
    matchCount,
    chapters,
    toggleChapter,
    selectedSkillId,
    selectNotion,
    routeFor,
    primaryKindOf,
    missingKindsOf,
    isRequested,
    request,
    toast,
  };
}
