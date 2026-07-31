import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { sendPageview } from "../lib/telemetry";

/** Routes qui ne rendent AUCUNE page et ne font que rediriger (`<Navigate replace>`).
 *
 * Une redirection n'est pas une page vue : Massimo la traverse sans jamais rien y voir. Sans
 * cette liste, un signet sur `/progression` produirait DEUX `page_viewed` pour une seule visite
 * (`/progression` puis `/galaxy`), et le cahier de bord de Papa afficherait la même page deux
 * fois de suite. La dédupe par route précédente ne suffit pas : les deux routes diffèrent. */
const REDIRECT_ONLY_ROUTES = new Set(["/progression"]);

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
    if (REDIRECT_ONLY_ROUTES.has(pathname)) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    sendPageview(pathname);
  }, [pathname]);
}
