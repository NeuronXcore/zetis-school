import { useEffect, useMemo, useState } from "react";
import { Button, ConfirmDialog, Input } from "@zetis/ui";
import { type MindmapDetail, type MindmapJson, type MindmapNode } from "@zetis/types";
import { updateMindmap } from "../lib/mindmaps";

// Éditeur STRUCTURÉ d'une carte mentale (Papa) — remplace l'édition du mindmap_json brut. On édite
// l'arbre directement : idée centrale, puis nœuds (renommer, ajouter un sous-nœud, déplacer sous un
// autre parent, supprimer, marquer « clé » / « option »). L'édition étant arborescente, les cycles
// et les parents fantômes sont IMPOSSIBLES par construction. Le PUT /api/mindmaps/{id} revalide
// l'intégrité côté serveur (garde ultime) → la carte repasse « à valider ».
//
// Bornes miroir du schéma Pydantic (app/modules/mindmaps/schemas.py) : center ≤ 160, label ≤ 120,
// ≤ 60 nœuds. Les `edges` (optionnels/dérivables de `parent`) ne sont pas édités ici (arbre strict).

const MAX_CENTER = 160;
const MAX_LABEL = 120;
const MAX_NODES = 60;

type Role = "req" | "opt" | "none";

interface Draft {
  center: string;
  nodes: MindmapNode[];
  required: string[];
  optional: string[];
}

function childrenOf(nodes: MindmapNode[], parent: string | null): MindmapNode[] {
  return nodes.filter((n) => n.parent === parent);
}

function descendantIds(nodes: MindmapNode[], id: string): Set<string> {
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const n of nodes) {
      if (n.parent === cur && !out.has(n.id)) {
        out.add(n.id);
        stack.push(n.id);
      }
    }
  }
  return out;
}

function freshId(nodes: MindmapNode[]): string {
  const taken = new Set(nodes.map((n) => n.id));
  let i = 1;
  while (taken.has(`n${i}`)) i++;
  return `n${i}`;
}

export function MindmapEditorModal({
  mindmap,
  onClose,
  onSaved,
}: {
  mindmap: MindmapDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    center: mindmap.mindmap_json.center,
    nodes: mindmap.mindmap_json.nodes.map((n) => ({ ...n })),
    required: [...(mindmap.mindmap_json.required_nodes ?? [])],
    optional: [...(mindmap.mindmap_json.optional_nodes ?? [])],
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MindmapNode | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const roleOf = (id: string): Role =>
    draft.required.includes(id) ? "req" : draft.optional.includes(id) ? "opt" : "none";

  // ── Mutations d'arbre (immuables) ───────────────────────────────────────
  const setLabel = (id: string, label: string) =>
    setDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, label } : n)) }));

  const move = (id: string, parent: string | null) =>
    setDraft((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, parent } : n)) }));

  const addChild = (parent: string | null) =>
    setDraft((d) => {
      if (d.nodes.length >= MAX_NODES) return d;
      return { ...d, nodes: [...d.nodes, { id: freshId(d.nodes), label: "", parent }] };
    });

  const removeSubtree = (id: string) =>
    setDraft((d) => {
      const gone = descendantIds(d.nodes, id);
      gone.add(id);
      return {
        center: d.center,
        nodes: d.nodes.filter((n) => !gone.has(n.id)),
        required: d.required.filter((x) => !gone.has(x)),
        optional: d.optional.filter((x) => !gone.has(x)),
      };
    });

  const setRole = (id: string, role: Role) =>
    setDraft((d) => ({
      ...d,
      required: role === "req" ? [...new Set([...d.required, id])] : d.required.filter((x) => x !== id),
      optional: role === "opt" ? [...new Set([...d.optional, id])] : d.optional.filter((x) => x !== id),
    }));

  const requestDelete = (node: MindmapNode) => {
    if (childrenOf(draft.nodes, node.id).length > 0) setConfirmDelete(node);
    else removeSubtree(node.id);
  };

  // ── Sauvegarde ──────────────────────────────────────────────────────────
  async function save() {
    const center = draft.center.trim();
    const nodes = draft.nodes.map((n) => ({ ...n, label: n.label.trim() }));
    if (!center) return setError("L'idée centrale est obligatoire.");
    if (nodes.length === 0) return setError("Ajoute au moins une branche.");
    if (nodes.some((n) => !n.label)) return setError("Chaque nœud doit avoir un libellé.");

    const ids = new Set(nodes.map((n) => n.id));
    const payload: MindmapJson = {
      center,
      nodes,
      required_nodes: draft.required.filter((x) => ids.has(x)),
      optional_nodes: draft.optional.filter((x) => ids.has(x)),
    };
    if (payload.required_nodes?.length === 0) delete payload.required_nodes;
    if (payload.optional_nodes?.length === 0) delete payload.optional_nodes;

    setBusy(true);
    setError(null);
    try {
      await updateMindmap(mindmap.id, payload);
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
        {/* Header */}
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

        {/* Body */}
        <div className="papa-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <label className="block text-sm">
            <span className="text-papa-muted">◎ Idée centrale</span>
            <Input
              className="mt-1"
              value={draft.center}
              maxLength={MAX_CENTER}
              placeholder="L'idée au cœur de la carte"
              onChange={(e) => setDraft((d) => ({ ...d, center: e.target.value }))}
            />
          </label>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-papa-muted">🌳 Branches et idées</span>
              <span
                className={`text-xs tabular-nums ${
                  draft.nodes.length >= MAX_NODES ? "text-papa-warn" : "text-papa-muted"
                }`}
              >
                {draft.nodes.length}/{MAX_NODES} nœuds
              </span>
            </div>

            <TreeLevel
              nodes={draft.nodes}
              parent={null}
              depth={0}
              roleOf={roleOf}
              onLabel={setLabel}
              onMove={move}
              onAddChild={addChild}
              onDelete={requestDelete}
              onRole={setRole}
            />

            <button
              type="button"
              disabled={draft.nodes.length >= MAX_NODES}
              onClick={() => addChild(null)}
              className="mt-3 rounded-full border border-dashed border-papa-border px-3 py-1.5 text-xs text-papa-muted hover:text-papa-text disabled:opacity-40"
            >
              ⊕ Ajouter une branche
            </button>
          </div>

          <p className="text-xs text-papa-muted">
            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">Clé</span> = à
            retenir absolument (compte dans le score) ·{" "}
            <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-cyan-300">Option</span> =
            détail facultatif. Sans marquage, tous les nœuds comptent.
          </p>

          {error && (
            <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>
          )}
        </div>

        {/* Footer */}
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

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Supprimer ce nœud ?"
        confirmLabel="Supprimer"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) removeSubtree(confirmDelete.id);
          setConfirmDelete(null);
        }}
        onCancel={() => setConfirmDelete(null)}
      >
        « {confirmDelete?.label || "(sans nom)"} » et tous ses sous-nœuds seront retirés de la carte.
      </ConfirmDialog>
    </div>
  );
}

