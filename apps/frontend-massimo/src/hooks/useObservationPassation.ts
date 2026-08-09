import { useCallback, useEffect, useRef } from "react";
import type { ConditionsPassation } from "../lib/diagnostic";

// Observation d'une passation de diagnostic (ADR-0048, Session B).
//
// 🔴 **CE HOOK NE REND RIEN À L'ÉCRAN, ET C'EST SA CONTRAINTE PRINCIPALE.** Pas de chrono, pas de
// compteur, pas d'avertissement, pas un pixel. Un enfant qui se sait chronométré ne passe plus le
// même diagnostic : la surveillance changerait la mesure qu'elle prétend protéger. Si une session
// future a besoin d'en afficher quoi que ce soit, c'est que la décision a changé — et ça se
// rediscute dans l'ADR, pas ici.
//
// 🔴 **Règle de vocabulaire** : tout prend LA MESURE pour sujet, jamais l'enfant.

/** Deux signaux se rattachent vraiment à une question ; le reste appartient à la passation.
 *
 * 🔴 `sorties_ecran` n'est PAS ici (ADR-0048 Décision 1 bis) : l'écran de passation affiche
 * toutes les questions d'un bloc, une sortie ne se rattache à aucune d'elles. */
export interface SignauxReponse {
  ms_depuis_precedente: number;
  enonce_copie: boolean;
}

export interface ObservationPassation {
  /** À appeler dans le gestionnaire de CLIC, avant tout `await` — voir la note sur le geste. */
  demarrer: () => void;
  /** À appeler quand Massimo répond à une question. Mesure le rythme. */
  noterReponse: (questionId: number) => void;
  /** Les signaux au moment de soumettre. `null` si l'observation n'a jamais démarré. */
  recolter: () => { conditions: ConditionsPassation; parQuestion: Map<number, SignauxReponse> } | null;
  /** Range l'écran après la soumission — la sortie de plein écran qu'elle provoque ne compte pas. */
  terminer: () => void;
}

/** Deux événements décrivent la même sortie d'écran (`visibilitychange` puis `blur` quand on
 *  change d'application). Sans cette fenêtre, un seul geste en compterait deux. */
const ANTI_DOUBLON_MS = 500;

