import { useState } from "react";
import { ConfirmDialog } from "@zetis/ui";

// Popup de validation par lot : portée matière (compte exact, en mémoire) ou année
// entière (le compte exact est renvoyé par l'API). Rappel §3 : rejetés et manuels
// ne bougent pas — valider reste un acte de relecture.
export type ValidateScope = "subject" | "year";

export function ValidateAllDialog({
  open,
  subjectName,
  pendingCount,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  subjectName: string;
  pendingCount: number;
  busy: boolean;
  onConfirm: (scope: ValidateScope) => void;
  onCancel: () => void;
}) {
  const [scope, setScope] = useState<ValidateScope>("subject");

  return (
    <ConfirmDialog
      open={open}
      title="Valider les chapitres en attente"
      confirmLabel="Valider"
      busy={busy}
      onConfirm={() => onConfirm(scope)}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="validate-scope"
            checked={scope === "subject"}
            onChange={() => setScope("subject")}
          />
          <span>
            Cette matière — {subjectName} ({pendingCount} chapitre
            {pendingCount > 1 ? "s" : ""} en attente)
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="radio"
            name="validate-scope"
            checked={scope === "year"}
            onChange={() => setScope("year")}
          />
          <span>Toute l'année (toutes les matières)</span>
        </label>
        <p className="mt-2">
          Les chapitres rejetés et manuels ne sont pas modifiés. Valider = tu as relu les
          intitulés ; ces chapitres alimenteront les leçons (Lot 2).
        </p>
      </div>
    </ConfirmDialog>
  );
}
