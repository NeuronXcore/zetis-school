import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";

import {
  ActivityEventIcon,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CelebrationProvider,
  CloseFullscreenButton,
  ConfirmDialog,
  ContentLifecycleActions,
  ContentStatusBadge,
  EmptyState,
  GenerationProgress,
  Input,
  Select,
  SoundToggle,
  Sparkline,
  Spinner,
  SubjectFilterChips,
  SubjectPictogram,
} from "./index";
import { GalaxyFallbackList, GalaxyLegend } from "./components/galaxy";
import { LayoutSelector, MindmapWorkspace, ModeSegmented, NodeBank } from "./components/mindmap";
import { AvatarCanvas } from "./components/avatar";

// 🔴 LE TEST QUI MANQUAIT — ADR-0053.
//
// Il ne vérifie qu'UNE chose : **chaque composant exporté se monte sans jeter.** Pas de contenu,
// pas de comportement, pas d'accessibilité. C'est délibérément grossier, et c'est le point.
//
// Le 2026-08-12, une zone morte temporelle dans `MindmapWorkspace` — un `useEffect` déclaré avant
// le `useState` qu'il lit dans ses dépendances — a rendu la mindmap **totalement inmontable**,
// écran vide. `tsc -b` était VERT (une TDZ est une erreur d'exécution) et **668 tests Massimo +
// 814 Papa étaient VERTS**, parce qu'aucun ne montait ce composant : `packages/ui` n'avait aucun
// test, et le seul qui l'approchait (`MindmapPreviewModal.test.tsx`, Papa) le **moque**.
//
// La TDZ se produit à l'évaluation du corps de la fonction composant, donc **avant** que le JSX
// soit retourné — avant que React Flow ou elk soient sollicités. **Un simple montage l'attrape.**
// Un test qui vérifierait qu'une page « affiche un titre » n'aurait rien vu.
//
// ⚠️ Ce fichier n'a de valeur que s'il ROUGIT quand on réintroduit ce défaut. Sa contre-épreuve
// est une condition de livraison de l'ADR-0053, et elle a été jouée.

/** Mindmap minimale — un centre, deux nœuds, de quoi faire tourner elk et React Flow. */
const MM = {
  center: "Racine",
  nodes: [
    { id: "a", label: "A", parent: null },
    { id: "b", label: "B", parent: "a" },
  ],
};

/** Les composants exportés, avec les props MINIMALES qui les rendent montables.
 *
 *  ⚠️ « Minimales » veut dire : ce que le type exige, rien de plus. Enrichir les props ici
 *  reviendrait à tester un scénario, et ce fichier n'en teste aucun. */
const MONTABLES: [string, ReactElement][] = [
  // — design system —
  ["Button", <Button>ok</Button>],
  ["Card", <Card>c</Card>],
  ["CardHeader", <CardHeader>h</CardHeader>],
  ["CardTitle", <CardTitle>t</CardTitle>],
  ["CardContent", <CardContent>c</CardContent>],
  ["Badge", <Badge>b</Badge>],
  ["Input", <Input />],
  ["Select", <Select />],
  ["Spinner", <Spinner />],
  ["EmptyState", <EmptyState title="rien" />],
  ["Sparkline", <Sparkline points={[1, 2, 3]} label="courbe" />],
  ["SoundToggle", <SoundToggle />],
  ["SubjectPictogram", <SubjectPictogram slug="svt" />],
  ["ActivityEventIcon", <ActivityEventIcon type="quiz" />],
  ["CloseFullscreenButton", <CloseFullscreenButton onClick={() => {}} />],
  ["CelebrationProvider", <CelebrationProvider>x</CelebrationProvider>],
  [
    "ConfirmDialog",
    <ConfirmDialog open title="t" onConfirm={() => {}} onCancel={() => {}} />,
  ],
  ["GenerationProgress", <GenerationProgress running={false} />],
  ["ContentStatusBadge", <ContentStatusBadge status="validated" />],
  [
    "ContentLifecycleActions",
    <ContentLifecycleActions status="validated" onValidate={() => {}} onReject={() => {}} />,
  ],
  [
    "SubjectFilterChips",
    <SubjectFilterChips subjects={[]} selected={null} onSelect={() => {}} />,
  ],

  // — galaxy (partie LÉGÈRE ; `GalaxyCanvas` n'est pas exporté ici, voir plus bas) —
  ["GalaxyLegend", <GalaxyLegend />],
  ["GalaxyFallbackList", <GalaxyFallbackList nodes={[]} edges={[]} />],

  // — mindmap —
  ["ModeSegmented", <ModeSegmented value="view" onChange={() => {}} />],
  ["LayoutSelector", <LayoutSelector value="radial" onChange={() => {}} />],
  [
    "NodeBank",
    <NodeBank
      chips={[]}
      usedIds={new Set()}
      onDragChip={() => {}}
      onReset={() => {}}
      busy={false}
      failedAttempts={0}
    />,
  ],
  [
    // 🔴 LE composant du défaut. C'est cette ligne qui aurait rougi le 2026-08-12.
    "MindmapWorkspace",
    <MindmapWorkspace
      mm={MM}
      mindmapId={1}
      mode="view"
      onModeChange={() => {}}
      evaluator={async () => ({ score: 0, xp_awarded: 0, nodes: [] })}
    />,
  ],

  // — avatar —
  ["AvatarCanvas", <AvatarCanvas state="idle" awake={false} />],
];

describe("packages/ui — chaque composant exporté se monte", () => {
  it.each(MONTABLES)("%s se monte sans jeter", (_nom, element) => {
    expect(() => render(element)).not.toThrow();
  });
});

// ⚠️ EXCLUSIONS, avec leur motif — jamais silencieuses (ADR-0053 Décision 4).
//
// - `GalaxyCanvas` : **n'est pas exporté** par `@zetis/ui/galaxy`. Il vit dans son propre
//   sous-chemin `@zetis/ui/galaxy/canvas` précisément pour que Three.js n'entre pas dans le bundle
//   de toute page important le design system (ADR-0024 §3). Le monter ici tirerait `three` +
//   `react-force-graph-3d` dans cette suite, et WebGL n'existe pas dans jsdom.
//
// - `MindmapNode` : c'est un **type de nœud React Flow**, pas un composant autonome. Il attend le
//   contexte d'un `<ReactFlow>` (handles, store interne) et n'a aucun sens monté seul. Il EST
//   exercé, indirectement et pour de vrai, par le montage de `MindmapWorkspace` ci-dessus.
//
// Les 81 autres exports du paquet sont des **fonctions pures et des constantes** — on ne « monte »
// pas `easeOutCubic`. Ce fichier ne les concerne pas.
