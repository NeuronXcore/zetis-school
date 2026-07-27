import { useCallback, useMemo, useState } from "react";
import { ConfirmDialog, Input } from "@zetis/ui";
import { type MindmapJson, type MindmapNode } from "@zetis/types";

// Éditeur STRUCTURÉ de l'arbre d'une carte mentale (Papa) — jamais le `mindmap_json` brut (même
// correction que FicheEditorModal vs spec_json : un JSON brut est inutilisable sur 15-20 nœuds).
//
// Sans chrome de modale : il est monté à DEUX endroits (addendum ADR-0016 §D) — la modale
// `MindmapEditorModal` (édition seule) et l'onglet « Éditer » de la modale d'aperçu, où le canvas
// partagé se re-layoute à droite sur le brouillon. D'où le `draft` remonté par `onDraftChange`.
//
// L'édition étant ARBORESCENTE, les cycles et les parents fantômes sont impossibles par
// construction (`parentOptions` exclut les descendants) — la garde d'intégrité restante est le
// refus des libellés vides et de l'arbre vide (`validateDraft`). Le PUT revalide côté serveur.
//
// Bornes miroir du schéma Pydantic (app/modules/mindmaps/schemas.py) : center ≤ 160, label ≤ 120,
// ≤ 60 nœuds. Les `edges` (optionnels/dérivables de `parent`) ne sont pas édités ici (arbre strict).

export const MAX_CENTER = 160;
export const MAX_LABEL = 120;
export const MAX_NODES = 60;

type Role = "req" | "opt" | "none";

export interface Draft {
  center: string;
  nodes: MindmapNode[];
  required: string[];
  optional: string[];
}

export function draftFrom(mm: MindmapJson): Draft {
  return {
    center: mm.center,
    nodes: mm.nodes.map((n) => ({ ...n })),
    required: [...(mm.required_nodes ?? [])],
    optional: [...(mm.optional_nodes ?? [])],
  };
}

/** Garde d'intégrité client avant `PUT` : `null` si l'arbre est valide, sinon le message d'erreur. */
export function validateDraft(draft: Draft): string | null {
  if (!draft.center.trim()) return "L'idée centrale est obligatoire.";
  if (draft.nodes.length === 0) return "Ajoute au moins une branche.";
  if (draft.nodes.some((n) => !n.label.trim())) return "Chaque nœud doit avoir un libellé.";
  const ids = new Set(draft.nodes.map((n) => n.id));
  if (draft.nodes.some((n) => n.parent !== null && !ids.has(n.parent)))
    return "Un nœud pointe vers un parent qui n'existe plus.";
  return null;
}