export function useObservationPassation(): ObservationPassation {
  const actif = useRef(false);
  const debut = useRef(0);
  const derniereReponse = useRef(0);
  const sorties = useRef(0);
  const derniereSortie = useRef(-Infinity);
  const pleinEcranQuitte = useRef(false);
  const pleinEcranDemande = useRef(false);
  const tailleChangee = useRef(false);
  const copies = useRef<Set<number>>(new Set());
  const rythme = useRef<Map<number, number>>(new Map());
  const enCoursDeSoumission = useRef(false);

  const demarrer = useCallback(() => {
    actif.current = true;
    // `performance.now()` et jamais `Date.now()` : monotone, immune au changement d'heure, et on
    // n'envoie que des DURÉES — aucun horodatage absolu du navigateur n'entre dans ZETIS.
    debut.current = performance.now();
    derniereReponse.current = debut.current;
    sorties.current = 0;
    derniereSortie.current = -Infinity;
    pleinEcranQuitte.current = false;
    tailleChangee.current = false;
    copies.current = new Set();
    rythme.current = new Map();
    enCoursDeSoumission.current = false;

    // 🔴 LE PLEIN ÉCRAN DOIT ÊTRE DEMANDÉ DANS LE GESTE UTILISATEUR, DONC AVANT TOUT `await`.
    // L'API l'exige, et un `await fetch(...)` fait perdre le contexte de geste : demandé après,
    // l'appel est refusé — silencieusement, sur tous les navigateurs. C'est pour ça que
    // `demarrer()` est appelé en tête du gestionnaire de clic et non après le chargement du quiz.
    //
    // ⚠️ **iOS Safari le refuse sur iPhone** : `requestFullscreen` y est absent. Ce n'est pas une
    // erreur à afficher — c'est le cas normal, et `signaux_observables` l'enregistre pour que Papa
    // sache sur combien d'yeux repose son « rien à signaler ».
    pleinEcranDemande.current = false;
    const el = document.documentElement;
    if (typeof el.requestFullscreen === "function") {
      el.requestFullscreen()
        .then(() => {
          pleinEcranDemande.current = true;
        })
        .catch(() => {
          // Refus de l'utilisateur ou du navigateur : la passation continue à l'identique.
          // 🔴 AUCUNE BARRIÈRE. Le plein écran est un signal, jamais un empêchement.
        });
    }
  }, []);

  const noterReponse = useCallback((questionId: number) => {
    if (!actif.current) return;
    const t = performance.now();
    // Le délai depuis la réponse PRÉCÉDENTE — pas « depuis l'affichage de la question », qui
    // n'existe pas : elles sont toutes affichées ensemble (ADR-0048 Décision 1 bis). C'est le
    // rythme de Massimo, et une réponse nettement plus rapide que son propre rythme se remarque.
    //
    // ⚠️ On écrase à chaque changement d'avis : c'est le délai avant sa réponse FINALE qui compte.
    rythme.current.set(questionId, Math.round(t - derniereReponse.current));
    derniereReponse.current = t;
  }, []);

  useEffect(() => {
    const sortie = () => {
      if (!actif.current) return;
      const t = performance.now();
      if (t - derniereSortie.current < ANTI_DOUBLON_MS) return;
      derniereSortie.current = t;
      sorties.current += 1;
    };
    const surVisibilite = () => {
      if (document.visibilityState === "hidden") sortie();
    };
    const surCopie = (e: ClipboardEvent) => {
      if (!actif.current) return;
      // Localiser la sélection dans le bloc d'une question — c'est ce qui fait de la copie le
      // SEUL signal par question qui survive à un écran qui les affiche toutes.
      const noeud = document.getSelection()?.anchorNode ?? (e.target as Node | null);
      const el = noeud instanceof Element ? noeud : (noeud?.parentElement ?? null);
      const bloc = el?.closest?.("[data-question-id]");
      const id = bloc ? Number(bloc.getAttribute("data-question-id")) : NaN;
      // Sans localisation, on ne fabrique pas un rattachement faux : la copie est simplement
      // ignorée. Un signal approximatif vaut moins que pas de signal.
      if (Number.isFinite(id)) copies.current.add(id);
    };
    const surPleinEcran = () => {
      if (!actif.current || enCoursDeSoumission.current) return;
      // ⚠️ La sortie de plein écran provoquée par l'app à la soumission ne compte pas : c'est
      // `terminer()` qui la déclenche, et le drapeau ci-dessus la neutralise.
      if (pleinEcranDemande.current && document.fullscreenElement == null) {
        pleinEcranQuitte.current = true;
      }
    };
    const surTaille = () => {
      if (actif.current) tailleChangee.current = true;
    };

    document.addEventListener("visibilitychange", surVisibilite);
    window.addEventListener("blur", sortie);
    document.addEventListener("copy", surCopie);
    document.addEventListener("fullscreenchange", surPleinEcran);
    window.addEventListener("resize", surTaille);
    // Retrait systématique : en StrictMode le montage est joué deux fois, et des écouteurs laissés
    // derrière compteraient chaque sortie d'écran en double. Le dépôt a déjà payé ce motif.
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      window.removeEventListener("blur", sortie);
      document.removeEventListener("copy", surCopie);
      document.removeEventListener("fullscreenchange", surPleinEcran);
      window.removeEventListener("resize", surTaille);
    };
  }, []);

  const recolter = useCallback(() => {
    if (!actif.current) return null;
    enCoursDeSoumission.current = true;
    const parQuestion = new Map<number, SignauxReponse>();
    for (const [id, ms] of rythme.current) {
      parQuestion.set(id, { ms_depuis_precedente: ms, enonce_copie: copies.current.has(id) });
    }
    // Une question copiée mais jamais répondue doit quand même porter son drapeau.
    for (const id of copies.current) {
      if (!parQuestion.has(id)) parQuestion.set(id, { ms_depuis_precedente: 0, enonce_copie: true });
    }
    const conditions: ConditionsPassation = {
      ms_total: Math.round(performance.now() - debut.current),
      sorties_ecran: sorties.current,
      plein_ecran_quitte: pleinEcranQuitte.current,
      taille_changee: tailleChangee.current,
      // 🔴 L'instrument DIT SA PORTÉE. Le plein écran n'y figure que s'il a pu être demandé —
      // sinon Papa lirait « rien à signaler » sans savoir que cet œil-là était fermé.
      signaux_observables: [
        "sortie_ecran",
        "copie",
        "taille",
        ...(pleinEcranDemande.current ? ["plein_ecran"] : []),
      ],
    };
    return { conditions, parQuestion };
  }, []);

  const terminer = useCallback(() => {
    actif.current = false;
    if (document.fullscreenElement != null && typeof document.exitFullscreen === "function") {
      void document.exitFullscreen().catch(() => {});
    }
  }, []);

  return { demarrer, noterReponse, recolter, terminer };
}
