import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type MotivationMessage,
  type ReviewCard,
  type ReviewChapterDeck,
  type ReviewDeck,
  type ReviewRating,
} from "@zetis/types";
import { fetchWrapUp } from "../lib/motivation";
import { startReviewSession, submitReviewAttempt } from "../lib/reviews";
import { prefersReducedMotion } from "../lib/motion";

// Toute la logique de la session de révision vit ici (les composants DeckDisc /
// FlipCard / SessionEndPopup restent présentationnels). Machine à états :
//   loading → front → back → (front → back …) → summary → [redo → …] → done
//
// Invariants de contrat (cf. reviews.ts + spec page-revision.md) :
// - Aucune donnée de planification n'est jamais lue ni recalculée côté client
//   (le payload des cartes n'en contient pas).
// - L'XP n'est JAMAIS inventée côté client : on cumule `xp_awarded` renvoyé par
//   le serveur. Le re-tour (consolidation, XP réduit) est détecté côté serveur ;
//   le client rejoue simplement la file `fragile` et re-POST les notes.

// Délai anti-clic-réflexe : les notes n'apparaissent qu'après le flip (spec).
export const RATING_REVEAL_DELAY_MS = 250;

export type ReviewSessionStatus = "loading" | "front" | "back" | "summary" | "done" | "error";

/** Palier de fin de session, sur `pct = (good+easy) / total`. Bornes INCLUSES. */
export type SessionTier = "high" | "mid" | "low";

export function computeTier(pct: number): SessionTier {
  if (pct >= 0.8) return "high";
  if (pct >= 0.5) return "mid";
  return "low";
}

/** Badge de compteur : exact jusqu'à 15, « 15+ » au-delà (présentation, jamais un retard). */
export function cappedCount(n: number): string {
  return n > 15 ? "15+" : String(n);
}

/** Le contexte de session à faire suivre aux notes — `undefined` hors deck chapitre (ADR-0049).
 *
 *  ⚠️ Pure LECTURE du deck déjà demandé : le client répète ce qu'il a demandé, il ne décide de
 *  rien. C'est ce qui distingue un contexte revalidable d'un flag `non_scheduling` qui, lui,
 *  laisserait un bug front éteindre la planification en silence. */
export function chapterContext(deck: ReviewDeck | null): ReviewChapterDeck | undefined {
  if (deck && typeof deck === "object" && "chapter" in deck) return { chapter: deck.chapter };
  return undefined;
}

/** Instantané présenté par `SessionEndPopup` à la fin d'un passage. */
export interface SessionSummary {
  tier: SessionTier;
  /** Cartes « bien ancrées » (good + easy) du passage. */
  good: number;
  /** Cartes revues dans le passage. */
  total: number;
  /** `good / total` (0 si passage vide). */
  pct: number;
  /** XP cumulée de la session (somme des `xp_awarded` serveur), jamais recalculée. */
  xp: number;
  /** Re-tour proposable : palier bas, pas encore utilisé, file `fragile` non vide. */
  canRedo: boolean;
  /** Taille de la file `fragile` (cartes notées à revoir / difficile). */
  fragileCount: number;
}

export interface ReviewSessionApi {
  status: ReviewSessionStatus;
  card: ReviewCard | null;
  /** Position 1-based dans le passage courant, pour les points de progression. */
  progress: { current: number; total: number };
  /** Notes affichées (retardées après le flip, ou immédiates en reduced-motion). */
  showRatings: boolean;
  summary: SessionSummary | null;
  /** Mot de la fin servi par ZETIS, chargé à l'entrée en `summary`. Récupéré par le HOOK et non
   *  par la modale, pour que `SessionEndPopup` reste un composant de présentation pure. */
  wrapUp: MotivationMessage | null;
  error: string | null;
  reducedMotion: boolean;
  reveal: () => void;
  rate: (rating: ReviewRating) => void;
  redo: () => void;
  finish: () => void;
  reload: () => void;
}

