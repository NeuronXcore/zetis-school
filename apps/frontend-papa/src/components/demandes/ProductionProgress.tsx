// Avancement d'un lot-PIÈCE lancé depuis la page Demandes (ADR-0036 §6).
//
// ⚠️ **Le libellé dit la vérité, la barre montre la vie.** Un lot part en file d'attente
// (concurrence 1, un seul GPU) : tant qu'il n'a pas démarré, ZETIS ne génère RIEN, et une barre
// qui avancerait en disant « Génération de la fiche… » mentirait sur ce qui se passe.
//
// ⚠️ **Cette règle a quitté ce fichier le 2026-08-04** — elle vit dans `useRunProgress`, avec
// l'en-tête et la modale. Elle était juste ici et absente là-bas, où le même lot montait à 95 %
// sans avoir démarré : une règle écrite dans le commentaire d'UN composant ne protège que lui.
// Le composant garde son libellé (le vocabulaire de la pièce) ; le chiffre, lui, vient d'ailleurs.
//
// ⚠️ La barre ne bougeait pas non plus tout à fait juste ici : elle s'animait dès `queued`. Le
// libellé rattrapait le mensonge, la courbe le portait quand même.
import { useCallback, useEffect, useRef, useState } from "react";
import { type ProductionRun } from "@zetis/types";
import { ProgressBar } from "../ProgressBar";
import { useRunProgress } from "../../hooks/useRunProgress";
import { SCOPE_LABEL, fetchProductionRun } from "../../lib/production";

/** Période de sondage. Les lots-pièce mesurés durent 15 à 17 s : sonder plus lentement laisserait
 *  la barre pleine alors que la ligne devrait déjà avoir disparu. */
const POLL_MS = 2000;

export function ProductionProgress({
  runId,
  scopeKind,
  initialRun = null,
  onFinished,
}: {
  runId: number;
  /** Le `scope_kind` DU LOT (`srs`), pas le `content_kind` de la demande (`card`) : le lot porte
   *  déjà la traduction, le client n'a pas à la refaire. */
  scopeKind: string;
  /** Le lot tel que le SERVEUR le connaît déjà, quand la ligne arrive avec (`active_run`).
   *
   *  ⚠️ **Sans lui, revenir sur la page rejouait deux secondes de mensonge** : le composant
   *  repartait d'un `queued` synthétique et affichait « en file d'attente » sur un lot qui
   *  tournait depuis une minute, jusqu'au premier sondage. Le cas « je viens de cliquer » n'est
   *  qu'un cas particulier — celui où le serveur n'a encore rien à dire. */
  initialRun?: ProductionRun | null;
  /** Appelé UNE fois, quand le serveur dit que le lot est terminé (réussi ou non). */
  onFinished: (status: "done" | "failed") => void;
}) {
  // ⚠️ Le lot ENTIER est conservé, plus seulement son statut : `useRunProgress` a besoin de la
  // granularité (`total_notions`) pour savoir s'il doit estimer ou croire le serveur, et de
  // `started_at` pour savoir depuis QUAND.
  const [run, setRun] = useState<ProductionRun | null>(initialRun);
  const status = run?.status ?? "queued";
  const active = status === "queued" || status === "running";
  // Le repli est un lot `queued` **synthétique** : entre le clic et le premier sondage, le
  // composant n'a encore rien reçu, et c'est exactement l'état d'un lot qui vient d'être accepté.
  const { pct, libelle } = useRunProgress(
    run ?? {
      status: "queued",
      total_notions: null,
      progress_pct: 0,
      scope_kind: scopeKind,
      started_at: null,
    },
  );

  // ⚠️ Garde de ré-entrée : en StrictMode l'effet est monté deux fois, et un `onFinished` appelé
  // deux fois déclencherait deux rechargements concurrents de la liste.
  const done = useRef(false);
  const notify = useCallback(onFinished, [onFinished]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const lu = await fetchProductionRun(runId);
        if (cancelled) return;
        setRun(lu);
        if ((lu.status === "done" || lu.status === "failed") && !done.current) {
          done.current = true;
          notify(lu.status);
        }
      } catch {
        // Un sondage qui échoue (backend redémarré, réseau) ne doit pas casser la page : on
        // retente au tour suivant. Le lot, lui, continue côté worker.
      }
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, runId, notify]);

  return (
    <div className="min-w-[190px] shrink-0">
      {/* ⚠️ **`pct ?? 0` était le mensonge que tout le reste s'échinait à éviter.** `useRunProgress`
          rend `null` pour dire « rien n'a commencé, il n'y a rien à mesurer » — et cette ligne
          retraduisait aussitôt ce refus en un chiffre, le seul que Papa avait sous les yeux. Le
          2026-08-05, quatre lots arrêtés ont affiché « 0 % » pendant six heures sous un libellé
          parfaitement honnête. Le libellé disait vrai, la case du pourcentage disait 0, et c'est
          la case qu'on lit. `null` traverse maintenant jusqu'au rendu. */}
      <ProgressBar
        pct={pct}
        label={libelle ? majuscule(libelle) : SCOPE_LABEL[scopeKind] || "Production…"}
      />
    </div>
  );
}

/** Les libellés d'état sont écrits en minuscule (ils se lisent à la suite d'une phrase dans
 *  l'en-tête) ; ici ils ouvrent la ligne. Une seule source, deux positions. */
function majuscule(texte: string): string {
  return texte.charAt(0).toUpperCase() + texte.slice(1);
}
