# ADR-0016 — Mindmaps interactives : rendu React Flow + layout elkjs, 4 présentations au choix

## Statut

Accepté — 2026-07-05

> **Implémentation en file d'attente** (mono-chantier : après le référentiel/backfill, séquencée
> avec les autres dérivés). L'ADR fige la décision ; `page-mindmaps.md` sera complété (sélecteur
> de présentation + règle de défaut) avant la session Claude Code.
>
> Consomme `adr-0011-contexte-canonique-partage` : la mindmap est un **dérivé** du cours validé
> (`mindmap_json` produit à partir du cours, gate `status='validated'`). Réutilise le
> raisonnement de `adr-0007` (React partout → réutilisation de l'identité ZETIS). Sœur de
> `adr-0015` (fiches) : même lignée de dérivés, même frontière Massimo/Papa.

## Contexte

`page-mindmaps.md` demande une carte mentale **interactive** côté Massimo, trois modes
(`reference` / `training` / `student_reconstruction`) et une donnée `mindmap_json`
(`{center, nodes, edges}`). Deux faits contraignent le choix technique :

- **Le LLM produit un graphe sans positions.** `mindmap_json` décrit la structure mais
  **aucune coordonnée** → il faut un **moteur de layout** pour placer les nœuds.
- **L'interaction est le cœur du besoin** : pan / zoom / replier-déplier (`reference`),
  masquage-révélation (`training`), et **placement contrôlé + évaluation** par comparaison au
  `mindmap_json` de référence (`student_reconstruction`) — ce dernier exige un **état de nœuds
  contrôlé**, pas un rendu figé.

Contraintes projet : sobriété (toute dépendance lourde = ADR) ; interface Massimo
**read-only** ; **serveur = seule source de vérité pour la logique métier** ; local-first.

Décision de cadrage : **le layout est de la présentation, pas de la logique métier.** La
disposition (radial / horizontal / …) n'affecte ni le score, ni la validation, ni la donnée.
Elle est donc **calculée et choisie côté client** sans violer la règle serveur — seule la
**donnée** (`mindmap_json`, validée, canonique) vient du serveur.

## Décision

### 1. Moteur de canvas : **React Flow (xyflow)**

Pan / zoom / nœuds custom stylables (`@zetis/ui`, verre + néon) / **état contrôlé** des nœuds
et arêtes — requis par `student_reconstruction` (placer un nœud, comparer à la référence,
colorer juste/faux). React (comme tout l'existant, cf. `adr-0007`) → réutilisation directe de
l'identité visuelle et de la fiabilité de génération.

### 2. Moteur de layout : **elkjs**

`mindmap_json` sans positions → elk calcule les coordonnées. **Une seule lib** couvre
l'essentiel :

- `layered` (Sugiyama), `elk.direction="RIGHT"` → **horizontal** ; `"DOWN"` → **vertical**.
- `radial` → **radial**.
- Routage d'arêtes orthogonal fourni.

Layout **asynchrone** (`await elk.layout(graph)`, hors thread principal).

### 3. **Quatre présentations laissées au choix** *(décision centrale)*

Le lecteur bascule librement entre **Radial · Horizontal · Vertical · Équilibrée**. C'est un
**sélecteur de présentation** dans le viewer Massimo (état de vue, client). Aucune n'est
verrouillée.

- Radial / Horizontal / Vertical → `radial` / `layered(RIGHT)` / `layered(DOWN)`.
- **Équilibrée** (carte mentale deux côtés) n'est **pas** natif elk : on **répartit les
  branches de niveau 1 en deux moitiés** et on lance `layered` par côté, racine centrée. Petit
  glue au-dessus d'elk — assumé (sobriété : pas de lib de plus pour une seule disposition).

### 4. Défaut « le plus adapté » — déterministe, **toujours surchargé**

À l'ouverture, ZETIS présélectionne la disposition la plus lisible, calculée **uniquement à
partir de la forme du graphe** (donc côté client, zéro donnée serveur en plus) :

```ts
// présentation, pas de logique métier → client
function defaultLayout(mm: MindmapJson): "radial" | "h" | "v" | "bal" {
  const depth = maxDepth(mm);
  const leaves = leafCount(mm);
  if (depth <= 2 && leaves <= 8) return "radial";   // petit + peu profond → radial brille
  return "h";                                        // sinon horizontal : empreinte mini,
}                                                    // libellés FR horizontaux et lisibles
```

Empreintes mesurées sur le comparateur (18 nœuds) qui motivent le défaut : **horizontal
735×548** vs **vertical 1204** de large vs **équilibrée 1290** de large ; radial compact mais
libellés inclinés/tassés quand une branche a beaucoup de feuilles. Le défaut enlève la
friction ; l'utilisateur reste maître (§3). *Optionnel : si « toujours radial au départ » est
préféré, retirer `defaultLayout`.*

### 5. Pipeline de rendu (esquisse)

```ts
// mindmap_json (serveur, validé) → elk → positions → React Flow
const elkGraph = toElk(mm, layoutKind);      // center/nodes/edges + options par kind
const laid    = await elk.layout(elkGraph);  // async, hors thread principal
const { nodes, edges } = toReactFlow(laid);  // positions → RF (nœuds custom @zetis/ui)
// pan/zoom/collapse = état RF ; reconstruction = positions contrôlées + diff vs mm de réf.
```

### 6. Frontière Massimo / Papa & données

- **Massimo** (verre sombre) : viewer read-only, deck par matière (icônes PNG, convention
  ELI5/fiches) → carte interactive + 3 modes. Contenu **filtré `validated`**.
- **Papa** (émeraude) : génération/validation de la mindmap (`pending → validated`).
- `mindmap_json` (`{center, nodes, edges}`) suffit — **aucune colonne nouvelle**. Le choix de
  layout est un **état de vue**, non persisté en V1 (mémoriser la préférence par élève =
  différé).

## Alternatives considérées

- **dagre** : `layered` seul → **ni radial ni équilibrée** avec une lib → seconde lib
  nécessaire, moins sobre. → Écarté comme moteur unique.
- **d3-hierarchy / d3-tree** : viable mais plus de colle vers le modèle RF, radial + routage
  orthogonal à recâbler ; elk les fournit d'emblée. → elk préféré.
- **Trigonométrie maison** (moteur du mockup) : prouve l'**interaction** mais **chevauche/tasse**
  en profondeur (vertical 1204 px, équilibrée 1290 px de large sur 18 nœuds). → Prototype
  d'ergonomie, pas la prod.
- **Une seule disposition verrouillée** : → **écartée** — la décision est de **laisser le
  choix** (§3) ; « le plus adapté » devient un **défaut**, pas une contrainte.
- **Lib de mindmap clé en main** (markmap…) : lecture seule → tue `training` et
  `student_reconstruction`. → Écarté.

## Conséquences

### Positives

- Une lib (elk) couvre 3 des 4 dispositions + le routage ; React Flow offre pan/zoom/état
  contrôlé « gratuitement » (indispensable à la reconstruction).
- **Layout = présentation → 100 % client** : plus simple, zéro aller-retour serveur, règle
  « serveur = source de vérité métier » respectée.
- L'utilisateur choisit ce qui se lit le mieux ; défaut déterministe = friction minimale.
- Cohérent avec `adr-0011` (donnée canonique/validée) et `adr-0007` (React réutilisé).

### Négatives / coûts

- **Deux dépendances nouvelles** : `@xyflow/react` et `elkjs` (versions épinglées, cf.
  `adr-0007`).
- Layout elk **asynchrone** (WASM/worker) → gérer l'`await` + état de chargement.
- **4 dispositions = 4 chemins** à styliser/tester ; « Équilibrée » = petit glue maison.
- Mapping `mindmap_json → elk → React Flow` à écrire et tester (graphe vide, 1 nœud,
  profondeur ≥ 3, branche unique).

### Suivi

- **En attente du chantier mindmaps** (mono-chantier). **Compléter `page-mindmaps.md`** :
  sélecteur de présentation (4 options), règle de défaut (§4), note « layout = présentation,
  client ».
- **Ajouter la ligne `adr-0016` à l'index `DECISIONS.md`.**
- Renvoi `adr-0015` (fiches, sœur) ; ajouter « mindmap » à la lignée de dérivés de `adr-0011`.
```
