import { useState, type ReactNode } from "react";
import { Button } from "./button";
import { ConfirmDialog } from "./confirm-dialog";

// Actions de cycle de vie d'un contenu IA validable par Papa (fiche, mindmap… ; capsules
// gardent leur barre bespoke). Régénérer et Supprimer passent par un ConfirmDialog partagé.
// « Générer » n'est PAS ici : il crée un contenu qui n'existe pas encore (bouton au niveau
// de la leçon). Ce composant agit sur un contenu déjà présent.
//
// Tous les gestes sont OPTIONNELS et ne se rendent que si leur handler existe (adr-0039 §8) : la
// file de relecture n'en passe que deux, parce que **relire n'est pas produire**. Éditer,
// régénérer et supprimer sont des gestes de production, ils ont déjà leurs pages de pilotage.

export type ContentStatus = "pending" | "validated" | "rejected";

export interface ContentLifecycleActionsProps {
  status: ContentStatus;
  onValidate?: () => void;
  /** Rejet explicite. Absent = la page n'offre pas ce geste (ex. un type sans endpoint de rejet). */
  onReject?: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Désactive les actions pendant un appel API. */
  busy?: boolean;
  /** Nom du contenu, injecté dans les libellés de confirmation (ex. le titre de la fiche). */
  itemLabel?: string;
  /**
   * Signal AVANT destruction, ajouté aux confirmations de Régénérer / Supprimer : ce que l'élève
   * a déjà produit sur ce contenu et qui va disparaître (ex. « Massimo l'a reconstruite 3 fois
   * (moyenne 78 %) »). C'est la seule information qui rend la confirmation utile — sans elle, Papa
   * confirme à l'aveugle. Absent = confirmation générique.
   */
  destructionNotice?: ReactNode;
  /** Libellés surchargables (défauts pédagogiques bienveillants). */
  labels?: Partial<{
    validate: string;
    reject: string;
    regenerate: string;
    edit: string;
    delete: string;
  }>;
}

const STATUS_STYLE: Record<ContentStatus, string> = {
  pending: "bg-amber-500/15 text-amber-300",
  validated: "bg-emerald-500/15 text-emerald-300",
  rejected: "bg-rose-500/15 text-rose-300",
};
const STATUS_LABEL: Record<ContentStatus, string> = {
  pending: "à valider",
  validated: "validée",
  rejected: "rejetée",
};

/** Badge de statut de validation (réutilise le vocabulaire bienveillant). */
export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ContentLifecycleActions({
  status,
  onValidate,
  onReject,
  onRegenerate,
  onEdit,
  onDelete,
  busy = false,
  itemLabel,
  destructionNotice,
  labels,
}: ContentLifecycleActionsProps) {
  const [confirming, setConfirming] = useState<null | "regenerate" | "delete" | "reject">(null);
  const suffix = itemLabel ? ` « ${itemLabel} »` : "";

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {status !== "validated" && onValidate && (
        <Button
          onClick={onValidate}
          disabled={busy}
          className="bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
        >
          {labels?.validate ?? "Valider"}
        </Button>
      )}
      {status !== "rejected" && onReject && (
        <Button
          variant="ghost"
          onClick={() => setConfirming("reject")}
          disabled={busy}
          className="text-muted-foreground hover:text-rose-300"
        >
          {labels?.reject ?? "Rejeter"}
        </Button>
      )}
      {onEdit && (
        <Button variant="ghost" onClick={onEdit} disabled={busy}>
          {labels?.edit ?? "✏️ Éditer"}
        </Button>
      )}
      {onRegenerate && (
        <Button variant="ghost" onClick={() => setConfirming("regenerate")} disabled={busy}>
          {labels?.regenerate ?? "↻ Régénérer"}
        </Button>
      )}
      {onDelete && (
        <Button
          variant="ghost"
          onClick={() => setConfirming("delete")}
          disabled={busy}
          className="text-muted-foreground hover:text-rose-300"
        >
          {labels?.delete ?? "Supprimer"}
        </Button>
      )}

      <ConfirmDialog
        open={confirming === "reject"}
        title="Rejeter le contenu ?"
        confirmLabel="Rejeter"
        tone="important"
        busy={busy}
        onConfirm={() => {
          setConfirming(null);
          onReject?.();
        }}
        onCancel={() => setConfirming(null)}
      >
        Le contenu{suffix} n'atteindra pas Massimo. Il reste en base et pourra être régénéré depuis
        sa page de pilotage.
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === "regenerate"}
        title="Régénérer le contenu ?"
        confirmLabel="Régénérer"
        busy={busy}
        onConfirm={() => {
          setConfirming(null);
          onRegenerate?.();
        }}
        onCancel={() => setConfirming(null)}
      >
        La version actuelle{suffix} sera remplacée par une nouvelle génération, et le contenu
        repassera « à valider ».
        {destructionNotice && <span className="mt-2 block">{destructionNotice}</span>}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming === "delete"}
        title="Supprimer le contenu ?"
        confirmLabel="Supprimer"
        tone="danger"
        busy={busy}
        onConfirm={() => {
          setConfirming(null);
          onDelete?.();
        }}
        onCancel={() => setConfirming(null)}
      >
        Cette action supprime définitivement le contenu{suffix}. Tu pourras le régénérer plus
        tard depuis la leçon.
        {destructionNotice && <span className="mt-2 block">{destructionNotice}</span>}
      </ConfirmDialog>
    </div>
  );
}
