import { Handle, Position, type NodeProps } from "@xyflow/react";

// Nœud custom React Flow (verre / néon, identité ZETIS). Purement présentational : l'état visuel
// (centre, branche, feuille, masqué, emplacement juste/faux) est fourni par le workspace via
// `data`. Les handles sont invisibles — ils servent seulement d'ancrage aux arêtes.

export type MindmapNodeState =
  | "center"
  | "node" // visible (mode Voir / branche ancre)
  | "masked" // M'entraîner : caché, cliquable pour révéler
  | "revealed" // M'entraîner : révélé
  | "slot" // Reconstruire : emplacement vide
  | "target" // Reconstruire : emplacement vide + une étiquette est sélectionnée (cible)
  | "filled" // Reconstruire : rempli, pas encore vérifié
  | "correct" // Reconstruire : étiquette bien placée par Massimo → DORÉ (récompense immédiate)
  | "ok" // Reconstruire : vérifié juste (réponse serveur)
  | "ko"; // Reconstruire : vérifié faux (réponse serveur)

export interface MindmapNodeData {
  label: string;
  state: MindmapNodeState;
  // Les clics sont gérés par React Flow via `onNodeClick` (le workspace appelle `onClick`) : un
  // nœud non-interactif reçoit `pointer-events: none` de RF, donc un onClick sur le div ne partirait
  // jamais. `clickable` ne sert qu'à l'affordance (curseur).
  onClick?: () => void;
  clickable?: boolean;
  // Côté d'ancrage des arêtes (calculé par le workspace selon la géométrie) : la cible entre par le
  // côté qui fait face au parent, la source sort du côté qui fait face aux enfants → arêtes
  // « smoothstep » (angles droits arrondis) propres dans toutes les présentations, y compris après
  // un déplacement à la souris.
  sourcePos?: Position;
  targetPos?: Position;
  [key: string]: unknown;
}

const STATE_CLASS: Record<MindmapNodeState, string> = {
  center:
    "bg-gradient-to-br from-indigo-500 to-cyan-400 text-white border-transparent font-bold shadow-[0_6px_26px_rgba(34,211,238,0.45)]",
  node: "bg-slate-900/90 text-slate-100 border-white/15",
  masked: "bg-white/5 text-slate-500 border-dashed border-white/25 cursor-pointer hover:border-cyan-400/50",
  revealed: "bg-cyan-500/15 text-cyan-100 border-cyan-400/40",
  slot: "bg-white/5 text-slate-500 border-dashed border-white/25",
  target: "bg-cyan-500/10 text-cyan-200 border-dashed border-cyan-300/70 cursor-pointer ring-2 ring-cyan-400/40",
  filled: "bg-slate-800/90 text-slate-100 border-cyan-300/50 cursor-pointer",
  correct:
    "bg-gradient-to-br from-amber-300 to-yellow-500 text-amber-950 border-amber-200/80 font-semibold shadow-[0_0_18px_rgba(251,191,36,0.6)] motion-safe:animate-[mm-gold-pop_0.45s_ease-out]",
  ok: "bg-emerald-500/20 text-emerald-100 border-emerald-400/60",
  ko: "bg-rose-500/20 text-rose-100 border-rose-400/60",
};

// UNE cible + UNE source (positions dynamiques fournies par le workspace), invisibles. Un seul
// handle par type se résout de façon fiable (contrairement à des handles multiples adressés par id).
const HIDDEN_HANDLE = {
  opacity: 0,
  width: 1,
  height: 1,
  minWidth: 0,
  minHeight: 0,
  border: "none",
  background: "transparent",
  pointerEvents: "none" as const,
};

export function MindmapNode({ data }: NodeProps) {
  const d = data as MindmapNodeData;
  const isCenter = d.state === "center";
  return (
    <div
      className={`select-none rounded-2xl border px-3 py-2 text-center text-sm leading-tight backdrop-blur-sm transition ${STATE_CLASS[d.state]} ${isCenter ? "text-base" : ""} ${d.clickable ? "cursor-pointer" : ""}`}
      style={{ maxWidth: 200 }}
    >
      <Handle
        type="target"
        position={d.targetPos ?? Position.Left}
        style={HIDDEN_HANDLE}
        isConnectable={false}
      />
      {d.state === "masked" ? "· · ·" : d.state === "slot" || d.state === "target" ? "…" : d.label}
      <Handle
        type="source"
        position={d.sourcePos ?? Position.Right}
        style={HIDDEN_HANDLE}
        isConnectable={false}
      />
    </div>
  );
}
