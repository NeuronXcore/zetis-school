import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { sendPageview } from "../lib/telemetry";

/** Journalise un changement de page à chaque navigation. Aucun rendu, aucune UI.
 *
 * Dédupe locale : on n'envoie rien si la route est identique à la précédente. Le serveur dédupe
 * aussi les routes consécutives — ceinture et bretelles, parce qu'un remontage de composant
 * (StrictMode en dev, re-render du layout) ne doit pas gonfler le journal.
 *
 * On n'envoie que le `pathname` : ni query string ni hash, qui peuvent porter des paramètres
 * sans intérêt pour Papa et allonger inutilement la route (bornée à 200 caractères serveur). */
export function usePageviewTelemetry(): void {
  const { pathname } = useLocation();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    sendPageview(pathname);
  }, [pathname]);
}
