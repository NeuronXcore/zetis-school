// Toute la logique de la page matière (addendum ADR-0024). Le composant n'en calcule AUCUNE :
// il rend ce que ce hook lui donne. C'est la règle `CLAUDE.md` (« pas de logique métier lourde
// dans les composants »), et ici elle a une conséquence concrète — les interdits de l'ADR
// (aucun score, aucun arriéré, aucun vocabulaire d'échec) se tiennent à un seul endroit.
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ContentRequestKind,
  GalaxyAction,
  GalaxyActionKind,
  GalaxyStatus,
  GalaxySubjectRef,
  PanoplyNotion,
  ResumeItem,
  SubjectXP,
} from "@zetis/types";
import { type XpHistoryDay, fetchXpHistory } from "../lib/gamification";
import {
  PanoplyError,
  createContentRequest,
  fetchSubjectPanoply,
  fetchSubjectResume,
} from "../lib/panoply";
import { fetchReviewsSummary } from "../lib/reviews";
import { matchesQuery } from "../lib/searchFold";
import {
  type NotionRoute,
  missingRequestKinds,
  notionRouteFor,
  subjectRouteFor,
} from "../lib/notionRoutes";

export interface PanoplyChapterView {
  chapter_id: number;
  title: string;
  /** Notions DÉJÀ filtrées par la recherche. */
  notions: PanoplyNotion[];
  open: boolean;
  /** Combien de ces notions ont AU MOINS une activité faisable — « ce chapitre est déjà
   *  alimenté ». Un COMPTE, jamais un ratio : « 2 sur 3 » serait un score, et l'ADR-0024 §5
   *  n'en veut nulle part. `0` → aucun témoin n'est rendu, et le chapitre garde exactement
   *  l'apparence des autres (l'absence de contenu n'est pas un manque de l'enfant). */
  readyCount: number;
}

/** Une notion est « prête » dès qu'UNE de ses activités est faisable — c'est la question que
 *  Massimo se pose avant d'ouvrir un chapitre : y a-t-il quelque chose à faire là-dedans ? */
function countReady(notions: PanoplyNotion[]): number {
  return notions.filter((notion) => notion.actions.some((action) => action.available)).length;
}

/** L'ordre des cinq états, du plus sombre au plus lumineux. Recopié plutôt qu'importé de
 *  `@zetis/ui/galaxy` : ce hook ne doit connaître aucune couleur ni aucun libellé — c'est le
 *  composant qui les demande à `starStyle`. Ici on ne décide que de l'ORDRE et du filtre. */
const STATUSES: GalaxyStatus[] = ["mastered", "solid", "learning", "weak", "unknown"];

/** Combien de notions dans chaque état — l'anneau de la vue d'ensemble.
 *
 *  Un COMPTE, jamais un pourcentage (ADR-0024 §5, non levé). L'addendum du 2026-08-11 a rendu le
 *  XP légitime parce qu'il mesure l'EFFORT ; la maîtrise, elle, reste un état par notion. */
export interface StatusCount {
  status: GalaxyStatus;
  count: number;
}

/** Un type de contenu que ZETIS a pour cette matière, et combien il en a. */
export interface SubjectCatalogueEntry {
  kind: GalaxyActionKind;
  count: number;
  /** `null` → le compte s'affiche mais ne mène nulle part (capsule, quiz : aucune route par
   *  matière n'existe). L'appelant ne doit PAS inventer de destination. */
  route: string | null;
}

/** Champ d'identifiant porté par chaque activité — c'est lui qui permet de compter des
 *  RESSOURCES et non des notions. `eli5` et `revision` n'y figurent pas : le premier ne stocke
 *  rien, le second n'expose ni id ni compte (voir `subjectCatalogue`). */
const ID_FIELD = {
  cours: "lesson_id",
  fiche: "fiche_id",
  capsule: "capsule_id",
  mindmap: "mindmap_id",
  quiz: "quiz_id",
} as const satisfies Partial<Record<GalaxyActionKind, keyof GalaxyAction>>;

/** Combien de ressources DISTINCTES de ce type la matière met à disposition.
 *
 *  ⚠️ La déduplication par `Set` n'est pas une optimisation, c'est la correction : plusieurs
 *  notions partagent la même leçon, donc le même cours, la même fiche, la même carte et le même
 *  quiz. Compter les notions « fiche disponible » donnerait un nombre gonflé — autant de fois
 *  que la leçon enseigne de notions.
 */
function countDistinct(notions: PanoplyNotion[], kind: keyof typeof ID_FIELD): number {
  const field = ID_FIELD[kind];
  const ids = new Set<number>();
  for (const notion of notions) {
    for (const action of notion.actions) {
      if (action.kind !== kind || !action.available) continue;
      const id = action[field];
      if (typeof id === "number") ids.add(id);
    }
  }
  return ids.size;
}

