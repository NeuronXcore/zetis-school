import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  ReactFlowProvider,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type MindmapAttemptResult, type MindmapJson } from "@zetis/types";
import { MindmapNode, type MindmapNodeData, type MindmapNodeState } from "./MindmapNode";
import { LayoutSelector } from "./LayoutSelector";
import { ModeSegmented, type MindmapMode } from "./ModeSegmented";
import { NodeBank, type BankChip } from "./NodeBank";
import { CENTER_ID, computeLayout, type LayoutResult, type NodeBox } from "../../lib/mindmapLayout";
import {
  childrenOf,
  defaultLayout,
  nodeLevels,
  parentOf,
  placementsPayload,
  randomPasses,
  rootsOf,
  shuffle,
  type LayoutKind,
} from "../../lib/mindmapTree";
import { submitMindmapAttempt } from "../../lib/mindmaps";

// Espace de travail d'UNE carte (écran 3). Détient tout l'état d'interaction (présentation, mode,
// dépli, révélation, reconstruction) et rend React Flow. Le layout est calculé côté client (elk,
// asynchrone) ; la reconstruction est **évaluée par le serveur** (aucun score ici).
//
// Reconstruire = GLISSER-DÉPOSER (pointeur → mouse ET touch) : on tire une étiquette de la banque
// sur un emplacement. Le drag démarre sur une puce (hors canvas) → il n'entre pas en conflit avec
// le pan de React Flow (qui ne démarre que sur un pointerdown DANS le canvas).

const nodeTypes = { mm: MindmapNode };

const HINTS: Record<MindmapMode, string> = {
  view: "Déplace un nœud pour ré-agencer la carte · glisse le fond pour te déplacer · molette pour zoomer · clique une branche pour la replier/déplier.",
  train: "Niveau par niveau, clique chaque « · · · » pour révéler et tester ta mémoire.",
  build:
    "Glisse chaque étiquette sur son emplacement — ZETIS vérifie tout seul quand c'est complet. Un emplacement rempli : clique-le pour renvoyer l'étiquette.",
};

