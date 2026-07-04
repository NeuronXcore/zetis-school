import { cn } from "@zetis/ui";

// Chip de notion éditable (rattrapage skills-only) — extrait local de la modale pour
// rester présentation pure. Deux états : lecture (renommer au clic, retirer via ×) ou
// édition inline (input). Un doublon inter-groupes est SIGNALÉ (bordure pointillée ambre
// + « aussi dans … »), jamais bloqué — l'upsert idempotent le fusionne côté serveur.

export function EditableNotionChip({
  name,
  editing,
  draft,
  duplicateChapters,
  onStartEdit,
  onSetDraft,
  onCommit,
  onRemove,
}: {
  name: string;
  editing: boolean;
  draft: string;
  /** Chapitres d'échafaudage AUTRES où la même notion réapparaît (vide/absent = unique). */
  duplicateChapters?: string[];
  onStartEdit: () => void;
  onSetDraft: (v: string) => void;
  onCommit: () => void;
  onRemove: () => void;
}) {
  if (editing) {
    return (
      <input
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus
        aria-label="Renommer la notion"
        value={draft}
        onChange={(e) => onSetDraft(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "Escape") onCommit();
        }}
        className="rounded-full border border-papa-accent bg-papa-bg px-3 py-1 text-xs text-papa-text outline-none"
      />
    );
  }

  const duplicate = duplicateChapters && duplicateChapters.length > 0;
  const others = duplicate ? duplicateChapters! : [];
  const alsoIn =
    others.length === 1
      ? `« ${others[0]} »`
      : `${others.length} autres sections`;

  return (
    <span
      title={duplicate ? `Notion déjà présente dans ${alsoIn}` : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1.5 text-xs text-emerald-200",
        duplicate
          ? "border-dashed border-amber-400/60 bg-emerald-500/10"
          : "border-emerald-400/40 bg-emerald-500/15",
      )}
    >
      <button
        type="button"
        onClick={onStartEdit}
        aria-label={`Renommer la notion ${name}`}
        className="max-w-[16rem] truncate"
      >
        {name || "(vide)"}
      </button>
      {duplicate && (
        <span className="whitespace-nowrap text-[10px] text-amber-300/90">
          aussi dans {alsoIn}
        </span>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Retirer la notion ${name}`}
        className="grid h-4 w-4 place-items-center rounded-full bg-black/20 text-emerald-100 hover:bg-black/40"
      >
        ×
      </button>
    </span>
  );
}