/** Ce que ZETIS a pour cette matière, dans l'ordre pédagogique du serveur.
 *
 *  ⚠️ **Ces nombres mesurent ce qui est OUVRABLE DEPUIS LES NOTIONS, pas le catalogue.** Les
 *  résolveurs serveur prennent `MAX(id)` groupé par leçon : la panoplie n'expose que la
 *  ressource la PLUS RÉCENTE de chaque leçon. Une leçon portant 3 fiches validées compte donc
 *  **1** ici et **3** sur la page `/fiches`.
 *
 *  Les deux nombres sont justes et ne répondent pas à la même question. Ne pas « corriger »
 *  l'écart : ce compte-ci est le bon pour cette page, parce qu'il annonce exactement ce que
 *  Massimo trouvera en dépliant ses chapitres, juste en dessous.
 *
 *  - `revision` ne se dérive PAS : la panoplie ne porte ni id ni compte de cartes (juste un
 *    booléen par notion). Il vient du résumé de révision, en plafond de session — jamais
 *    `due_count`, qui est l'arriéré.
 *  - `eli5` est ABSENT, et ce n'est pas un oubli : il n'a pas d'id parce qu'il ne stocke rien.
 *    Il se génère à la volée. Ce n'est pas un produit du catalogue, c'est une capacité.
 */
