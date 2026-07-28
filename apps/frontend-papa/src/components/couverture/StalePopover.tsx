// Popover d'une cellule périmée : dire ce qui se passe RÉELLEMENT, puis proposer deux issues.
//
// Le point important du texte : l'objet est **toujours servi** à Massimo dans son ancienne
// version. C'est ce qui distingue le périmé du `pending` — l'un dort, l'autre agit.
import { type CoverageCellKey, type CoverageLesson } from "@zetis/types";

const TYPE_LABEL: Record<CoverageCellKey, string> = {
  cours: "Cours",
  quiz: "Quiz",
  fiche: "Fiche",
  mindmap: "Mindmap",  // JAMAIS « carte mentale » : à ne pas confondre avec les cartes de révision
};

export function StalePopover({
  cellKey,
  lesson,
  href,
  onRegenerate,
  onInspect,
  onClose,
}: {
  cellKey: CoverageCellKey;
  lesson: CoverageLesson;
  /** Route CIBLÉE sur l'objet périmé — « Inspecter » ouvre l'objet, pas la page qui le contient. */
  href: string | null;
  onRegenerate: () => void;
  onInspect: (route: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-[340px] rounded-xl border border-papa-border bg-papa-surface p-4 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`${TYPE_LABEL[cellKey]} périmé`}
      >
        <h4 className="mb-1.5 text-[13px] font-bold">{TYPE_LABEL[cellKey]} périmé·e</h4>
        <p className="mb-3 text-[11.5px] leading-relaxed text-papa-muted">
          Produit depuis un cours réécrit depuis. Sur « {lesson.title} », il est{" "}
          <b className="text-papa-text">toujours servi à Massimo</b> dans son ancienne version.
          Régénérer le remet en phase avec le cours actuel.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRegenerate}
            className="rounded-lg bg-papa-accent px-3 py-1.5 text-xs font-semibold text-papa-bg hover:opacity-90"
          >
            ↻ Régénérer
          </button>
          {href && (
            <button
              type="button"
              onClick={() => onInspect(href)}
              className="rounded-lg border border-papa-border px-3 py-1.5 text-xs font-semibold text-papa-text hover:bg-papa-surface-2"
            >
              👁 Inspecter
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
