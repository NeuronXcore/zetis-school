import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  type NotionSummarySubject,
  type SubjectNotionRef,
} from "@zetis/types";
import { fetchNotionsSummary, fetchSubjectNotions } from "../lib/notions";
import { type Eli5Status } from "./useEli5";

// Navigation « decks matières » de l'entrée ELI5 v2 (les 3 écrans). La session ELI5
// elle-même vit dans useEli5 : ce hook n'orchestre QUE l'entrée (accueil → matière →
// session) et charge les données de lecture seule de la slice A. Aucune logique de
// session ici. On avance vers l'écran session sur le front montant d'un explain (statut
// « generating ») : ainsi chip et question résolue basculent, mais un « pas de match »
// (statut idle) reste sur l'écran matière, et un retour manuel ne rebondit pas.

export type Eli5Screen = "home" | "subject" | "session";

export interface Eli5SubjectView {
  slug: string;
  name: string;
  /** Deck « Question libre » : pas de chips de notions, champ seul. */
  libre: boolean;
}

export interface UseEli5Page {
  screen: Eli5Screen;
  // Accueil (decks) —
  summary: NotionSummarySubject[] | null;
  summaryLoading: boolean;
  summaryError: string | null;
  // Écran matière —
  subject: Eli5SubjectView | null;
  notions: SubjectNotionRef[];
  notionsLoading: boolean;
  /** Erreur douce : le champ « pose ta question » reste utilisable malgré tout. */
  notionsError: string | null;
  // Navigation —
  openSubject: (slug: string) => void;
  openLibre: () => void;
  goHome: () => void;
  /** Depuis la session : revient à l'écran matière (ou à l'accueil en Question libre). */
  backFromSession: () => void;
}

export function useEli5Page(status: Eli5Status): UseEli5Page {
  const [searchParams, setSearchParams] = useSearchParams();

  const [screen, setScreen] = useState<Eli5Screen>("home");
  const [summary, setSummary] = useState<NotionSummarySubject[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [subject, setSubject] = useState<Eli5SubjectView | null>(null);
  const [notions, setNotions] = useState<SubjectNotionRef[]>([]);
  const [notionsLoading, setNotionsLoading] = useState(false);
  const [notionsError, setNotionsError] = useState<string | null>(null);
  // Anti-course sur les changements rapides de matière (dernière ouverture gagne).
  const subjectRunRef = useRef(0);

  // Charge les compteurs de decks une fois.
  useEffect(() => {
    let alive = true;
    setSummaryLoading(true);
    setSummaryError(null);
    fetchNotionsSummary()
      .then((data) => {
        if (alive) setSummary(data.subjects);
      })
      .catch((e) => {
        if (alive) setSummaryError(e instanceof Error ? e.message : "Chargement impossible");
      })
      .finally(() => {
        if (alive) setSummaryLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const openSubject = useCallback(
    (slug: string) => {
      const known = summary?.find((s) => s.slug === slug);
      // Nom optimiste depuis le summary (le fetch le confirme) ; repli slug si deep-link
      // avant chargement du summary.
      setSubject({ slug, name: known?.name ?? slug, libre: false });
      setScreen("subject");
      const runId = ++subjectRunRef.current;
      setNotions([]);
      setNotionsError(null);
      setNotionsLoading(true);
      fetchSubjectNotions(slug)
        .then((data) => {
          if (runId !== subjectRunRef.current) return;
          setSubject({ slug: data.subject.slug, name: data.subject.name, libre: false });
          setNotions(data.notions);
        })
        .catch((e) => {
          if (runId !== subjectRunRef.current) return;
          // Dégradation douce : on garde l'écran matière avec le champ libre seul.
          setNotions([]);
          setNotionsError(e instanceof Error ? e.message : "Notions indisponibles");
        })
        .finally(() => {
          if (runId === subjectRunRef.current) setNotionsLoading(false);
        });
    },
    [summary],
  );

  const openLibre = useCallback(() => {
    subjectRunRef.current++; // annule un fetch de matière en vol
    setSubject({ slug: "", name: "Question libre", libre: true });
    setNotions([]);
    setNotionsError(null);
    setNotionsLoading(false);
    setScreen("subject");
  }, []);

  const goHome = useCallback(() => {
    subjectRunRef.current++;
    setSubject(null);
    setScreen("home");
  }, []);

  const backFromSession = useCallback(() => {
    // Retour session → matière (ou accueil si on était en Question libre / sans matière).
    setScreen(subject && !subject.libre ? "subject" : "home");
  }, [subject]);

  // Bascule vers la session au démarrage d'un explain (front montant de « generating ») :
  // couvre chip et question résolue ; un retour manuel (statut inchangé) ne rebondit pas.
  const prevStatus = useRef<Eli5Status>(status);
  useEffect(() => {
    if (status === "generating" && prevStatus.current !== "generating") {
      setScreen("session");
    }
    prevStatus.current = status;
  }, [status]);

  // Deep-link `?subject=slug` → ouvre directement l'écran matière (une fois). On retire le
  // paramètre en `replace` (pattern Révision) : le retour ne relance pas l'ouverture.
  const deepLinkedRef = useRef(false);
  useEffect(() => {
    if (deepLinkedRef.current) return;
    const slug = searchParams.get("subject");
    if (!slug) return;
    deepLinkedRef.current = true;
    openSubject(slug);
    const next = new URLSearchParams(searchParams);
    next.delete("subject");
    setSearchParams(next, { replace: true });
  }, [searchParams, openSubject, setSearchParams]);

  return {
    screen,
    summary,
    summaryLoading,
    summaryError,
    subject,
    notions,
    notionsLoading,
    notionsError,
    openSubject,
    openLibre,
    goHome,
    backFromSession,
  };
}