function subjectCatalogue(
  notions: PanoplyNotion[],
  subjectSlug: string,
  reviewSessionSize: number,
): SubjectCatalogueEntry[] {
  const counts: Array<[GalaxyActionKind, number]> = [
    ["cours", countDistinct(notions, "cours")],
    ["fiche", countDistinct(notions, "fiche")],
    ["capsule", countDistinct(notions, "capsule")],
    ["mindmap", countDistinct(notions, "mindmap")],
    ["revision", reviewSessionSize],
    ["quiz", countDistinct(notions, "quiz")],
  ];
  return counts.map(([kind, count]) => ({
    kind,
    count,
    route: subjectRouteFor(kind, subjectSlug),
  }));
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

  /** Ce que Massimo a GAGNÉ dans cette matière (addendum ADR-0024 « page matière onglets »).
   *  `null` tant que la panoplie n'a pas répondu — jamais un zéro d'attente, qui se lirait comme
   *  un vrai zéro. */
  subjectXp: SubjectXP | null;

  /** Combien de notions dans chaque état, du plus lumineux au plus sombre.
   *
   *  ⚠️ **Les états à zéro sont ABSENTS**, même règle que la bande de catalogue : lister
   *  « 0 maîtrisée » serait dresser l'inventaire de ce qui manque. Un état à zéro n'a d'ailleurs
   *  aucun segment dans l'anneau — l'afficher en légende désignerait un vide.
   *
   *  Insensible au filtre de recherche : l'anneau décrit la matière, pas les résultats. */
  statusCounts: StatusCount[];

  /** Les jours où Massimo a gagné du XP dans cette matière, sur 30 jours.
   *  🔴 **Série CREUSE par contrat** — les jours sans gain sont absents, jamais à zéro. Ne jamais
   *  la compléter : la tracer en gains journaliers redescendrait à chaque absence. Le composant
   *  la rend en CUMUL, qui ne peut que monter. */
  xpDays: XpHistoryDay[];

  /** Les derniers contenus RÉOUVRABLES de la matière — `cours` et `quiz` seulement, filtrés
   *  serveur. Vide = aucune carte rendue. */
  resume: ResumeItem[];

  /** Ce que servirait la session de révision de cette matière. `0` → aucune pastille.
   *  JAMAIS `due_count` : un compteur d'arriéré est la pression quotidienne interdite. */
  reviewSessionSize: number;

  /** Ce que ZETIS a pour cette matière, par type. Insensible au filtre de recherche : la bande
   *  décrit la MATIÈRE, elle ne rétrécit pas pendant qu'on cherche. Une entrée à `0` n'est pas
   *  rendue par le composant. */
  catalogue: SubjectCatalogueEntry[];

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
// « ZETIS a noté », et non « ZETIS le prépare » : la nuance est la décision de l'addendum
// ADR-0027. Le destinataire final reste Papa (`source: "subject_page"` dans sa file), mais
// l'interlocuteur de Massimo est ZETIS — le même que dans le chat.
export const REQUEST_TOAST = "C'est noté par ZETIS";

/** Fenêtre de la courbe XP de la matière. 30 jours comme les maquettes — assez pour voir une
 *  progression, assez court pour qu'un mois calme ne noie pas une semaine de travail. */
const XP_CURVE_DAYS = 30;

export function useSubjectPanoply(
  slug: string | undefined,
  /** Chapitre à déplier d'emblée (`?chapitre=` — on arrive depuis une carte de la vue
   *  d'ensemble). `null` = tous repliés, le défaut du 2026-08-01. */
  openChapterId: number | null = null,
): UseSubjectPanoply {
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [subject, setSubject] = useState<GalaxySubjectRef | null>(null);
  const [rawChapters, setRawChapters] = useState<
    { chapter_id: number; title: string; notions: PanoplyNotion[] }[]
  >([]);
  const [reviewSessionSize, setReviewSessionSize] = useState(0);
  const [subjectXp, setSubjectXp] = useState<SubjectXP | null>(null);
  const [xpDays, setXpDays] = useState<XpHistoryDay[]>([]);
  const [resume, setResume] = useState<ResumeItem[]>([]);

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
    // `allSettled` et jamais `all` : un résumé de révision ou une courbe en panne ne doivent pas
    // emporter l'index des notions — Massimo doit toujours voir sa matière, même dégradée.
    void Promise.allSettled([
      fetchSubjectPanoply(slug),
      fetchReviewsSummary(),
      fetchXpHistory(XP_CURVE_DAYS, slug),
      fetchSubjectResume(slug),
    ]).then(([panoply, reviews, history, dernier]) => {
      if (!active) return;
      if (panoply.status === "fulfilled") {
        setSubject(panoply.value.subject);
        setRawChapters(panoply.value.chapters);
        // Servi même sur une matière sans chapitre validé : le XP appartient à l'élève, pas au
        // catalogue de Papa.
        setSubjectXp(panoply.value.subject_xp);
        // TOUS les chapitres sont repliés à l'ouverture (décision du 2026-08-01), SAUF celui
        // que l'URL désigne — on arrive alors d'une carte de la vue d'ensemble, et se retrouver
        // devant une liste repliée après avoir tapé sur un chapitre précis serait un cul-de-sac.
        // La recherche, elle, ouvre d'office ce qu'elle trouve.
        setOpenIds(new Set(openChapterId === null ? [] : [openChapterId]));
      } else {
        setNotFound(panoply.reason instanceof PanoplyError && panoply.reason.status === 404);
      }
      if (reviews.status === "fulfilled") {
        const mine = reviews.value.subjects.find((s) => s.slug === slug);
        setReviewSessionSize(mine?.session_size ?? 0);
      }
      // ⚠️ Posée telle quelle, JAMAIS complétée : les jours sans gain sont absents par contrat.
      if (history.status === "fulfilled") setXpDays(history.value.days);
      if (dernier.status === "fulfilled") setResume(dernier.value.items);
      setLoading(false);
    });
    return () => {
      active = false;
    };
    // `openChapterId` est volontairement HORS des dépendances : il ne sert qu'à l'ouverture. L'y
    // mettre relancerait les trois appels réseau à chaque fois que Massimo replie ou déplie un
    // chapitre — et écraserait au passage ce qu'il vient d'ouvrir à la main.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const searching = query.trim().length > 0;

  const chapters = useMemo<PanoplyChapterView[]>(() => {
    if (!searching) {
      return rawChapters.map((c) => ({
        ...c,
        open: openIds?.has(c.chapter_id) ?? false,
        readyCount: countReady(c.notions),
      }));
    }
    // En recherche, l'arbre obéit aux résultats : un chapitre porteur s'OUVRE, un chapitre
    // sans trouvaille DISPARAÎT (il ne se contente pas de se replier — le laisser afficherait
    // du bruit entre les réponses).
    //
    // Le compte de notions prêtes suit le FILTRE, comme le compte de notions juste à côté :
    // pendant une recherche, l'en-tête décrit ce qui est trouvé, pas le chapitre entier. Les
    // deux nombres doivent parler du même ensemble, sinon ils se contredisent.
    return rawChapters
      .map((c) => {
        const notions = c.notions.filter((n) => matchesQuery(n.name, query));
        return { ...c, notions, open: true, readyCount: countReady(notions) };
      })
      .filter((c) => c.notions.length > 0);
  }, [rawChapters, openIds, query, searching]);

  const matchCount = useMemo(
    () => (searching ? chapters.reduce((sum, c) => sum + c.notions.length, 0) : null),
    [chapters, searching],
  );

  // Sur `rawChapters` et NON sur les chapitres filtrés : la bande décrit la matière, pas les
  // résultats d'une recherche. Elle ne doit pas rétrécir pendant qu'on tape — même règle que le
  // décompte « N chapitres · N notions » de l'en-tête.
  const catalogue = useMemo(
    () =>
      subjectCatalogue(
        rawChapters.flatMap((c) => c.notions),
        subject?.slug ?? "",
        reviewSessionSize,
      ),
    [rawChapters, subject, reviewSessionSize],
  );

  const notionCount = useMemo(
    () => rawChapters.reduce((sum, c) => sum + c.notions.length, 0),
    [rawChapters],
  );

  // Sur `rawChapters`, comme la bande de catalogue : l'anneau décrit la MATIÈRE, il ne rétrécit
  // pas pendant qu'on tape dans la recherche.
  const statusCounts = useMemo<StatusCount[]>(() => {
    const tally = new Map<GalaxyStatus, number>();
    for (const chapter of rawChapters) {
      for (const notion of chapter.notions) {
        tally.set(notion.status, (tally.get(notion.status) ?? 0) + 1);
      }
    }
    return STATUSES.map((status) => ({ status, count: tally.get(status) ?? 0 })).filter(
      (entry) => entry.count > 0,
    );
  }, [rawChapters]);

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
    subjectXp,
    statusCounts,
    xpDays,
    resume,
    reviewSessionSize,
    catalogue,
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