export function MindmapWorkspace({
  mm,
  mindmapId,
  mode,
  onModeChange,
  accent = "#22d3ee",
  onComplete,
  storageScope = "",
}: {
  mm: MindmapJson;
  mindmapId: number;
  // Mode CONTRÔLÉ par la page (MindmapSubjectPage) : elle en a besoin pour piloter le panneau
  // « fiche » (visible en Regarde/Mémorise, masqué en Reconstruire). Contrat inchangé par ailleurs.
  mode: MindmapMode;
  onModeChange: (m: MindmapMode) => void;
  accent?: string;
  // Mission : notifie la complétion d'une reconstruction (la modale pilote alors le verdict). Si
  // fourni, le popup de réussite interne est masqué (le verdict de mission devient la récompense).
  onComplete?: (result: MindmapAttemptResult) => void;
  // Isole les positions localStorage entre la page pleine et la modale de mission (défaut "" =
  // clé historique préservée pour la route pleine page).
  storageScope?: string;
}) {
  const [kind, setKind] = useState<LayoutKind>(() => defaultLayout(mm));
  const setMode = onModeChange;
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [layoutError, setLayoutError] = useState(false);

  // État par mode.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [assignment, setAssignment] = useState<Record<string, string>>({});
  const [bankOrder, setBankOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Reconstruction (mode build) = SÉANCE : chaque dépôt est validé INSTANTANÉMENT (côté client, par
  // rapport à l'arbre) → un mauvais dépôt est refusé (revert) + popup d'erreur immédiat.
  // `failedAttempts` compte les mauvais dépôts (réduit l'XP) ; `errorOpen` affiche le popup d'erreur ;
  // `success` (posé quand la carte est complète et juste) affiche le popup final avec l'XP serveur.
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [errorOpen, setErrorOpen] = useState(false);
  const [success, setSuccess] = useState<MindmapAttemptResult | null>(null);
  // Félicitation ÉPHÉMÈRE à chaque bon placement : `n` change à chaque fois → relance l'animation ;
  // effacée après ~1,1 s. Le timer est nettoyé au démontage / à la relance.
  const [cheer, setCheer] = useState<{ n: number; msg: string } | null>(null);
  const cheerTimer = useRef<number | null>(null);
  // Reconstruction en PASSES aléatoires : chaque passe blanchit un petit sous-ensemble (le reste de
  // la carte reste visible = contexte). Partition tirée au hasard à chaque séance ; nb de passes
  // adapté au nombre de nœuds. `buildPasses` = ids par passe ; `buildPass` = passe courante.
  const [buildPasses, setBuildPasses] = useState<string[][]>([]);
  const [buildPass, setBuildPass] = useState(0);

  // Mode « Mémorise » (train) en plusieurs PASSES : une passe par niveau de la hiérarchie (couvre
  // tous les nœuds). `pass` = index de la passe courante ; `memorizeDone` déclenche le popup final.
  const levels = useMemo(() => nodeLevels(mm), [mm]);
  const levelIndex = useMemo(() => {
    const m = new Map<string, number>();
    levels.forEach((ids, i) => ids.forEach((id) => m.set(id, i)));
    return m;
  }, [levels]);
  const [pass, setPass] = useState(0);
  const [memorizeDone, setMemorizeDone] = useState(false);

  // Glisser-déposer (mode build) : puce en cours de drag (position pour le fantôme) + emplacement
  // survolé. Le nœud tiré vit dans un ref (les écouteurs window n'ont pas besoin de re-souscrire à
  // chaque déplacement).
  const dragNodeRef = useRef<string | null>(null);
  const [drag, setDrag] = useState<{ label: string; x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const isDragging = drag !== null;

  const allNodeIds = useMemo(() => mm.nodes.map((n) => n.id), [mm]);
  // Sous-ensemble blanchi de la passe courante = les emplacements à remplir MAINTENANT (le reste de
  // la carte est montré comme contexte). Un nœud déjà placé n'est plus un emplacement.
  // useMemo : garder une référence STABLE (sinon `?? []` recrée un tableau à chaque render → boucle).
  const currentChunk = useMemo(() => buildPasses[buildPass] ?? [], [buildPasses, buildPass]);
  const currentSlotSet = useMemo(
    () => new Set(currentChunk.filter((id) => !assignment[id])),
    [currentChunk, assignment],
  );

  // Calcul du layout (asynchrone) à chaque changement de carte ou de présentation.
  useEffect(() => {
    let alive = true;
    setLayout(null);
    setLayoutError(false);
    computeLayout(mm, kind)
      .then((res) => alive && setLayout(res))
      .catch(() => alive && setLayoutError(true));
    return () => {
      alive = false;
    };
  }, [mm, kind]);

  // Réinitialise l'état d'interaction à chaque changement de mode.
  const resetForMode = useCallback(
    (m: MindmapMode) => {
      setExpanded(new Set(mm.nodes.filter((n) => childrenOf(mm, n.id).length > 0).map((n) => n.id)));
      setRevealed(new Set());
      setAssignment({});
      setFailedAttempts(0);
      setErrorOpen(false);
      setSuccess(null);
      setPass(0);
      setMemorizeDone(false);
      if (m === "build") {
        const passes = randomPasses(allNodeIds); // partition ALÉATOIRE (nouvelle à chaque séance)
        setBuildPasses(passes);
        setBuildPass(0);
        setBankOrder(shuffle(passes[0] ?? []));
      }
    },
    [mm, allNodeIds],
  );
  useEffect(() => resetForMode(mode), [mode, resetForMode]);

  const isVisible = useCallback(
    (id: string): boolean => {
      if (mode !== "view") return true;
      let p = parentOf(mm, id);
      while (p !== null) {
        if (!expanded.has(p)) return false;
        p = parentOf(mm, p);
      }
      return true;
    },
    [mm, mode, expanded],
  );

  const usedIds = useMemo(() => new Set(Object.values(assignment)), [assignment]);

  // Interactions ------------------------------------------------------------
  const toggleBranch = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  // Dépose l'étiquette `chipNodeId` sur l'emplacement `slotId`, avec VALIDATION INSTANTANÉE :
  // un emplacement attend le nœud de sa propre position (`slotId`). Bon dépôt → posé ; mauvais →
  // REFUSÉ (l'étiquette revient à la banque) + popup d'erreur immédiat + compte un échec.
  // La reconstruction n'accumule donc que des placements justes ; l'XP final reste calculé serveur.
  const cheerNow = useCallback(() => {
    const MSGS = ["Bravo ! 🎉", "Bien joué ! ✨", "Parfait ! 🌟", "Excellent ! 💫", "Super ! 🏆", "Trop fort ! 🚀"];
    const msg = MSGS[Math.floor(Math.random() * MSGS.length)];
    setCheer((c) => ({ n: (c?.n ?? 0) + 1, msg }));
    if (cheerTimer.current) window.clearTimeout(cheerTimer.current);
    cheerTimer.current = window.setTimeout(() => setCheer(null), 1100);
  }, []);
  useEffect(() => () => void (cheerTimer.current && window.clearTimeout(cheerTimer.current)), []);

  const dropAt = useCallback(
    (slotId: string, chipNodeId: string) => {
      if (success) return;
      if (chipNodeId !== slotId) {
        setFailedAttempts((f) => f + 1);
        setErrorOpen(true);
        return; // revert : ne pas placer l'étiquette
      }
      setAssignment((prev) => ({ ...prev, [slotId]: chipNodeId }));
      cheerNow(); // bon placement → nœud doré (nodeStateFor) + félicitation éphémère
    },
    [success, cheerNow],
  );

  // Emplacement (nœud blanchi de la passe courante) sous un point écran, ou null. Drop + survol.
  const slotUnderPoint = useCallback(
    (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y);
      const node = el?.closest?.(".react-flow__node") as HTMLElement | null;
      const id = node?.getAttribute("data-id");
      return id && currentSlotSet.has(id) ? id : null;
    },
    [currentSlotSet],
  );

  const startDrag = useCallback(
    (nodeId: string, label: string, e: ReactPointerEvent) => {
      if (success) return;
      e.preventDefault();
      dragNodeRef.current = nodeId;
      setDrag({ label, x: e.clientX, y: e.clientY });
    },
    [success],
  );

  // Écouteurs globaux pendant un drag (souscrits une fois par drag, pas à chaque déplacement).
  useEffect(() => {
    if (!isDragging) return;
    const move = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY } : d));
      setDropTarget(slotUnderPoint(e.clientX, e.clientY));
    };
    const up = (e: PointerEvent) => {
      const target = slotUnderPoint(e.clientX, e.clientY);
      if (target && dragNodeRef.current) dropAt(target, dragNodeRef.current);
      dragNodeRef.current = null;
      setDrag(null);
      setDropTarget(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [isDragging, slotUnderPoint, dropAt]);

  const nodeStateFor = useCallback(
    (id: string): MindmapNodeState => {
      if (mode === "view") return "node";
      if (mode === "train") {
        // Une seule passe (un niveau) masquée à la fois : les autres niveaux restent visibles.
        if (levelIndex.get(id) !== pass) return "node";
        return revealed.has(id) ? "revealed" : "masked";
      }
      // build : une étiquette bien placée par Massimo devient DORÉE (récompense qui persiste au fil
      // des passes). Les nœuds blanchis restants sont des emplacements ; le reste = CONTEXTE (label).
      if (assignment[id]) return "correct";
      if (!currentSlotSet.has(id)) return "node";
      return isDragging && dropTarget === id ? "target" : "slot";
    },
    [mode, assignment, currentSlotSet, levelIndex, pass, revealed, isDragging, dropTarget],
  );

  const labelFor = useCallback(
    (id: string): string => {
      const node = mm.nodes.find((n) => n.id === id);
      if (!node) return "";
      // En reconstruction, un emplacement rempli affiche l'étiquette déposée.
      const labelId = mode === "build" ? assignment[id] : id;
      return mm.nodes.find((n) => n.id === labelId)?.label ?? node.label;
    },
    [mm, mode, assignment],
  );

  // Construction des nœuds / arêtes React Flow depuis le layout + l'état. ----
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // Positions « vivantes » = celles réellement affichées (elk au départ, puis déplacées à la souris
  // par Massimo). Elles servent au ré-agencement ET au recalcul du côté de sortie des arêtes (pour
  // que les liens orthogonaux se ré-routent quand on bouge un nœud → moins d'intersections).
  // PERSISTÉES par carte + présentation (localStorage) → la disposition est rechargée à la réouverture
  // (présentation = client, ADR-0016). Un ref double l'état pour lire la dernière valeur au drag-stop.
  const [livePos, setLivePos] = useState<Record<string, XY>>({});
  const livePosRef = useRef<Record<string, XY>>({});

  useEffect(() => {
    const saved = loadArrangement(mindmapId, kind, storageScope);
    livePosRef.current = saved;
    setLivePos(saved);
  }, [mindmapId, kind, storageScope]);

  // Répercute les déplacements de nœuds (React Flow) dans `livePos` — sans casser le drag natif.
  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      onNodesChange(changes);
      let touched = false;
      const next = { ...livePosRef.current };
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          next[c.id] = c.position;
          touched = true;
        }
      }
      if (touched) {
        livePosRef.current = next;
        setLivePos(next);
      }
    },
    [onNodesChange],
  );

  // Persiste la disposition au relâchement d'un nœud (fin de déplacement).
  const persistArrangement = useCallback(() => {
    saveArrangement(mindmapId, kind, livePosRef.current, storageScope);
  }, [mindmapId, kind, storageScope]);

  // Réinitialise la disposition à celle calculée par elk (oublie les déplacements mémorisés).
  const resetArrangement = useCallback(() => {
    clearArrangement(mindmapId, kind, storageScope);
    livePosRef.current = {};
    setLivePos({});
    setRfNodes((prev) =>
      prev.map((n) => {
        const b = layout?.[n.id];
        return b ? { ...n, position: { x: b.x, y: b.y } } : n;
      }),
    );
  }, [mindmapId, kind, layout, setRfNodes, storageScope]);
  const hasArrangement = Object.keys(livePos).length > 0;

  // Centre d'un nœud selon sa position VIVE (livePos sinon elk) — pour router les arêtes.
  const boxAt = useCallback(
    (id: string): NodeBox | undefined => {
      const b = layout?.[id];
      if (!b) return undefined;
      const lp = livePos[id];
      return lp ? { ...b, x: lp.x, y: lp.y } : b;
    },
    [layout, livePos],
  );

  const derivedNodes = useMemo(() => {
    if (!layout) return [] as Node[];
    const nodes: Node[] = [];
    const pos = (id: string) => {
      const b = layout[id];
      const lp = livePos[id];
      return { x: lp?.x ?? b.x, y: lp?.y ?? b.y };
    };
    // Centroïde (boîte fictive) des enfants d'un nœud → côté de sortie des arêtes.
    const childrenCentroid = (id: string): NodeBox | undefined => {
      const kids = childrenOf(mm, id)
        .map((k) => boxAt(k.id))
        .filter((b): b is NodeBox => Boolean(b));
      if (kids.length === 0) return undefined;
      const cx = kids.reduce((s, b) => s + b.x + b.width / 2, 0) / kids.length;
      const cy = kids.reduce((s, b) => s + b.y + b.height / 2, 0) / kids.length;
      return { x: cx, y: cy, width: 0, height: 0 };
    };
    // Côtés d'ancrage : cible = vers le parent, source = vers le centroïde des enfants.
    const sides = (id: string, parentId: string) => {
      const self = boxAt(id);
      const parent = boxAt(parentId);
      const targetPos = self && parent ? sideTo(self, parent) : Position.Left;
      const centroid = childrenCentroid(id);
      const sourcePos = self && centroid ? sideTo(self, centroid) : opposite(targetPos);
      return { sourcePos, targetPos };
    };

    if (layout[CENTER_ID]) {
      const centroid = childrenCentroid(CENTER_ID);
      const selfC = boxAt(CENTER_ID);
      const sourcePos = selfC && centroid ? sideTo(selfC, centroid) : Position.Right;
      nodes.push({
        id: CENTER_ID,
        type: "mm",
        position: pos(CENTER_ID),
        data: { label: mm.center, state: "center", sourcePos, targetPos: opposite(sourcePos) },
        draggable: true,
        selectable: false,
      });
    }
    for (const n of mm.nodes) {
      if (!layout[n.id] || !isVisible(n.id)) continue;
      const isBranch = childrenOf(mm, n.id).length > 0;
      const state = nodeStateFor(n.id);
      let onClick: (() => void) | undefined;
      if (mode === "view" && isBranch) onClick = () => toggleBranch(n.id);
      else if (mode === "train" && levelIndex.get(n.id) === pass && !revealed.has(n.id))
        onClick = () => setRevealed((p) => new Set(p).add(n.id));
      // build : les dépôts sont validés à la volée (drag) ; un nœud placé reste (contexte), pas de clic.
      const { sourcePos, targetPos } = sides(n.id, n.parent ?? CENTER_ID);
      nodes.push({
        id: n.id,
        type: "mm",
        position: pos(n.id),
        data: { label: labelFor(n.id), state, onClick, clickable: Boolean(onClick), sourcePos, targetPos },
        draggable: true,
        selectable: false,
      });
    }
    return nodes;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, livePos, mm, mode, expanded, revealed, assignment, success, isDragging, dropTarget, boxAt, pass, levelIndex, currentSlotSet, buildPass]);

  const derivedEdges = useMemo(() => {
    if (!layout) return [] as Edge[];
    const visibleNode = (id: string) => id === CENTER_ID || (Boolean(layout[id]) && isVisible(id));
    const edges: Edge[] = [];
    for (const r of rootsOf(mm)) {
      if (visibleNode(r.id)) edges.push(edge(CENTER_ID, r.id, accent));
    }
    for (const n of mm.nodes) {
      if (n.parent && visibleNode(n.parent) && visibleNode(n.id)) {
        edges.push(edge(n.parent, n.id, accent));
      }
    }
    return edges;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, mm, expanded, accent]);

  // Un seul effet : les positions viennent de `livePos` (déplacées) sinon elk, donc recréer les
  // nœuds ne perd pas l'agencement. React Flow re-mesure vite (les arêtes rendent normalement).
  useEffect(() => setRfNodes(derivedNodes), [derivedNodes, setRfNodes]);
  useEffect(() => setRfEdges(derivedEdges), [derivedEdges, setRfEdges]);

  // Passe courante terminée (tous ses nœuds blanchis placés) ; carte entière terminée.
  const chunkDone = currentChunk.length > 0 && currentChunk.every((id) => Boolean(assignment[id]));
  const allPlaced = allNodeIds.length > 0 && allNodeIds.every((id) => Boolean(assignment[id]));
  const isLastBuildPass = buildPass >= buildPasses.length - 1;

  // Passe terminée (pas la dernière) → passe suivante : on blanchit un nouveau sous-ensemble.
  useEffect(() => {
    if (mode === "build" && chunkDone && !success && !isLastBuildPass) {
      const next = buildPass + 1;
      setBuildPass(next);
      setBankOrder(shuffle(buildPasses[next] ?? []));
    }
  }, [mode, chunkDone, isLastBuildPass, buildPass, buildPasses, success]);

  // Toute la carte reconstruite → soumission AUTOMATIQUE : le SERVEUR persiste + calcule l'XP (réduit
  // par les échecs). Pas de bouton, pas de contrôle intermédiaire (déjà fait à chaque dépôt).
  const submitAttempt = useCallback(async () => {
    setBusy(true);
    try {
      const attempt = await submitMindmapAttempt(
        mindmapId,
        placementsPayload(mm, assignment),
        failedAttempts,
      );
      setSuccess(attempt);
      onComplete?.(attempt); // mission : valide l'étape + affiche le verdict (popup interne masqué)
    } catch {
      // silencieux : l'élève peut réessayer (aucune donnée corrompue côté client)
    } finally {
      setBusy(false);
    }
  }, [mindmapId, mm, assignment, failedAttempts, onComplete]);

  useEffect(() => {
    if (mode === "build" && allPlaced && !busy && !success) submitAttempt();
  }, [mode, allPlaced, busy, success, submitAttempt]);

  // « Recommencer » (banque) : NOUVELLE séance — partition aléatoire fraîche + tout à zéro.
  const resetBuild = useCallback(() => {
    setAssignment({});
    setErrorOpen(false);
    setSuccess(null);
    setFailedAttempts(0);
    const passes = randomPasses(allNodeIds);
    setBuildPasses(passes);
    setBuildPass(0);
    setBankOrder(shuffle(passes[0] ?? []));
  }, [allNodeIds]);

  const chips: BankChip[] = useMemo(
    () => bankOrder.map((id) => ({ nodeId: id, label: mm.nodes.find((n) => n.id === id)?.label ?? "" })),
    [bankOrder, mm],
  );

  // Progression des passes (mode « Mémorise »).
  const currentLevelIds = levels[pass] ?? [];
  const revealedInLevel = currentLevelIds.filter((id) => revealed.has(id)).length;
  const passComplete = currentLevelIds.length > 0 && revealedInLevel === currentLevelIds.length;
  const isLastPass = pass >= levels.length - 1;
  const advancePass = useCallback(() => {
    if (!isLastPass) {
      setPass((p) => p + 1);
      setRevealed(new Set());
    } else {
      setMemorizeDone(true);
    }
  }, [isLastPass]);
  const restartMemorize = useCallback(() => {
    setPass(0);
    setRevealed(new Set());
    setMemorizeDone(false);
  }, []);

  // Statuts des pastilles de progression (une par passe) pour chaque mode.
  const trainStatuses: PassStatus[] = levels.map((_, i) =>
    i < pass ? "done" : i === pass ? (passComplete ? "done" : "active") : "todo",
  );
  const buildStatuses: PassStatus[] = buildPasses.map((ids, i) =>
    ids.length > 0 && ids.every((id) => Boolean(assignment[id]))
      ? "done"
      : i === buildPass
        ? "active"
        : "todo",
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <ModeSegmented value={mode} onChange={setMode} />
        <div className="ml-auto flex items-center gap-2">
          {hasArrangement && (
            <button
              type="button"
              onClick={resetArrangement}
              title="Revenir à la disposition automatique"
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-slate-300 hover:border-white/25 hover:text-slate-100"
            >
              ↺ Disposition
            </button>
          )}
          <LayoutSelector value={kind} onChange={setKind} />
        </div>
      </div>

      {mode === "train" ? (
        <div className="mb-2 flex min-h-[28px] flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-slate-400">{HINTS.train}</span>
          {levels.length > 0 && <PassDots statuses={trainStatuses} accent="cyan" />}
          {passComplete && !memorizeDone && (
            <button
              type="button"
              onClick={advancePass}
              className="rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 px-3 py-1 text-xs font-bold text-white"
            >
              {isLastPass ? "J'ai tout mémorisé 🎉" : "Passe suivante ▸"}
            </button>
          )}
        </div>
      ) : mode === "build" ? (
        <div className="mb-2 flex min-h-[28px] flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-slate-400">
            Replace les étiquettes blanchies — le reste de la carte t'aide.
          </span>
          {buildPasses.length > 0 && <PassDots statuses={buildStatuses} accent="amber" />}
        </div>
      ) : (
        <p className="mb-2 min-h-[20px] text-sm text-slate-400">{HINTS[mode]}</p>
      )}

      <div
        className="relative overflow-hidden rounded-2xl border border-white/10"
        // Grande zone d'affichage (s'adapte à la hauteur de l'écran) pour bien voir la carte ;
        // `fitView` recalera le graphe dedans → nœuds plus lisibles. Bornée pour rester raisonnable.
        style={{
          height: "clamp(520px, 74vh, 840px)",
          background: "radial-gradient(circle at 50% 45%, rgba(99,102,241,.10), transparent 60%)",
        }}
      >
        {layoutError ? (
          <p className="grid h-full place-items-center text-sm text-amber-300">
            Mise en page impossible pour cette carte.
          </p>
        ) : !layout ? (
          <p className="grid h-full place-items-center text-sm text-slate-400">Mise en page…</p>
        ) : (
          <ReactFlowProvider>
            <ReactFlow
              key={kind}
              nodes={rfNodes}
              edges={rfEdges}
              // Déplacement des nœuds à la souris (ré-agencer la carte, éviter les croisements) :
              // `handleNodesChange` répercute la position dans `livePos` → les arêtes se ré-routent.
              onNodesChange={handleNodesChange}
              onNodeDragStop={persistArrangement}
              onEdgesChange={onEdgesChange}
              // Les clics de nœud passent par RF (sinon un onClick sur le nœud ne partirait jamais).
              onNodeClick={(_, node) => (node.data as MindmapNodeData).onClick?.()}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.3}
              maxZoom={1.8}
              nodesDraggable
              nodesConnectable={false}
              elementsSelectable={false}
              proOptions={{ hideAttribution: true }}
            >
              <Background color="rgba(255,255,255,0.06)" gap={26} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        )}

        {/* Félicitation ÉPHÉMÈRE (Reconstruire) : toast doré non bloquant à chaque bon placement.
            `key={cheer.n}` remonte l'élément → l'animation repart même sur deux bons dépôts d'affilée. */}
        {mode === "build" && cheer && (
          <div
            key={cheer.n}
            className="pointer-events-none absolute inset-0 z-40 grid place-items-center motion-safe:animate-[mm-cheer_1.1s_ease-out_forwards]"
          >
            <span className="rounded-3xl border border-amber-300/60 bg-slate-900/90 px-8 py-5 text-3xl font-extrabold text-amber-200 shadow-[0_8px_40px_rgba(251,191,36,0.6)] sm:text-4xl">
              {cheer.msg}
            </span>
          </div>
        )}

        {/* Popup de fin de mémorisation : ZETIS invite à reconstruire pour gagner des XP. */}
        {mode === "train" && memorizeDone && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-w-sm rounded-2xl border border-amber-300/40 bg-slate-900/95 p-6 text-center shadow-2xl">
              <p className="text-4xl">🎉</p>
              <p className="mt-2 text-lg font-bold text-slate-100">Tu as parcouru toute la carte !</p>
              <p className="mt-1 text-sm text-slate-300">
                Reconstruis-la de mémoire pour gagner des XP 🏆
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("build")}
                  className="rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 px-4 py-2 text-sm font-bold text-white shadow-[0_4px_16px_rgba(245,158,11,.5)]"
                >
                  🧩 Reconstruire
                </button>
                <button
                  type="button"
                  onClick={restartMemorize}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 hover:border-white/30"
                >
                  ↺ Recommencer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popup d'ERREUR INSTANTANÉ : mauvais dépôt → l'étiquette est revenue à la banque. */}
        {mode === "build" && errorOpen && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-w-sm rounded-2xl border border-rose-400/40 bg-slate-900/95 p-6 text-center shadow-2xl">
              <p className="text-4xl">🙅</p>
              <p className="mt-2 text-lg font-bold text-slate-100">Pas le bon endroit !</p>
              <p className="mt-1 text-sm text-slate-300">
                L'étiquette est revenue dans la banque. Réfléchis et replace-la au bon emplacement.
              </p>
              <p className="mt-2 text-xs text-slate-400">
                {failedAttempts} erreur{failedAttempts > 1 ? "s" : ""} — chaque erreur réduit un peu
                les XP.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setErrorOpen(false)}
                  className="rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 px-4 py-2 text-sm font-bold text-white"
                >
                  Je réessaie
                </button>
                <button
                  type="button"
                  onClick={resetBuild}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-300 hover:border-white/30"
                >
                  ↺ Tout recommencer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Popup de RÉUSSITE : XP gagnés (réduits par les échecs) + nombre de tentatives. Masqué en
            mission (`onComplete` fourni) : c'est le verdict de mission qui récompense. */}
        {mode === "build" && success && !onComplete && (
          <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm">
            <div className="max-w-sm rounded-2xl border border-emerald-400/40 bg-slate-900/95 p-6 text-center shadow-2xl">
              <p className="text-4xl">🎉</p>
              <p className="mt-2 text-lg font-bold text-slate-100">Carte reconstruite !</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-300">
                +{success.xp_awarded} XP 🏆
              </p>
              <p className="mt-1 text-sm text-slate-300">
                Réussie en {failedAttempts + 1} tentative{failedAttempts > 0 ? "s" : ""}
                {failedAttempts > 0
                  ? ` (${failedAttempts} erreur${failedAttempts > 1 ? "s" : ""})`
                  : " du premier coup !"}
              </p>
              <div className="mt-4 flex justify-center">
                <button
                  type="button"
                  onClick={resetBuild}
                  className="rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 px-4 py-2 text-sm font-bold text-white"
                >
                  ↺ Rejouer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {mode === "build" && (
        <NodeBank
          chips={chips}
          usedIds={usedIds}
          onDragChip={startDrag}
          onReset={resetBuild}
          busy={busy}
          failedAttempts={failedAttempts}
        />
      )}

      {/* Fantôme de l'étiquette tirée (suit le pointeur ; pointer-events:none pour ne pas gêner
          elementFromPoint lors du drop). */}
      {drag && (
        <div
          style={{
            position: "fixed",
            left: drag.x,
            top: drag.y,
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 50,
          }}
          className="rounded-full border border-cyan-300/70 bg-cyan-500/25 px-3 py-1.5 text-sm font-medium text-cyan-50 shadow-lg"
        >
          {drag.label}
        </div>
      )}
    </div>
  );
}

