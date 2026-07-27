# Prompt Claude Code — Mindmaps · Slice B frontend (ADR-0016)

> Exécution de l'ADR-0016, **après** la Slice A backend **et après la Slice B des fiches**
> (qui a extrait les briques Papa partagées). Périmètre : **frontend uniquement** — deps
> React Flow + elkjs, moteur de mapping/layout, viewer Massimo (3 écrans + 3 modes),
> pilotage Papa. Spec : `docs/frontend-massimo/page-mindmaps.md`. Maquette :
> `mockup-page-mindmaps.html`. **Étape à numéroter (≠ 19/20 réservées `zetis-clip`).**

---

Lance d'abord `graphify update .`, puis lis, dans cet ordre, avant toute ligne de code :

1. `CLAUDE.md` (frontière Massimo/Papa — jamais mélanger ; **le layout est présentation
   client, mais évaluation/XP restent serveur**) ;
2. `docs/decisions/adr-0016-mindmaps-rendu-layout.md` **en entier** (moteurs, 4 layouts,
   `defaultLayout`, « équilibrée » = glue deux côtés, layout = client) +
   `docs/frontend-massimo/page-mindmaps.md` (**spec de page = contrat visuel** : sélecteur,
   3 modes, contrôles). *(Si `mockup-page-mindmaps.html` est committé — p. ex.
   `docs/frontend-massimo/mockups/` — lis-le aussi pour le comportement d'interaction ; sinon
   la spec fait foi.)* ;
3. **`design-system.md` → « Conventions UI partagées »** + les **briques déjà extraites en
   Slice B fiches** (`ContentLifecycleActions`, `GenerationProgress`, `ConfirmDialog` dans
   `@zetis/ui`). **Réutilise-les** — ne les recrée pas. Si elles n'existent pas (fiches Slice B
   non faite) : ARRÊTE-TOI et signale la dépendance ;
4. `SubjectDeckGrid` réel + `lib/subjectIcons.ts` (props exactes) ;
5. `packages/types/src/mindmap.ts` (Slice A) et les routes livrées en Slice A
   (`/mindmaps/*`, `/api/student/…/mindmaps`, `/attempts`, `/evaluate`, `/seen`) — contrat à
   consommer. **L'évaluation de la reconstruction appelle le serveur** (pas de score client) ;
6. `package.json` + la politique de versions (épinglage exact, pas de `^`, cf. `adr-0007`).

## Objectif

Massimo explore une carte mentale interactive (deck → liste → carte), choisit sa présentation
(4 layouts) et travaille en 3 modes (Voir / M'entraîner / Reconstruire). Papa génère/valide via
les briques partagées. Le layout est calculé **côté client** (elk) ; la **reconstruction est
évaluée par le serveur**.

## Travail demandé

### 0. Dépendances (justifiées par ADR-0016)

- Ajoute et **épingle** `@xyflow/react` et `elkjs` (versions exactes). **Aucune autre dep.**

### 1. Moteur mapping + layout (`frontend-massimo/src/lib/mindmapLayout.ts`)

- `toElk(mm: MindmapJson, kind)` → graphe elk avec options par présentation :
  `radial` ; `layered` `direction="RIGHT"` (horizontal) / `"DOWN"` (vertical) ;
  **équilibrée** = répartir les branches de niveau 1 en deux moitiés + `layered` par côté,
  racine centrée (glue maison).
- `await elk.layout(graph)` (asynchrone) → `toReactFlow(laid)` = nœuds/arêtes React Flow avec
  positions. Normalise la bounding-box pour un fit propre.
- `defaultLayout(mm)` déterministe (ADR-0016 §4) : `radial` si `depth ≤ 2 && leaves ≤ 8`,
  sinon `"h"`. **Surchargeable**.

### 2. `MindmapCanvas` (React Flow)

- Nœuds custom `@zetis/ui` (verre/néon) ; pan / zoom / recentrer ; **plier/déplier** une
  branche. État de chargement pendant le layout elk (asynchrone).
- `LayoutSelector` : **Radial · Horizontal · Vertical · Équilibrée** (au choix), présélection
  = `defaultLayout(mm)`.

### 3. Trois modes (`ModeSegmented`)

- **Voir** (`reference`) : carte complète.
- **M'entraîner** (`training`) : feuilles masquées (`? ? ?`), révélation, compteur
  « n / total » (pilote par `required_nodes`/`optional_nodes` si présents).
- **Reconstruire** (`student_reconstruction`) : `NodeBank` (étiquettes mélangées) → placement →
  **Vérifier** = `POST /mindmaps/{id}/attempts` puis `/evaluate` → colore juste/faux **d'après
  la réponse serveur** + affiche XP. **Aucun score calculé côté client.**

### 4. Viewer Massimo — 3 écrans (verre sombre)

- Écran 1 : `SubjectDeckGrid` (partagé) — badge compteur (nb de cartes) + « Nouveau ».
- Écran 2 : liste des cartes de la matière.
- Écran 3 : `MindmapCanvas` + `LayoutSelector` + `ModeSegmented`. `POST /seen` à l'ouverture.

### 5. Pilotage Papa (émeraude)

- Génération/validation via `<ContentLifecycleActions>` + `<GenerationProgress>` **déjà
  partagés** (fiches Slice B). Édition = modale `mindmap_json` (revalide → `pending`).

## Hors périmètre strict (ne pas commencer)

- Tout backend (Slice A livrée) ; liens transverses (graphe) ; persistance de la préférence de
  layout par élève (différé) ; polish cinématique (Lot B visuel).

## Si tu es bloqué

Écarts probables à signaler AVANT de coder : briques partagées absentes (fiches Slice B non
faite) ; intégration elk asynchrone ↔ React Flow problématique ; chevauchement des libellés en
profondeur sur un layout donné (documente-le, ne bricole pas un cas particulier) ; routes
d'évaluation de la Slice A différentes de la spec.

## À la fin, réponds avec la checklist standard

1. Étape traitée · 2. Résumé · 3. Fichiers créés · 4. Fichiers modifiés · 5. Commandes ·
6. Tests · 7. Points non traités volontairement · 8. Prochaine étape recommandée ·
9. Commit conseillé :
`feat(mindmaps): React Flow + elk viewer (4 layouts, 3 modes) + Papa authoring (frontend)`
