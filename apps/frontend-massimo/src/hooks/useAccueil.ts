import { useCallback, useEffect, useState } from "react";
import type { MissionTodayResponse, MotivationWelcome, ReviewsSummary } from "@zetis/types";
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
  loading: boolean;
  /** Recharge le seul message de ZETIS — à appeler quand l'engagement change, sinon la phrase
   *  reste sur « engagement tenu » et contredit la carte « Ma semaine » juste en dessous. */
  refreshWelcome: () => void;
}

export function useAccueil(): AccueilData {
  const [welcome, setWelcome] = useState<MotivationWelcome | null>(null);
  const [today, setToday] = useState<MissionTodayResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([fetchWelcome(), fetchToday(), fetchReviewsSummary()]).then(
      ([welcomeResult, todayResult, reviewsResult]) => {
        if (!active) return;
        // Un rejet laisse la valeur à `null` : le bloc concerné se tait, les autres s'affichent.
        // Aucune erreur n'est remontée à l'écran de l'enfant (cf. la page).
        if (welcomeResult.status === "fulfilled") setWelcome(welcomeResult.value);
        if (todayResult.status === "fulfilled") setToday(todayResult.value);
        if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value);
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

  return { welcome, today, reviews, loading, refreshWelcome };
}