// Points de progression des PASSES : une pastille par passe. « done » = passe réussie (pleine,
// accent), « active » = passe en cours (respire), « todo » = à venir (creuse). Le changement de
// statut est animé (transition douce) → Massimo voit chaque passe se valider.
type PassStatus = "done" | "active" | "todo";

function PassDots({ statuses, accent }: { statuses: PassStatus[]; accent: "cyan" | "amber" }) {
  const doneCls = accent === "amber" ? "border-amber-300 bg-amber-400" : "border-cyan-300 bg-cyan-400";
  const activeCls =
    accent === "amber"
      ? "border-amber-300 bg-amber-400/30 text-amber-400"
      : "border-cyan-300 bg-cyan-400/30 text-cyan-400";
  const doneCount = statuses.filter((s) => s === "done").length;
  return (
    <span
      className="inline-flex items-center gap-1.5"
      role="progressbar"
      aria-label="Progression des passes"
      aria-valuemin={0}
      aria-valuemax={statuses.length}
      aria-valuenow={doneCount}
    >
      {statuses.map((s, i) => (
        <span
          key={i}
          className={`h-3 w-3 rounded-full border transition-all duration-300 ${
            s === "done"
              ? doneCls
              : s === "active"
                ? `${activeCls} motion-safe:animate-[mm-dot-active_1.1s_ease-in-out_infinite]`
                : "border-white/20 bg-white/5"
          }`}
        />
      ))}
    </span>
  );
}

