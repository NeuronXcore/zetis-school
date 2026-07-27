// Brique de canvas mindmap partagée (@zetis/ui/mindmap, addendum ADR-0016 §A) — UN SEUL renderer
// pour Massimo (page /mindmaps, étape de mission) et pour l'aperçu de fidélité Papa.
//
// EXPORT EN SOUS-CHEMIN VOLONTAIRE : cette brique embarque React Flow + elkjs. Elle n'est PAS
// ré-exportée depuis `@zetis/ui` (racine), sinon ces deux libs entreraient dans le bundle de toutes
// les pages qui importent le design system. Papa la charge en `import()` paresseux à l'ouverture de
// la modale d'aperçu.
//
// Contrat : zéro fetch (le `mindmap_json` descend en prop, le gate `validated` reste dans la
// requête serveur de l'appelant), zéro logique métier (le score vient du serveur via `evaluator`).
export {
  MindmapWorkspace,
  type MindmapEvaluator,
} from "./MindmapWorkspace";
export { ModeSegmented, type MindmapMode } from "./ModeSegmented";
export { LayoutSelector } from "./LayoutSelector";
export { NodeBank, type BankChip } from "./NodeBank";
export { MindmapNode, type MindmapNodeData, type MindmapNodeState } from "./MindmapNode";
export {
  CENTER_ID,
  computeLayout,
  type LayoutResult,
  type NodeBox,
} from "./mindmapLayout";
export {
  childrenOf,
  defaultLayout,
  hiddenNodeIds,
  isLeaf,
  leafCount,
  maxDepth,
  nodeLevels,
  parentOf,
  placementsPayload,
  randomPasses,
  rootsOf,
  shuffle,
  type LayoutKind,
} from "./mindmapTree";
