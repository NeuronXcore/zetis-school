import { useCallback, useEffect, useState } from "react";
import type {
  GalaxySubject,
  GalaxyTimeline,
  MissionTodayResponse,
  MotivationWelcome,
  ReviewsSummary,
} from "@zetis/types";
import { type CapsuleStats, fetchCapsuleStats } from "../lib/capsules";
import { fetchGalaxyOverview, fetchGalaxyTimeline } from "../lib/galaxy";
import {
  type GamificationSummary,
  type XpHistory,
  fetchGamificationSummary,
  fetchXpHistory,
} from "../lib/gamification";
import { fetchToday } from "../lib/missions";
import { fetchWelcome } from "../lib/motivation";
import { fetchReviewsSummary } from "../lib/reviews";

// Orchestration de la page d'accueil.
//
// `Promise.allSettled` et JAMAIS `all` : chaque bloc de l'accueil a sa propre source, et si l'une
// tombe les autres doivent rester à l'écran. Un `all` ferait disparaître la mission du jour parce
// que le compteur de révisions n'a pas répondu.
//
// Le hook n'expose AUCUN chiffre dérivé ni aucune phrase : il passe les payloads tels quels. Tout
// ce qui s'affiche à Massimo vient du serveur — l'accueil a longtemps affiché « Tu as consolidé
// 3 notions cette semaine » depuis une constante codée en dur, on ne refait pas ça.

export interface AccueilData {
  welcome: MotivationWelcome | null;
  today: MissionTodayResponse | null;
  reviews: ReviewsSummary | null;
  capsules: CapsuleStats | null;
  /** Matières et leur COMPTE `lit` d'étoiles allumées — la carte « Ma Galaxie ».
   *  ⚠️ Aucun compte global n'est servi : le total est une somme de présentation. */
  subjects: GalaxySubject[] | null;
  /** « Mon ciel ». Série CREUSE par contrat : les jours sans gain sont absents, jamais à zéro.
   *  Ne jamais la compléter — cf. `fetchXpHistory`. */
  xpHistory: XpHistory | null;
  /** « Mon chemin ». Série creuse elle aussi, et bornée à 60 jours côté serveur. */
  timeline: GalaxyTimeline | null;
  /** Niveau, XP, badges et `recent` — la MÊME route que le bandeau XP, appelée une seule fois. */
  gamification: GamificationSummary | null;
  loading: boolean;
  /** Recharge le seul message de ZETIS — à appeler quand l'engagement change, sinon la phrase
   *  reste sur « engagement tenu » et contredit la carte « Ma semaine » juste en dessous. */
  refreshWelcome: () => void;
}

export function useAccueil(): AccueilData {
  const [welcome, setWelcome] = useState<MotivationWelcome | null>(null);
  const [today, setToday] = useState<MissionTodayResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewsSummary | null>(null);
  const [capsules, setCapsules] = useState<CapsuleStats | null>(null);
  const [subjects, setSubjects] = useState<GalaxySubject[] | null>(null);
  const [xpHistory, setXpHistory] = useState<XpHistory | null>(null);
  const [timeline, setTimeline] = useState<GalaxyTimeline | null>(null);
  const [gamification, setGamification] = useState<GamificationSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([
      fetchWelcome(),
      fetchToday(),
      fetchReviewsSummary(),
      fetchCapsuleStats(),
      fetchGalaxyOverview(),
      fetchXpHistory(),
      fetchGalaxyTimeline(),
      fetchGamificationSummary(),
    ]).then(
      ([
        welcomeResult,
        todayResult,
        reviewsResult,
        capsulesResult,
        galaxyResult,
        historyResult,
        timelineResult,
        gamificationResult,
      ]) => {
        if (!active) return;
        // Un rejet laisse la valeur à `null` : le bloc concerné se tait, les autres s'affichent.
        // Aucune erreur n'est remontée à l'écran de l'enfant (cf. la page).
        if (welcomeResult.status === "fulfilled") setWelcome(welcomeResult.value);
        if (todayResult.status === "fulfilled") setToday(todayResult.value);
        if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value);
        if (capsulesResult.status === "fulfilled") setCapsules(capsulesResult.value);
        if (galaxyResult.status === "fulfilled") setSubjects(galaxyResult.value.subjects);
        if (historyResult.status === "fulfilled") setXpHistory(historyResult.value);
        if (timelineResult.status === "fulfilled") setTimeline(timelineResult.value);
        if (gamificationResult.status === "fulfilled") setGamification(gamificationResult.value);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  const refreshWelcome = useCallback(() => {
    fetchWelcome()
      .then(setWelcome)
      .catch(() => {
        // Silence : on garde le message précédent plutôt que de vider la carte.
      });
  }, []);

  return {
    welcome,
    today,
    reviews,
    capsules,
    subjects,
    xpHistory,
    timeline,
    gamification,
    loading,
    refreshWelcome,
  };
}