// Côté (Position) de `from` qui fait face à `to` — axe dominant (horizontal si |dx| ≥ |dy|).
function sideTo(from: NodeBox, to: NodeBox): Position {
  const dx = to.x + to.width / 2 - (from.x + from.width / 2);
  const dy = to.y + to.height / 2 - (from.y + from.height / 2);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? Position.Right : Position.Left;
  return dy >= 0 ? Position.Bottom : Position.Top;
}

function opposite(p: Position): Position {
  return p === Position.Left
    ? Position.Right
    : p === Position.Right
      ? Position.Left
      : p === Position.Top
        ? Position.Bottom
        : Position.Top;
}

// --- Persistance de la disposition (présentation = client, ADR-0016) -------------------------
// Positions déplacées à la souris par Massimo, mémorisées par carte + présentation dans le
// localStorage. Ce n'est PAS une donnée pédagogique (aucun score/progression) : la règle
// « pas de donnée pédagogique durable côté front » n'est pas concernée. Device-local (pas de sync
// multi-appareils — une synchro serveur serait un follow-up).
type XY = { x: number; y: number };

function arrangementKey(mindmapId: number, kind: LayoutKind, scope: string): string {
  return `zetis:mm:${mindmapId}:${kind}${scope ? `:${scope}` : ""}:pos`;
}