/** Brouillon → `mindmap_json` prêt pour le `PUT` (libellés trimés, rôles filtrés sur les ids vivants). */
export function draftToJson(draft: Draft): MindmapJson {
  const nodes = draft.nodes.map((n) => ({ ...n, label: n.label.trim() }));
  const ids = new Set(nodes.map((n) => n.id));
  const payload: MindmapJson = {
    center: draft.center.trim(),
    nodes,
    required_nodes: draft.required.filter((x) => ids.has(x)),
    optional_nodes: draft.optional.filter((x) => ids.has(x)),
  };
  if (payload.required_nodes?.length === 0) delete payload.required_nodes;
  if (payload.optional_nodes?.length === 0) delete payload.optional_nodes;
  return payload;
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

/** Frère précédent d'un nœud dans sa fratrie (`null` si premier) — cible du re-parentage par `⇥`. */
function previousSibling(nodes: MindmapNode[], node: MindmapNode): MindmapNode | null {
  const siblings = childrenOf(nodes, node.parent);
  const i = siblings.findIndex((n) => n.id === node.id);
  return i > 0 ? siblings[i - 1] : null;
}

export function MindmapOutlineEditor({
  draft,
  onDraftChange,
  error,
}: {
  draft: Draft;
  onDraftChange: (next: Draft) => void;
  error?: string | null;
}) {
  const [confirmDelete, setConfirmDelete] = useState<MindmapNode | null>(null);

  const update = useCallback(
    (fn: (d: Draft) => Draft) => onDraftChange(fn(draft)),
    [draft, onDraftChange],
  );

  const roleOf = (id: string): Role =>
    draft.required.includes(id) ? "req" : draft.optional.includes(id) ? "opt" : "none";

  // ── Mutations d'arbre (immuables) ───────────────────────────────────────
  const setLabel = (id: string, label: string) =>
    update((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, label } : n)) }));

  const move = (id: string, parent: string | null) =>
    update((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, parent } : n)) }));

  const addChild = (parent: string | null) =>
    update((d) => {
      if (d.nodes.length >= MAX_NODES) return d;
      return { ...d, nodes: [...d.nodes, { id: freshId(d.nodes), label: "", parent }] };
    });

  const removeSubtree = (id: string) =>
    update((d) => {
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
    update((d) => ({
      ...d,
      required:
        role === "req" ? [...new Set([...d.required, id])] : d.required.filter((x) => x !== id),
      optional:
        role === "opt" ? [...new Set([...d.optional, id])] : d.optional.filter((x) => x !== id),
    }));

  const requestDelete = (node: MindmapNode) => {
    if (childrenOf(draft.nodes, node.id).length > 0) setConfirmDelete(node);
    else removeSubtree(node.id);
  };

  /**
   * Raccourcis d'outline (§D), posés sur le champ de libellé :
   * `⇥` descend le nœud sous son frère précédent · `⇧⇥` le remonte d'un niveau ·
   * `⏎` insère un frère · `⌫` sur un champ vide supprime la branche.
   * Le `<select>` « ↳ sous : » reste disponible (souris + lecteurs d'écran).
   */
  const onKey = (node: MindmapNode, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (node.parent === null) return; // déjà à la racine
        const parent = draft.nodes.find((n) => n.id === node.parent);
        move(node.id, parent?.parent ?? null);
      } else {
        const prev = previousSibling(draft.nodes, node);
        if (prev) move(node.id, prev.id);
      }
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      addChild(node.parent);
      return;
    }
    if (e.key === "Backspace" && node.label === "") {
      e.preventDefault();
      requestDelete(node);
    }
  };

  return (
    <div className="space-y-4">
      <label className="block text-sm">
        <span className="text-papa-muted">◎ Idée centrale</span>
        <Input
          className="mt-1"
          value={draft.center}
          maxLength={MAX_CENTER}
          placeholder="L'idée au cœur de la carte"
          onChange={(e) => update((d) => ({ ...d, center: e.target.value }))}
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
          onKey={onKey}
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
        <kbd className="rounded bg-papa-surface-2 px-1">⇥</kbd> /{" "}
        <kbd className="rounded bg-papa-surface-2 px-1">⇧⇥</kbd> déplacer ·{" "}
        <kbd className="rounded bg-papa-surface-2 px-1">⏎</kbd> frère ·{" "}
        <kbd className="rounded bg-papa-surface-2 px-1">⌫</kbd> supprimer (champ vide)
      </p>

      <p className="text-xs text-papa-muted">
        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-emerald-300">Clé</span> = à
        retenir absolument (compte dans le score) ·{" "}
        <span className="rounded bg-cyan-500/15 px-1.5 py-0.5 text-cyan-300">Option</span> = détail
        facultatif. Sans marquage, tous les nœuds comptent.
      </p>

      {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-300">{error}</p>}

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
  onKey,
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
  onKey: (node: MindmapNode, e: React.KeyboardEvent<HTMLInputElement>) => void;
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
            onKey={onKey}
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
            onKey={onKey}
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
  onKey,
}: {
  node: MindmapNode;
  nodes: MindmapNode[];
  role: Role;
  onLabel: (id: string, label: string) => void;
  onMove: (id: string, parent: string | null) => void;
  onAddChild: (parent: string | null) => void;
  onDelete: (node: MindmapNode) => void;
  onRole: (id: string, role: Role) => void;
  onKey: (node: MindmapNode, e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  // Parents valides : le centre + tout nœud qui n'est ni ce nœud ni un de ses descendants.
  // C'est CETTE exclusion qui rend les cycles impossibles par construction.
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
          onKeyDown={(e) => onKey(node, e)}
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
