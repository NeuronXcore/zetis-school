import { Link } from "react-router-dom";
import { Button } from "@zetis/ui";
import { type ProductionRun } from "@zetis/types";

import { ProgressBar } from "./ProgressBar";
import { SCOPE_NOUN } from "../lib/production";

// Détail du lot en cours, ouvert depuis la pastille d'en-tête (Papa uniquement).
//
// Le pourcentage vient du SERVEUR (`progress_pct`) : il compte des notions équipées, pas des
// secondes écoulées. Une barre estimée mentait d'un facteur 2 avant qu'on mesure (2026-08-02).
//
// ⚠️ Ce panneau montre un PROCESSUS, jamais un stock. Pas de compteur d'arriéré ici : « 12
// contenus non contrôlés » affiché en permanence serait le reproche que l'addendum ADR-0011 §F.2
// interdit — la provenance est un fait, elle ne se totalise pas.

export function ActiveProductionModal({
  run,
  onClose,
}: {
  run: ProductionRun;
  onClose: () => void;
}) {
  const total = run.total_notions ?? 0;
  const done = run.done_notions ?? 0;
  // ⚠️ Le titre était « un chapitre » en dur. Faux depuis qu'un lot peut viser une PIÈCE
  // (ADR-0036 §2) — constaté à l'écran le 2026-08-03, en même temps que la pastille d'en-tête.
  const quoi = run.scope_kind
    ? `${SCOPE_NOUN[run.scope_kind] ?? "un contenu"}${
        run.scope_skill_name ? ` sur « ${run.scope_skill_name} »` : ""
      }`
    : "un chapitre";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl border border-papa-border bg-papa-surface p-5">
        <p className="text-base font-bold">⚡ ZETIS produit {quoi}</p>

        <div className="mt-4">
          <ProgressBar
            pct={run.progress_pct}
            label={total ? `Notion ${Math.min(done + 1, total)} sur ${total}` : "Démarrage…"}
          />
        </div>

        <dl className="mt-4 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-papa-muted">Notions équipées</dt>
            <dd className="font-semibold">
              {done}
              {total ? ` / ${total}` : ""}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-papa-muted">État</dt>
            <dd className="font-semibold">
              {run.status === "queued" ? "en file d'attente" : "en cours"}
            </dd>
          </div>
        </dl>

        <p className="mt-4 text-xs text-papa-muted">
          Le lot tourne dans un processus séparé : vous pouvez fermer cette fenêtre et naviguer. Il
          se met en pause si Massimo travaille — entre deux notions, jamais au milieu d'une.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Fermer
          </Button>
          {run.chapter_id !== null && (
            <Link to={`/couverture?chapitre=${run.chapter_id}`} onClick={onClose}>
              <Button>Voir le chapitre</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
