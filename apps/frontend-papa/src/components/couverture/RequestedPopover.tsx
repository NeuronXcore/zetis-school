// Ce que Massimo a réclamé sur les notions d'une leçon (addendum ADR-0027).
//
// Le badge « ⭐ réclamé » ouvre ceci : Papa voit *quelle notion* et *quel type* de contenu manque,
// puis trie — Fait (le contenu est produit) ou Ignorer. La demande est un REPÈRE DE PRIORITÉ sur
// la Couverture, pas une injonction : la production reste un geste de Papa (les colonnes de la
// matrice), on ne la déclenche pas d'ici.
//
// Les mutations passent par le module `content_requests` (hook `useCoverage.setRequestStatus`),
// JAMAIS par `production` — son invariant lecture seule est préservé.
import { type ContentRequest, type ContentRequestStatus } from "@zetis/types";
import { CONTENT_KIND_LABEL } from "../../lib/contentRequests";

export function RequestedPopover({
  lessonTitle,
  requests,
  onSetStatus,
  onClose,
}: {
  lessonTitle: string;
  requests: ContentRequest[];
  onSetStatus: (id: number, status: ContentRequestStatus) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[440px] max-w-full rounded-xl border border-papa-border bg-papa-surface p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Contenus réclamés par Massimo"
      >
        <h4 className="text-[13px] font-bold">
          <span aria-hidden>⭐</span> Réclamé par Massimo
        </h4>
        <p className="mb-3 mt-1 text-[11.5px] leading-relaxed text-papa-muted">
          Ce que Massimo a demandé dans le chat sur les notions de « {lessonTitle} », sans le
          trouver. C'est un <b className="text-papa-text">repère de priorité</b>, pas une injonction :
          tu produis depuis les colonnes de la matrice, quand tu veux.
        </p>

        {requests.length === 0 ? (
          <p className="rounded-lg border border-papa-border bg-papa-bg/50 px-3 py-4 text-center text-[12px] text-papa-muted">
            Plus aucune demande en attente ici.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {requests.map((req) => (
              <li
                key={req.id}
                className="flex items-center gap-2 rounded-lg border border-papa-border/70 bg-papa-bg/40 px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                  <b className="font-semibold">{req.skill_name ?? `notion #${req.skill_id}`}</b>
                  <span className="text-papa-muted"> — {CONTENT_KIND_LABEL[req.content_kind] ?? req.content_kind}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onSetStatus(req.id, "done")}
                  title="Le contenu est produit — retirer la demande"
                  className="shrink-0 rounded-lg bg-papa-accent px-2.5 py-1 text-xs font-semibold text-papa-bg transition-opacity hover:opacity-90"
                >
                  Fait
                </button>
                <button
                  type="button"
                  onClick={() => onSetStatus(req.id, "dismissed")}
                  title="Ignorer cette demande"
                  className="shrink-0 rounded-lg border border-papa-border px-2.5 py-1 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
                >
                  Ignorer
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
