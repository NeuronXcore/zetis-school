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
  onFinished,
}: {
  runId: number;
  /** Le `scope_kind` DU LOT (`srs`), pas le `content_kind` de la demande (`card`) : le lot porte
   *  déjà la traduction, le client n'a pas à la refaire. */
  scopeKind: string;
  /** Appelé UNE fois, quand le serveur dit que le lot est terminé (réussi ou non). */
  onFinished: (status: "done" | "failed") => void;
}) {
  // ⚠️ Le lot ENTIER est conservé, plus seulement son statut : `useRunProgress` a besoin de la
  // granularité (`total_notions`) pour savoir s'il doit estimer ou croire le serveur.
  //
  // L'état initial est un lot `queued` **synthétique** : entre le clic et le premier sondage, le
  // composant n'a encore rien reçu, et c'est exactement l'état d'un lot qui vient d'être accepté.
  const [run, setRun] = useState<ProductionRun | null>(null);
  const status = run?.status ?? "queued";
  const active = status === "queued" || status === "running";
  const { pct, enFile } = useRunProgress(
    run ?? { status: "queued", total_notions: null, progress_pct: 0, scope_kind: scopeKind },
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
      <ProgressBar
        pct={pct ?? 0}
        label={enFile ? "En file d'attente…" : SCOPE_LABEL[scopeKind] || "Production…"}
      />
    </div>
  );
}