function loadArrangement(mindmapId: number, kind: LayoutKind, scope: string): Record<string, XY> {
  try {
    const raw = localStorage.getItem(arrangementKey(mindmapId, kind, scope));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, XY>) : {};
  } catch {
    return {};
  }
}

function saveArrangement(
  mindmapId: number,
  kind: LayoutKind,
  pos: Record<string, XY>,
  scope: string,
): void {
  try {
    localStorage.setItem(arrangementKey(mindmapId, kind, scope), JSON.stringify(pos));
  } catch {
    // quota atteint / stockage indisponible (navigation privée) : on ignore silencieusement.
  }
}

function clearArrangement(mindmapId: number, kind: LayoutKind, scope: string): void {
  try {
    localStorage.removeItem(arrangementKey(mindmapId, kind, scope));
  } catch {
    // silencieux
  }
}

function edge(source: string, target: string, accent: string): Edge {
  // Angles droits arrondis (org-chart / mindmap). Le routage suit les handles source/cible du nœud
  // (positionnés par côté dans MindmapNode) → propre dans toutes les présentations et après un
  // déplacement. `pathOptions` (borderRadius) est propre au type smoothstep → cast.
  return {
    id: `${source}->${target}`,
    source,
    target,
    type: "smoothstep",
    pathOptions: { borderRadius: 10 },
    style: { stroke: accent, strokeWidth: 1.8, opacity: 0.45 },
  } as Edge;
}
