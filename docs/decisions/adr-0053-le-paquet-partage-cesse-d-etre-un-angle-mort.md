# ADR-0053 — Le paquet partagé cesse d'être un angle mort

## Statut

**Proposé — 2026-08-12.** Les **cinq décisions sont gelées** ; une session de slice peut démarrer
après `/ouverture`.

> Cadré sur `main`, **sans une ligne de code**, après une `/ouverture` **arrêtée à son §2**
> (quatrième fois). Aucun ADR, aucune spec, aucun prompt n'existait sur le sujet.

> ⚠️ **Ce chantier ne livre aucune fonctionnalité à Massimo.** Il paie une dette dont le coût vient
> d'être démontré, le même jour, sur un chantier livré.

## Contexte

Le 2026-08-12, un effet déclaré avant l'état qu'il lit a provoqué une **zone morte temporelle**
dans `MindmapWorkspace` :

```
ReferenceError: Cannot access 'layout' before initialization
```

**Le composant ne montait plus du tout.** La mindmap était entièrement inutilisable — écran vide.

🔴 **Et rien ne l'a vu** :

- `tsc -b` **passait** : une TDZ est une erreur d'**exécution**, pas de typage ;
- **668 tests Massimo et 814 Papa étaient VERTS.**

Le défaut a été trouvé par **l'œil du commanditaire sur un simulateur iPhone**, après que j'ai
moi-même diagnostiqué à tort « le tap a raté » et poursuivi trois écrans sur cette lecture.

## Constat read-before-code

**Mesuré**, pas supposé.

### 1. `packages/ui` n'a aucun test — et la couverture indirecte est un mirage

| | |
|---|---|
| Fichiers source dans `packages/ui/src` | **48** |
| Fichiers de test | **0** |
| Script `test` dans son `package.json` | **absent** |

Les deux apps ont un `include: ["src/**/*.test.{ts,tsx}"]` **relatif à leur racine** : les tests de
`packages/ui` ne seraient ramassés par personne, même s'ils existaient.

🔴 **Sur les six tests d'app qui touchent `@zetis/ui`, QUATRE le MOQUENT** —
`GalaxyReplayModal.test.tsx`, `HomeGalaxyCard.test.tsx`, `ChatPage.test.tsx` et, côté Papa,
`MindmapPreviewModal.test.tsx`. Seuls **deux** l'exercent vraiment (`galaxyStates.test.tsx`,
`ConfirmDialog.test.tsx`). La couverture indirecte n'existe donc quasiment pas — **et le seul test
qui approchait `MindmapWorkspace` le mockait.**

### 2. L'infrastructure à créer est plus petite que je ne le craignais

Les deux configurations vitest des apps sont **rigoureusement identiques** (jsdom, `globals`,
`setupFiles`, `css: false`), et les deux `setup.ts` aussi : **deux lignes**, un import de
`@testing-library/jest-dom/vitest`. Il n'y a pas de configuration compliquée à reproduire.

### 3. Les dépendances lourdes tiennent dans **5 fichiers sur 48**

| Dépendance | Fichiers concernés |
|---|---|
| `three` | `GalaxyCanvas.tsx`, `brainGeometry.ts` |
| `react-force-graph-3d` | `GalaxyCanvas.tsx` |
| `@xyflow/react` | `MindmapWorkspace.tsx`, `MindmapNode.tsx` |
| `elkjs` | `mindmapLayout.ts` |

**43 fichiers sur 48 sont légers.** La crainte « un runner qui charge Three.js paie très cher » est
donc à **borner**, pas à généraliser : elle ne concerne qu'une poignée de fichiers.

### 4. 🔴 Mais jsdom ne suffit pas tel quel — deux manques mesurés

- **React Flow dépend de `ResizeObserver`**, que **jsdom n'a pas**, et **aucun polyfill n'existe**
  dans les `setup.ts` (vérifié : la seule occurrence de `ResizeObserver` du dépôt est dans
  `GalaxyCanvas.tsx`, côté application).
- **`elkjs` contient 15 références à `Worker`** — il cherche un Web Worker, absent de jsdom.

**Aucun test du dépôt n'a jamais monté React Flow.** Ce serait le premier.

### 5. 🔴 Le fait qui décide de tout : la TDZ n'avait PAS besoin de React Flow pour être attrapée

