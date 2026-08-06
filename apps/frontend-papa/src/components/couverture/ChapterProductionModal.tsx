import { Button } from "@zetis/ui";

import { type UseChapterProduction } from "../../hooks/useChapterProduction";
import { ProgressBar } from "../ProgressBar";
import { useProgressionEstimee } from "../../hooks/useEstimations";

// Production en lot d'un chapitre (ADR-0031, addendum « le gate vit dans la sélection »).
// Purement présentationnelle : la sélection, le gate et l'exécution vivent côté serveur.
//
// Sa raison d'être est de rendre le GATE lisible AVANT le clic. Sur un chapitre neuf, `eligible`
// est vide et tout est bloqué : sans cette modale, Papa lancerait un lot qui ne produirait rien
// et lirait un échec là où le gate fonctionne.

export function ChapterProductionModal({ prod }: { prod: UseChapterProduction }) {
  const eligible = prod.preview?.eligible ?? [];
  // Estimation de repli, utilisée UNIQUEMENT tant qu'aucun run n'existe. Dès qu'il y en a un,
  // c'est `progress_pct` du serveur qui fait foi : il compte des notions équipées, pas des
  // secondes écoulées. L'estimation d'origine mentait d'un facteur 2 (mesuré le 2026-08-02).
  // Aperçu AVANT lancement : aucun travail n'existe encore, donc aucune `estimated_ms` — c'est
  // très exactement le cas que la table `/production/estimations` sert (ADR-0041 §9).
  const estimated = useProgressionEstimee(prod.busy, "equip_notion", {
    facteur: eligible.length,
  });
  const pct = prod.run ? prod.run.progress_pct : estimated;
  if (prod.chapterId === null) return null;

  const blocked = prod.preview?.blocked ?? [];
  const atCap =
    prod.preview !== null && prod.preview.pending_backlog >= prod.preview.max_pending;
  const done = prod.run?.status === "done";
  const failed = prod.run?.status === "failed";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-papa-border bg-papa-surface p-5">
        <p className="text-base font-bold">⚡ Compléter le chapitre</p>

        {prod.loading && !prod.run && (
          <p className="mt-3 text-sm text-papa-muted">Lecture du chapitre…</p>
        )}

        {prod.preview && !prod.run && (
          <>
            <p className="mt-3 text-sm">
              ZETIS équipera <span className="font-semibold">{eligible.length} notion
              {eligible.length > 1 ? "s" : ""}</span> — cours, fiche, cartes, quiz, carte mentale.
            </p>

            {blocked.length > 0 && (
              // Jamais un compte nu : un « 13 en attente » ne dit pas lesquelles, donc ne dit pas
              // à Papa ce qu'il doit valider pour débloquer son lot.
              <details className="mt-3 rounded-xl border border-amber-400/40 bg-amber-500/5 p-3">
                <summary className="cursor-pointer text-sm font-semibold text-amber-200">
                  {blocked.length} notion{blocked.length > 1 ? "s" : ""} en attente — ZETIS ne les
                  touchera pas
                </summary>
                <p className="mt-2 text-xs text-papa-muted">
                  Le cours est le seul contenu que Massimo lit vraiment : ZETIS ne le valide pas à
                  votre place. Validez-les d'abord, puis relancez.
                </p>
                <ul className="mt-2 space-y-1 text-xs text-papa-muted">
                  {blocked.map((n) => (
                    <li key={n.skill_id}>
                      · <span className="font-medium text-papa-text">{n.name}</span> — {n.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {eligible.length === 0 && (
              <p className="mt-3 rounded-xl border border-papa-border bg-papa-bg p-3 text-sm text-papa-muted">
                Rien à produire pour l'instant — ce n'est pas une erreur. Tout ce chapitre attend
                votre validation des cours.
              </p>
            )}

            {atCap && (
              <p className="mt-3 text-sm text-amber-200">
                {prod.preview.pending_backlog} contenus attendent déjà votre relecture (plafond :{" "}
                {prod.preview.max_pending}). Validez-en une partie avant de relancer.
              </p>
            )}
          </>
        )}

        {prod.busy && (
          <div className="mt-4">
            <ProgressBar
              pct={pct}
              label={
                prod.run?.total_notions
                  ? `Notion ${(prod.run.done_notions ?? 0) + 1} sur ${prod.run.total_notions}`
                  : `Équipement de ${eligible.length} notions…`
              }
            />
            <p className="mt-2 text-xs text-papa-muted">
              Vous pouvez fermer cette fenêtre : le lot continue. Il se met en pause si Massimo
              travaille — entre deux notions, jamais au milieu d'une.
            </p>
          </div>
        )}

        {done && <p className="mt-4 text-sm text-emerald-300">✅ Lot terminé.</p>}
        {failed && (
          <p className="mt-4 text-sm text-rose-300">
            Le lot s'est interrompu. Ce qui a été produit est conservé.
          </p>
        )}
        {prod.error && <p className="mt-3 text-sm text-rose-300">{prod.error}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={prod.close}>
            {prod.busy || done || failed ? "Fermer" : "Annuler"}
          </Button>
          {!prod.run && (
            <Button
              onClick={prod.confirm}
              disabled={prod.loading || eligible.length === 0 || atCap}
            >
              Équiper {eligible.length} notion{eligible.length > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
