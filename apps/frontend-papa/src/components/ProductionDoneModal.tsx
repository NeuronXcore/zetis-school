import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { type ProductionRun } from "@zetis/types";

import { SCOPE_NOUN } from "../lib/production";

// Ce que ZETIS vient de produire — annoncé une fois, au centre, puis ça s'efface tout seul.
//
// ⚠️ **Papa SEULEMENT**, comme la pastille d'en-tête. Rien de tel côté Massimo : lui annoncer une
// production serait une PROMESSE, donc une relance, et rendrait impossible l'invariant V1 de
// l'addendum §G — un contenu retiré avant consommation doit n'avoir jamais existé pour lui.
// Massimo l'apprend par `announce.py`, et seulement si le contenu est réellement servable.
//
// ⚠️ **Elle s'efface seule, et ne laisse aucune trace.** Une notification qui s'empile deviendrait
// un arriéré à traiter — exactement le « vous êtes en retard » que le §F.2 interdit. Le Journal de
// production est la mémoire ; ceci n'est qu'un accusé de passage.

/** Durée d'affichage. Assez pour lire une phrase, assez court pour ne pas gêner. */
const AUTO_CLOSE_MS = 6000;

/** Fenêtre de l'animation de sortie — doit rester alignée sur `duration-300` ci-dessous. */
const FADE_MS = 300;

function phrase(run: ProductionRun): string {
  if (run.status === "failed") return "La production s'est interrompue.";
  if (run.scope_kind) {
    const quoi = SCOPE_NOUN[run.scope_kind] ?? "un contenu";
    return run.scope_skill_name
      ? `ZETIS a produit ${quoi} sur « ${run.scope_skill_name} ».`
      : `ZETIS a produit ${quoi}.`;
  }
  const n = run.done_notions ?? 0;
  if (n === 0) return "Le lot s'est terminé sans rien produire.";
  return `ZETIS a équipé ${n} notion${n > 1 ? "s" : ""}.`;
}

export function ProductionDoneModal({
  run,
  onClose,
}: {
  run: ProductionRun;
  onClose: () => void;
}) {
  const [sortie, setSortie] = useState(false);
  const echec = run.status === "failed";

  useEffect(() => {
    // Deux temps : on lance le fondu, puis on démonte. Démonter d'un coup ferait disparaître la
    // carte sèchement — et l'animation de sortie ne serait jamais jouée.
    const fondu = window.setTimeout(() => setSortie(true), AUTO_CLOSE_MS);
    const fin = window.setTimeout(onClose, AUTO_CLOSE_MS + FADE_MS);
    return () => {
      window.clearTimeout(fondu);
      window.clearTimeout(fin);
    };
  }, [onClose]);

  return (
    <div
      // `pointer-events-none` sur le fond : cette carte annonce, elle ne bloque pas. Papa doit
      // pouvoir continuer à cliquer derrière pendant les six secondes.
      className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4"
      role="status"
      aria-live="polite"
    >
      <div
        className={[
          "pointer-events-auto w-full max-w-sm rounded-2xl border bg-papa-surface px-6 py-5 text-center",
          "shadow-2xl shadow-black/40 transition-all duration-300",
          sortie ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
          echec ? "border-red-400/40" : "border-papa-accent/40",
        ].join(" ")}
      >
        <p className="text-3xl" aria-hidden>
          {echec ? "⚠️" : "✨"}
        </p>
        <p className="mt-2 text-sm font-semibold text-papa-text">{phrase(run)}</p>
        <p className="mt-1 text-xs text-papa-muted">
          {echec
            ? "Le détail est au Journal de production."
            : "C'est relisable — et rétractable — depuis le Journal."}
        </p>
        <div className="mt-4 flex items-center justify-center gap-3 text-xs font-semibold">
          <Link to="/journal" onClick={onClose} className="text-papa-accent hover:underline">
            Voir au Journal →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="text-papa-muted transition-colors hover:text-papa-text"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