Le crash se produit à l'**évaluation du corps de la fonction composant** — c'est-à-dire **avant**
que le JSX soit retourné, donc **avant** que React Flow ou elk soient sollicités.

**Un simple « le composant se monte sans jeter » l'aurait attrapé.** C'est un test qu'on peut
écrire pour les 48 fichiers sans comprendre ce qu'ils font.

⚠️ **Réserve, et elle est sérieuse** : encore faut-il que le montage ne tombe pas pour une **autre**
raison — le `ResizeObserver` manquant. Sans le polyfill, le test échouerait *toujours*, ce qui est
pire qu'inutile : on le désactiverait, et l'angle mort reviendrait avec une bonne conscience.

## Alternatives considérées

### A — Ne rien faire, s'en remettre à la relecture visuelle *(écartée)*

C'est l'état actuel. Il a fonctionné — le commanditaire a trouvé le défaut. Mais il l'a trouvé
**après** le merge du chantier précédent et **au prix d'une heure** de fausses pistes, sur un
simulateur qu'il a fallu amorcer. Une régression qui rend une page blanche ne devrait pas coûter ça.

### B — Tester `packages/ui` depuis les apps, en élargissant leur `include` *(écartée)*

Techniquement possible (`include: ["src/**/*.test.tsx", "../../packages/ui/**/*.test.tsx"]`). Mais
alors **les mêmes tests tourneraient DEUX fois**, une fois par app, et un échec s'afficherait deux
fois sans qu'on sache lequel est en cause. Et le paquet resterait sans identité propre : on ne
pourrait pas le vérifier seul.

### C — Une configuration vitest partagée à la racine, héritée par les trois *(écartée pour l'instant)*

Séduisant — les trois configurations sont identiques aujourd'hui. Mais `CLAUDE.md` n° 7 interdit
l'abstraction prématurée, et factoriser **trois** fichiers de dix lignes pour en créer un quatrième
plus un mécanisme d'héritage coûte plus qu'il ne rapporte. **À rouvrir si elles divergent.**

### D — Viser une couverture chiffrée *(écartée, et fermement)*

Un seuil (« 60 % de lignes ») ferait écrire des tests pour le chiffre. Le défaut du jour n'était pas
un manque de couverture : c'était un **composant qui ne montait pas**. On vise **le montage**, pas
un pourcentage.

## Décision

### 1. `packages/ui` reçoit son propre runner, calqué sur celui des apps

Un `vite.config.ts` avec le **même** bloc `test` que les deux apps (jsdom, `globals`,
`setupFiles`, `css: false`), un `src/test/setup.ts`, et un script `"test": "vitest run"`.

**On recopie, on ne factorise pas** — voir l'alternative C. Le jour où les trois divergent, la
question se rouvrira avec une raison.

### 2. 🔴 Le premier test est un test de MONTAGE, sur tous les composants exportés

Pour chaque composant exporté par `packages/ui` : **le monter avec des props minimales et vérifier
qu'il ne jette pas.** Rien d'autre.

C'est délibérément grossier, et c'est le point : **c'est exactement ce qui aurait attrapé la TDZ**,
sans rien connaître du métier de chaque composant. Un test qui vérifie qu'une page « affiche un
titre » n'aurait rien vu ; un test qui la **monte** aurait rougi.

⚠️ **Ce test doit être VÉRIFIÉ PAR SABOTAGE** : réintroduire la TDZ (déplacer l'effet avant son
`useState`) et constater qu'il **rougit**. Sans cette contre-épreuve, on aura écrit un test qui se
sent utile. Le dépôt a payé quatre fois ce motif.

### 3. Le `setup.ts` polyfille `ResizeObserver`, et **rien d'autre**

Sans lui, le montage de `MindmapWorkspace` échoue pour une raison qui n'a rien à voir avec le code
testé — et un test qui échoue toujours finit désactivé.

⚠️ **Un polyfill n'est pas un mock du composant.** On donne à jsdom ce que le navigateur a ; on ne
remplace pas ce qu'on teste. La différence est exactement celle qui rend
`MindmapPreviewModal.test.tsx` incapable de voir quoi que ce soit.

#### 3 bis. ADDENDUM — `matchMedia` rejoint la liste, et la règle qui la ferme est écrite

**Arbitré par le commanditaire le 2026-08-12, à l'exécution de la slice.**