// Un niveau de l'arbre (récursif) : chaque nœud + ses enfants, indentés avec un guide vertical.
function TreeLevel({
  nodes,
  parent,
  depth,
  roleOf,
  onLabel,
  onMove,
  onAddChild,
  onDelete,
  onRole,
}: {
  nodes: MindmapNode[];
  parent: string | null;
  depth: number;
  roleOf: (id: string) => Role;
  onLabel: (id: string, label: string) => void;
  onMove: (id: string, parent: string | null) => void;
  onAddChild: (parent: string | null) => void;
  onDelete: (node: MindmapNode) => void;
  onRole: (id: string, role: Role) => void;
}) {
  const rows = childrenOf(nodes, parent);
  if (rows.length === 0) return null;
  return (
    <div className={depth > 0 ? "ml-3 space-y-2 border-l border-papa-border/60 pl-3" : "space-y-2"}>
      {rows.map((node) => (
        <div key={node.id} className="space-y-2">
          <NodeRow
            node={node}
            nodes={nodes}
            role={roleOf(node.id)}
            onLabel={onLabel}
            onMove={onMove}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onRole={onRole}
          />
          <TreeLevel
            nodes={nodes}
            parent={node.id}
            depth={depth + 1}
            roleOf={roleOf}
            onLabel={onLabel}
            onMove={onMove}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onRole={onRole}
          />
        </div>
      ))}
    </div>
  );
}

function RoleChip({
  active,
  tone,
  label,
  onClick,
}: {
  active: boolean;
  tone: "emerald" | "cyan";
  label: string;
  onClick: () => void;
}) {
  const on =
    tone === "emerald"
      ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-300"
      : "border-cyan-400/50 bg-cyan-500/15 text-cyan-300";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
        active ? on : "border-papa-border text-papa-muted hover:text-papa-text"
      }`}
    >
      {label}
    </button>
  );
}

function NodeRow({
  node,
  nodes,
  role,
  onLabel,
  onMove,
  onAddChild,
  onDelete,
  onRole,
}: {
  node: MindmapNode;
  nodes: MindmapNode[];
  role: Role;
  onLabel: (id: string, label: string) => void;
  onMove: (id: string, parent: string | null) => void;
  onAddChild: (parent: string | null) => void;
  onDelete: (node: MindmapNode) => void;
  onRole: (id: string, role: Role) => void;
}) {
  // Parents valides : le centre + tout nœud qui n'est ni ce nœud ni un de ses descendants.
  const parentOptions = useMemo(() => {
    const invalid = descendantIds(nodes, node.id);
    invalid.add(node.id);
    return nodes.filter((n) => !invalid.has(n.id));
  }, [nodes, node.id]);

  return (
    <div className="rounded-lg border border-papa-border/70 bg-papa-bg p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="text-papa-muted">
          ◦
        </span>
        <Input
          className="min-w-[10rem] flex-1"
          value={node.label}
          maxLength={MAX_LABEL}
          placeholder="Libellé du nœud"
          onChange={(e) => onLabel(node.id, e.target.value)}
        />
        <RoleChip
          active={role === "req"}
          tone="emerald"
          label="Clé"
          onClick={() => onRole(node.id, role === "req" ? "none" : "req")}
        />
        <RoleChip
          active={role === "opt"}
          tone="cyan"
          label="Option"
          onClick={() => onRole(node.id, role === "opt" ? "none" : "opt")}
        />
        <button
          type="button"
          onClick={() => onAddChild(node.id)}
          title="Ajouter un sous-nœud"
          className="rounded-lg border border-papa-border px-2 py-1 text-xs text-papa-muted hover:text-papa-text"
        >
          ⊕ sous-nœud
        </button>
        <button
          type="button"
          onClick={() => onDelete(node)}
          aria-label="Supprimer le nœud"
          className="rounded-lg border border-papa-border px-2 py-1 text-papa-muted hover:text-rose-300"
        >
          🗑
        </button>
      </div>

      <label className="mt-2 flex items-center gap-2 text-xs text-papa-muted">
        <span className="shrink-0">↳ sous&nbsp;:</span>
        <select
          value={node.parent ?? ""}
          onChange={(e) => onMove(node.id, e.target.value === "" ? null : e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-papa-border bg-papa-surface px-2 py-1 text-papa-text focus:border-papa-accent focus:outline-none"
        >
          <option value="">◎ Centre (branche principale)</option>
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label || "(sans nom)"}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
