import { useEffect, useState } from "react";
import type { MissionTodayResponse, ReviewsSummary } from "@zetis/types";
import { fetchToday } from "../lib/missions";
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
  today: MissionTodayResponse | null;
  reviews: ReviewsSummary | null;
  loading: boolean;
}

export function useAccueil(): AccueilData {
  const [today, setToday] = useState<MissionTodayResponse | null>(null);
  const [reviews, setReviews] = useState<ReviewsSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void Promise.allSettled([fetchToday(), fetchReviewsSummary()]).then(
      ([todayResult, reviewsResult]) => {
        if (!active) return;
        // Un rejet laisse la valeur à `null` : le bloc concerné se tait, les autres s'affichent.
        // Aucune erreur n'est remontée à l'écran de l'enfant (cf. la page).
        if (todayResult.status === "fulfilled") setToday(todayResult.value);
        if (reviewsResult.status === "fulfilled") setReviews(reviewsResult.value);
        setLoading(false);
      },
    );

    return () => {
      active = false;
    };
  }, []);

  return { today, reviews, loading };
}