`AvatarCanvas` (444 lignes) ne se montait pas : `window.matchMedia` **n'existe pas dans jsdom**, et
la Décision 3 disait « `ResizeObserver`, et **rien d'autre** ».

🔴 **La LETTRE de la décision était plus étroite que son propre RAISONNEMENT.** `matchMedia` est
exactement de même nature : une API que le navigateur fournit, que jsdom n'a pas, et dont l'absence
fait échouer un montage **pour une raison étrangère au code testé** — le motif même qui justifiait
le premier polyfill. Appliquer la lettre aurait exclu un composant qui, dans un vrai navigateur,
se monte parfaitement.

**La liste est désormais FERMÉE par une règle, plus par une énumération** :

> Est admis ici — et rien d'autre — *ce que le navigateur fournit, que jsdom n'a pas, et dont
> l'absence ferait échouer un montage pour une raison étrangère au code testé.*

Tout ce qui ne rentre pas dans cette phrase est un **mock**, et un mock n'a rien à faire dans un
`setup`.

⚠️ **Conséquence à connaître** : `prefers-reduced-motion` répond **`false`** dans ces tests — les
composants s'y croient en mouvement autorisé. C'est le défaut du navigateur, pas une
neutralisation ; un test qui voudrait vérifier le comportement en mouvement réduit devra le
surcharger lui-même.

### 4. `elkjs` et le canvas 3D : on tolère l'échec asynchrone, on n'échoue pas dessus

`mindmapLayout` est **asynchrone** et cherche un Worker absent. Le test de montage n'attend **pas**
que la mise en page aboutisse : il vérifie que **le montage** passe. Un rejet de promesse en
arrière-plan ne doit pas faire échouer le test.

Idem pour `GalaxyCanvas` (Three.js + WebGL, absent de jsdom) : s'il ne peut pas se monter du tout,
il est **explicitement exclu, avec son motif écrit dans le test** — jamais silencieusement.

### 5. Le paquet est vérifié dans la même passe que les apps

`packages/ui` doit être lançable seul (`npm test` dans le paquet), et sa suite doit figurer dans la
checklist de clôture au même titre que Massimo et Papa. Un runner qu'on oublie de lancer ne vaut pas
mieux que pas de runner.

## Périmètre

**Touché** : `packages/ui/` — `vite.config.ts`, `package.json`, `src/test/setup.ts`, et les
fichiers de test créés.

**HORS PÉRIMÈTRE, explicitement :**

- **modifier un composant de `packages/ui`** pour le rendre testable — si un composant résiste, on
  le **consigne**, on ne le refactore pas dans ce chantier ;
- les configurations vitest des **deux apps** (elles marchent) ;
- une **configuration partagée** à la racine (alternative C) ;
- tout **objectif de couverture** chiffré ;
- les tests de `packages/types` et `packages/prompts` ;
- l'intégration continue — le dépôt n'en a pas, ce chantier n'en crée pas.

## Conséquences

**Assumées :**

- **une troisième configuration vitest** à maintenir, sciemment dupliquée ;
- une **suite de plus** à lancer à chaque clôture ;
- un `setup.ts` qui **diverge** de celui des apps (le polyfill) — la différence doit être commentée,
  sinon quelqu'un « alignera » les trois et cassera le montage ;
- des tests de montage **volontairement pauvres** : ils ne disent rien de ce que les composants
  font. C'est leur nature, pas une étape vers autre chose.

**Nulles** : aucune migration, aucune route, aucun contrat d'API, aucun changement de comportement
pour Massimo ni pour Papa.

## Le signal qui dirait qu'on s'est trompé

- **Les tests de montage ne rougissent jamais** en six mois → ils ne protègent rien de réel, et le
  coût de maintenance n'est pas payé.
- **Ils rougissent souvent pour des raisons d'environnement** (polyfills manquants, promesses
  rejetées) → on a construit une machine à faux positifs, qui sera désactivée.
- **Un composant doit être modifié pour être montable** → le périmètre était trop optimiste, et il
  faut rouvrir avec la question « qu'est-ce qui rend ce composant intestable ? ».

## Suivi

- ⚠️ **La contre-épreuve par sabotage de la TDZ est une CONDITION DE LIVRAISON**, pas une option.
- Le `TROUBLESHOOTING.md` du 2026-08-12 porte déjà les cinq pièges du chantier mindmap, dont la TDZ
  et son motif. Ce chantier est leur réponse structurelle.
