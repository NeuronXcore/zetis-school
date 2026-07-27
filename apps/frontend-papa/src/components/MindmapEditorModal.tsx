import { useEffect, useState } from "react";
import { Button } from "@zetis/ui";
import { type MindmapDetail } from "@zetis/types";
import {
  MindmapOutlineEditor,
  type Draft,
  draftFrom,
  draftToJson,
  validateDraft,
} from "./MindmapOutlineEditor";
import { updateMindmap } from "../lib/mindmaps";

// Coquille de modale autour de `MindmapOutlineEditor` — l'édition seule, hors aperçu. Le même
// éditeur est monté dans l'onglet « Éditer » de `MindmapPreviewModal`, où le canvas partagé se
// re-layoute à droite (addendum ADR-0016 §D) : un seul éditeur, deux points de montage.
//
// Le `PUT /api/mindmaps/{id}` revalide l'arbre côté serveur (garde ultime) → la carte repasse
// « à valider ».

export function MindmapEditorModal({
  mindmap,
  onClose,
  onSaved,
}: {
  mindmap: MindmapDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(mindmap.mindmap_json));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function save() {
    const invalid = validateDraft(draft);
    if (invalid) return setError(invalid);
    setBusy(true);
    setError(null);
    try {
      await updateMindmap(mindmap.id, draftToJson(draft));
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement échoué (arbre invalide ?).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Éditer la carte mentale"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-papa-accent/30 bg-papa-surface p-5 shadow-[0_0_45px_-10px_rgba(16,185,129,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-bold text-papa-text">
            🧠 Éditer la carte <span className="text-papa-muted">— {mindmap.title}</span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg border border-papa-border px-3 py-1.5 text-sm hover:text-papa-accent"
          >
            ✕
          </button>
        </div>

        <div className="papa-scrollbar min-h-0 flex-1 overflow-y-auto pr-1">
          <MindmapOutlineEditor draft={draft} onDraftChange={setDraft} error={error} />
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-2">
          <p className="text-xs text-papa-muted">
            L'enregistrement revalide l'arbre ; la carte repasse « à valider ».
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={busy}>
              Annuler
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
