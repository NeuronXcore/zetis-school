import { useEffect, useState } from "react";
import { type AgendaItemPilot, type AgendaKind } from "@zetis/types";
import { Button, Input, Select } from "@zetis/ui";
import { kindLabel, longDayLabel } from "../../lib/agendaModel";

// Panneau de détail d'une échéance.
//
// Il porte les **trois refus** de l'ADR-0025, et il les ÉNONCE — une règle de co-édition non
// dite est vécue comme un bug :
//   1. aucune case à cocher (l'état est en lecture seule, « seul Massimo peut cocher ») ;
//   2. l'édition d'un item de Massimo PRÉVIENT qu'elle sera visible chez lui ;
//   3. « Archiver », jamais « Supprimer ».

const KINDS: AgendaKind[] = ["devoir", "controle", "rendu"];

interface Props {
  item: AgendaItemPilot;
  saving: boolean;
  onClose: () => void;
  onSave: (body: { label: string; due_on: string; kind: AgendaKind }) => Promise<void>;
  onSaveNote: (note: string | null) => Promise<void>;
  onArchive: () => void;
}

export function AgendaDetailPanel({
  item,
  saving,
  onClose,
  onSave,
  onSaveNote,
  onArchive,
}: Props) {
  const [label, setLabel] = useState(item.label);
  const [dueOn, setDueOn] = useState(item.due_on);
  const [kind, setKind] = useState<AgendaKind>(item.kind);
  const [note, setNote] = useState(item.parent_note ?? "");

  // Changer d'item réinitialise le formulaire : sans ça, la saisie en cours suivrait la
  // sélection et on écrirait sur la mauvaise échéance.
  useEffect(() => {
    setLabel(item.label);
    setDueOn(item.due_on);
    setKind(item.kind);
    setNote(item.parent_note ?? "");
  }, [item.id, item.label, item.due_on, item.kind, item.parent_note]);

  const byStudent = item.created_by === "student";
  const dirty = label !== item.label || dueOn !== item.due_on || kind !== item.kind;
  const noteDirty = note !== (item.parent_note ?? "");

  return (
    <aside className="flex flex-col gap-4 rounded-xl border border-papa-border bg-papa-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold leading-tight">{item.label}</h2>
          <p className="mt-1 text-xs text-papa-muted">
            {item.subject?.name ?? "Sans matière"} · {longDayLabel(item.due_on)} ·{" "}
            {kindLabel(item.kind)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail"
          className="rounded-md px-2 py-1 text-papa-muted transition-colors hover:text-papa-text"
        >
          ✕
        </button>
      </div>

      {/* Refus n°2 : pas de modification silencieuse. Papa décide en sachant que ce sera vu. */}
      {byStudent ? (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
          ✎ Cette échéance a été saisie par Massimo. Si vous la modifiez, elle portera la mention
          « <b>complété par papa</b> » dans son agenda — il verra que vous y avez touché.
        </p>
      ) : (
        <p className="rounded-lg bg-papa-surface-2 px-3 py-2 text-xs leading-relaxed text-papa-muted">
          Échéance que vous avez ajoutée. Elle apparaît chez Massimo avec la mention « ajouté par
          papa ».
        </p>
      )}

      <label className="flex flex-col gap-1 text-xs text-papa-muted">
        Intitulé
        <Input value={label} onChange={(e) => setLabel(e.target.value)} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-papa-muted">
          Date
          <Input type="date" value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-papa-muted">
          Type
          <Select value={kind} onChange={(e) => setKind(e.target.value as AgendaKind)}>
            {KINDS.map((value) => (
              <option key={value} value={value}>
                {kindLabel(value)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* Refus n°1 : l'état est une pastille EN LECTURE SEULE. Aucune affordance de coche
          n'existe sur cette page — si l'API renvoyait 403, ce serait un bug d'ici. */}
      <div className="flex flex-col gap-1 text-xs text-papa-muted">
        État
        <div className="flex items-start gap-2 rounded-lg border border-papa-border bg-papa-bg px-3 py-2">
          <span
            aria-hidden
            className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
              item.done_at ? "bg-emerald-400" : "bg-papa-muted/50"
            }`}
          />
          <p className="text-xs leading-relaxed text-papa-text">
            {item.done_at ? (
              <>
                Coché par Massimo. <b>Vous ne pouvez pas décocher</b> à sa place.
              </>
            ) : (
              <>
                Pas encore coché — <b>seul Massimo peut cocher</b>. Vous ne pouvez pas marquer
                cette échéance comme faite à sa place.
              </>
            )}
          </p>
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs text-papa-muted">
        Note privée
        <textarea
          rows={3}
          value={note}
          placeholder="Visible par vous seul."
          onChange={(e) => setNote(e.target.value)}
          className="w-full rounded-lg border border-papa-border bg-papa-bg px-3 py-2 text-sm text-papa-text outline-none focus:border-papa-accent"
        />
        <span>🔒 Jamais servie à l'interface de Massimo.</span>
      </label>

      {item.edited_by_parent_at && (
        <p className="text-[11px] text-papa-muted">
          Corrigée par vous le{" "}
          {new Date(item.edited_by_parent_at).toLocaleString("fr-FR", {
            dateStyle: "short",
            timeStyle: "short",
          })}
        </p>
      )}
      {item.dismissed_at && (
        <p className="text-[11px] text-papa-muted">
          Masquée / archivée le{" "}
          {new Date(item.dismissed_at).toLocaleString("fr-FR", { dateStyle: "short" })} — la ligne
          est conservée.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={saving || (!dirty && !noteDirty)}
          onClick={() => {
            void (async () => {
              if (dirty) await onSave({ label, due_on: dueOn, kind });
              if (noteDirty) await onSaveNote(note.trim() === "" ? null : note);
            })();
          }}
        >
          Enregistrer
        </Button>
        {/* Refus n°3 : « Archiver », jamais « Supprimer ». */}
        {!item.dismissed_at && (
          <Button size="sm" variant="ghost" disabled={saving} onClick={onArchive}>
            Archiver
          </Button>
        )}
      </div>
    </aside>
  );
}
