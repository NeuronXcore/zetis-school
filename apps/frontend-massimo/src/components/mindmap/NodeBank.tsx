import { type PointerEvent } from "react";

// Banque d'étiquettes du mode Reconstruire : chaque puce porte un `nodeId` (l'étiquette affichée est
// le label). L'élève **glisse** une puce sur un emplacement de la carte (drag pointeur → mouse ET
// touch, géré par le workspace). « Vérifier » demande au SERVEUR (déterministe) si tout est juste ;
// erreurs → popup + réessai, réussite → popup XP. Aucun score/XP calculé ici.

export interface BankChip {
  nodeId: string;
  label: string;
}

export function NodeBank({
  chips,
  usedIds,
  onDragChip,
  onReset,
  busy,
  failedAttempts,
}: {
  chips: BankChip[];
  usedIds: Set<string>;
  onDragChip: (nodeId: string, label: string, e: PointerEvent) => void;
  onReset: () => void;
  busy: boolean;
  failedAttempts: number;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-400">
          Glisse chaque étiquette sur son emplacement — <b className="text-cyan-300">ZETIS vérifie
          tout seul</b> quand la carte est complète.
        </p>
        {failedAttempts > 0 && (
          <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs font-semibold text-rose-300">
            {failedAttempts} essai{failedAttempts > 1 ? "s" : ""} raté{failedAttempts > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const used = usedIds.has(chip.nodeId);
          return (
            <button
              key={chip.nodeId}
              type="button"
              disabled={used || busy}
              // Glisser-déposer par pointeur (le workspace gère le suivi + le drop). `touch-none`
              // empêche le scroll de la page quand on tire une puce au doigt.
              onPointerDown={(e) => !used && !busy && onDragChip(chip.nodeId, chip.label, e)}
              className={`touch-none select-none rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                used
                  ? "cursor-default border-white/5 bg-white/5 text-slate-600 line-through"
                  : "cursor-grab border-white/15 bg-slate-900/60 text-slate-100 hover:border-cyan-400/50 active:cursor-grabbing"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        {busy && <span className="text-sm text-cyan-300">Vérification…</span>}
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="ml-auto rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:border-white/25"
        >
          Recommencer
        </button>
      </div>
    </div>
  );
}
