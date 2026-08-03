// Avancement d'un lot-PIÈCE lancé depuis la page Demandes (ADR-0036 §6).
//
// ⚠️ **Le libellé dit la vérité, la barre montre la vie.** Un lot part en file d'attente
// (concurrence 1, un seul GPU) : tant qu'il n'a pas démarré, ZETIS ne génère RIEN, et une barre
// qui avancerait en disant « Génération de la fiche… » mentirait sur ce qui se passe. Le libellé
// distingue donc les deux états ; la courbe, elle, reste asymptotique et ne peut pas atteindre
// 100 % avant la fin réelle rendue par le serveur.
//
// ⚠️ **Pourquoi une ESTIMATION alors que le serveur donne un `progress_pct`** : celui-ci compte des
// NOTIONS, et un lot-pièce n'en a qu'une — il vaut donc 0 % pendant toute la durée du lot, puis le
// lot disparaît. Constaté à l'écran le 2026-08-03. Là où le serveur a de la granularité (un lot de
// chapitre), c'est lui qui fait foi ; ici il n'en a pas, et l'estimation est la seule chose vraie
// qu'on puisse montrer.
//
// ⚠️ Aucune barre réinventée : `ProgressBar` + `useEstimatedProgress` sont les briques que les
// capsules et la Couverture utilisent déjà.
import { useCallback, useEffect, useRef, useState } from "react";
import { ProgressBar, useEstimatedProgress } from "../ProgressBar";
import { SCOPE_LABEL, SCOPE_MS, fetchProductionRun } from "../../lib/production";

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
  const [status, setStatus] = useState<"queued" | "running" | "done" | "failed">("queued");
  const active = status === "queued" || status === "running";
  const pct = useEstimatedProgress(active, SCOPE_MS[scopeKind] || 30000);

  // ⚠️ Garde de ré-entrée : en StrictMode l'effet est monté deux fois, et un `onFinished` appelé
  // deux fois déclencherait deux rechargements concurrents de la liste.
  const done = useRef(false);
  const notify = useCallback(onFinished, [onFinished]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const run = await fetchProductionRun(runId);
        if (cancelled) return;
        setStatus(run.status);
        if ((run.status === "done" || run.status === "failed") && !done.current) {
          done.current = true;
          notify(run.status);
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
        pct={pct}
        label={
          status === "queued" ? "En file d'attente…" : SCOPE_LABEL[scopeKind] || "Production…"
        }
      />
    </div>
  );
}