export function useReviewSession(deck: ReviewDeck | null): ReviewSessionApi {
  const [status, setStatus] = useState<ReviewSessionStatus>("loading");
  const [cards, setCards] = useState<ReviewCard[]>([]);
  const [pos, setPos] = useState(0);
  const [showRatings, setShowRatings] = useState(false);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [wrapUp, setWrapUp] = useState<MotivationMessage | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Compteurs du passage courant + XP de session : tenus en refs (pas de re-render
  // par note ; l'instantané est figé dans `summary` en fin de passage).
  const xpRef = useRef(0);
  const goodRef = useRef(0);
  const ratedRef = useRef(0);
  const fragileRef = useRef<ReviewCard[]>([]);
  const redoUsedRef = useRef(false);
  const submittingRef = useRef(false);

  const reducedMotion = useMemo(() => prefersReducedMotion(), []);

  // `deck` peut être un objet ({subject}) recréé à chaque render du routeur :
  // on ne relance la session que quand son contenu change réellement.
  const deckKey = useMemo(() => JSON.stringify(deck), [deck]);
  const deckRef = useRef(deck);
  deckRef.current = deck;

  const resetPass = useCallback(() => {
    goodRef.current = 0;
    ratedRef.current = 0;
    fragileRef.current = [];
  }, []);

  const load = useCallback(async () => {
    // Pas de deck (accès direct à /revision/session) : l'écran redirige, on ne
    // déclenche aucune session côté serveur.
    if (deckRef.current == null) return;
    setStatus("loading");
    setError(null);
    setSummary(null);
    try {
      const served = await startReviewSession(deckRef.current);
      xpRef.current = 0;
      redoUsedRef.current = false;
      resetPass();
      setCards(served);
      setPos(0);
      setShowRatings(false);
      // Deck déjà à jour (rien de dû) : on n'invente pas de session vide, on rend la main.
      setStatus(served.length === 0 ? "done" : "front");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
      setStatus("error");
    }
    // deckKey pilote le rechargement ; `deck` est lu via deckRef (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deckKey, resetPass]);

  useEffect(() => {
    void load();
  }, [load]);

  // Apparition retardée des notes après le flip (anti-réflexe), instantanée si reduced-motion.
  useEffect(() => {
    if (status !== "back") return;
    if (reducedMotion) {
      setShowRatings(true);
      return;
    }
    const t = setTimeout(() => setShowRatings(true), RATING_REVEAL_DELAY_MS);
    return () => clearTimeout(t);
  }, [status, pos, reducedMotion]);

  const buildSummary = useCallback((): SessionSummary => {
    const total = ratedRef.current;
    const good = goodRef.current;
    const pct = total > 0 ? good / total : 0;
    const tier = computeTier(pct);
    const fragileCount = fragileRef.current.length;
    return {
      tier,
      good,
      total,
      pct,
      xp: xpRef.current,
      canRedo: tier === "low" && !redoUsedRef.current && fragileCount > 0,
      fragileCount,
    };
  }, []);

  const reveal = useCallback(() => {
    setStatus((s) => (s === "front" ? "back" : s));
  }, []);

  const rate = useCallback(
    (rating: ReviewRating) => {
      if (status !== "back" || submittingRef.current) return;
      const card = cards[pos];
      if (!card) return;
      submittingRef.current = true;
      setShowRatings(false);
      void (async () => {
        try {
          // Le contexte est l'ÉCHO du deck demandé, jamais une décision du client (ADR-0049
          // Décision 4). Il part sur CHAQUE note de la session — y compris celles du re-tour,
          // où le serveur tranchera de lui-même que c'est un second passage.
          const res = await submitReviewAttempt(card.card_id, rating, chapterContext(deckRef.current));
          // XP : uniquement ce que le serveur crédite (consolidation incluse).
          xpRef.current += res.xp_awarded;
          ratedRef.current += 1;
          if (rating === "good" || rating === "easy") goodRef.current += 1;
          if (rating === "again" || rating === "hard") fragileRef.current.push(card);

          if (pos + 1 < cards.length) {
            setPos(pos + 1);
            setStatus("front");
          } else {
            setSummary(buildSummary());
            setStatus("summary");
            // Un seul appel par fin de séance ; `redo` ne le relance pas (la séance continue).
            void fetchWrapUp()
              .then(setWrapUp)
              .catch(() => {
                /* silence : la modale de fin s'affiche normalement sans le mot de la fin */
              });
          }
        } catch (e) {
          // Bienveillant : on n'affiche jamais d'« échec », la carte reste notable.
          setError(e instanceof Error ? e.message : "Réessaie dans un instant");
        } finally {
          submittingRef.current = false;
        }
      })();
    },
    [status, cards, pos, buildSummary],
  );

  const redo = useCallback(() => {
    if (!summary?.canRedo) return;
    const again = fragileRef.current;
    redoUsedRef.current = true;
    resetPass();
    setCards(again);
    setPos(0);
    setShowRatings(false);
    setSummary(null);
    setStatus("front");
  }, [summary, resetPass]);

  const finish = useCallback(() => setStatus("done"), []);
  const reload = useCallback(() => void load(), [load]);

  return {
    status,
    card: status === "front" || status === "back" ? (cards[pos] ?? null) : null,
    progress: { current: Math.min(pos + 1, cards.length), total: cards.length },
    showRatings,
    summary,
    wrapUp,
    error,
    reducedMotion,
    reveal,
    rate,
    redo,
    finish,
    reload,
  };
}
