import { useEffect, useState } from "react";
import { type NewsSummary } from "@zetis/types";
import { EMPTY_NEWS, fetchNewsSummary } from "../lib/news";
import { NEWS_CHANGED_EVENT } from "../lib/newsEvents";

/** Témoins de nouveauté de la navigation (ADR-0030 §5).
 *
 *  Monté **une seule fois**, dans `MassimoLayout`. Un appel au montage, puis un refetch
 *  uniquement quand un geste de Massimo a consommé une nouveauté — jamais sur horloge.
 *
 *  Échec réseau silencieux : on garde l'état précédent (ou zéro), donc aucun badge. Un badge
 *  absent est un état correct ; afficher une erreur pour un objet décoratif serait pire que le
 *  problème.
 */
export function useNewsSummary(): NewsSummary {
  const [news, setNews] = useState<NewsSummary>(EMPTY_NEWS);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () => {
      fetchNewsSummary()
        .then((summary) => {
          if (alive) setNews(summary);
        })
        .catch(() => undefined);
    };

    // Coalescence des rafales, et surtout PAS un rafraîchissement périodique : ce délai ne s'arme
    // que sur un geste et ne se déclenche jamais spontanément. Sans lui, une séance de révision
    // émet un événement par carte notée — quinze requêtes pour un chiffre. La distinction est
    // verrouillée par un test (« 60 s de timers avancés sans événement → toujours un seul appel »).
    const onNewsChanged = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(load, 400);
    };

    load();
    window.addEventListener(NEWS_CHANGED_EVENT, onNewsChanged);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener(NEWS_CHANGED_EVENT, onNewsChanged);
    };
  }, []);

  return news;
}
