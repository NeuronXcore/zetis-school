---
id: "0016"
titre: "Mindmaps interactives : rendu React Flow + layout elkjs, 4 présentations au choix"
type: mesure
statut: accepte
date: 2026-07-05
pr: null
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0019"]
---
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

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-07-27 | Pilotage Papa : aperçu fidèle, brique de canvas partagée, cycle de vie éditorial | Accepté | — |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

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

---

## Amendement 1 — Pilotage Papa : aperçu fidèle, brique de canvas partagée, cycle de vie éditorial — 2026-07-27

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

> Section à **ajouter à la fin de** `docs/decisions/adr-0016-mindmaps-rendu-layout.md`
> (patron des addenda de `adr-0007`).
> Statut : **Accepté — 2026-07-27**. Ne remplace rien : précise le **§6 Frontière
> Massimo / Papa**, qui se limitait à « Papa : génération/validation (`pending → validated`) ».

### Contexte

Le §6 ne dit pas **comment** Papa juge. Or valider une carte mentale sans la voir revient à
valider un JSON : ni la lisibilité de la disposition, ni la faisabilité du mode *Mémorise*, ni
la difficulté du mode *Reconstruis* ne sont inspectables depuis un arbre textuel. Le besoin
exprimé : Papa doit **voir la carte exactement comme Massimo la verra, dans les trois modes**,
puis **valider, régénérer, supprimer ou corriger** sans quitter l'écran.

Trois faits contraignent la réponse :

- Le renderer (`MindmapCanvas`, `mindmapLayout.ts`, `ModeSegmented`, `LayoutSelector`,
  `NodeBank`) vit dans `frontend-massimo/src/` ; `CLAUDE.md` **interdit l'import croisé** entre
  les deux apps.
- Papa prévisualise du **`pending`** ; les routes élève gatent `validated` (404 sinon).
- Le mode *Reconstruis* appelle `POST /mindmaps/{id}/attempts` puis `/evaluate` : **persistance
  d'une tentative + crédit d'XP**. Déclenché par Papa, c'est une pollution du journal de
  Massimo.

### Décision

#### A. Le canvas devient une **brique partagée**, pilotée par props

`MindmapCanvas`, `mindmapLayout.ts` (`toElk` / `toReactFlow` / `defaultLayout`),
`ModeSegmented`, `LayoutSelector`, `NodeBank` et les nœuds custom sont **extraits dans
`@zetis/ui`**. Même discipline que `SubjectDeckGrid` et `ContentLifecycleActions` : Massimo
**ré-importe** la brique extraite — c'est la **preuve de réutilisation**, aucune régression
attendue sur `/mindmaps` et `/mindmaps/:slug`.

Contrat d'extraction, non négociable :

- **Zéro fetch dans le composant.** `mindmap_json` descend **en prop**. Papa l'alimente depuis
  `GET /api/mindmaps/{id}` (route parent, sert le `pending`), Massimo depuis ses routes élève
  gatées. Le gate reste dans la requête serveur, jamais dans le composant.
- **Zéro logique métier.** Le score ne se calcule pas dans la brique (cf. §C).
- Les écrans 1 et 2 (decks `SubjectDeckGrid`, liste des cartes) et le `POST /seen` **restent**
  dans la page Massimo : ils sont propres au parcours élève.

`@xyflow/react` et `elkjs` **migrent** de `frontend-massimo` vers `packages/ui` (versions
épinglées inchangées, cf. `adr-0007`). Côté Papa, la brique est chargée en **`import()`
paresseux** à l'ouverture de la modale — React Flow + elk ne pèsent sur aucune autre page.
**Aucune dépendance nouvelle** : déplacement dans le workspace, pas ajout.

#### B. Aperçu Papa : **une grande modale**, quatre onglets

Modale quasi plein écran (`min(1400px, 95vw) × 90vh`), pas une page dédiée : Papa juge depuis
l'arbre matière → leçons → mindmaps et doit y revenir sans perdre son contexte (scroll, nœud
d'arbre déplié). Même geste que l'aperçu `@remotion/player` des capsules et que
`FicheEditorModal`.

- **En-tête** (chrome Papa, émeraude) : titre de la leçon, `ContentStatusBadge`, et bandeau
  discret **« Aperçu — rien n'est enregistré pour Massimo »**.
- **Corps** : un **hublot** rendant la brique **à l'identique du frontend Massimo** (verre
  sombre / néon), avec le vrai `ModeSegmented` (**Regarde · Mémorise · Reconstruis**) et le vrai
  `LayoutSelector` (4 présentations, défaut `defaultLayout`). Un quatrième onglet **Éditer**
  (cf. §D).
- **Pied** : `ContentLifecycleActions` (Régénérer · Supprimer, avec `ConfirmDialog`) +
  **Valider**. La même brique qu'en ligne de liste, deux points de montage — les libellés ne
  peuvent pas diverger.

**Le hublot sombre dans un chrome émeraude est une exception cadrée à la frontière visuelle**,
pas une entorse : c'est un *aperçu de fidélité*, précédent établi par le Player capsules qui
montre déjà l'esthétique Massimo dans la page Papa. Il est explicitement encadré (cadre de type
device frame) pour rester lisible comme « ce que voit Massimo », jamais fondu dans la page.

Les libellés des modes viennent du `ModeSegmented` partagé : **source unique**, aucune
retranscription côté Papa.

#### C. Évaluation d'aperçu : **serveur, sans effet de bord**

Nouveau `POST /api/mindmaps/{id}/evaluate-preview`, garde `require_parent`. Il **réutilise la
fonction pure d'évaluation** déjà écrite en Slice A (comparaison des nœuds placés au
`mindmap_json` de référence) et **ne persiste rien** : aucun `mindmap_attempts`, aucun
`xp_events`, aucun `learning_events`.

La brique reçoit un **`evaluator` injecté en prop** : Massimo passe l'évaluateur réel
(`/attempts` + `/evaluate`), Papa passe l'évaluateur d'aperçu. La règle « **aucun score calculé
côté client** » est intégralement préservée, et il n'existe qu'**une seule** implémentation du
barème — un substrat, deux consommateurs (patron `adr-0011`).

#### D. Édition : **outline + canvas re-layouté**, pas de drag sur le canvas

L'édition spécifiée en Slice B (« modale du `mindmap_json` brut ») est **remplacée**, pour la
même raison qui a fait remplacer l'édition du `spec_json` des fiches par `FicheEditorModal` :
un JSON brut est inutilisable sur un arbre de 15 à 20 nœuds.

Onglet **Éditer** = **panneau outline à gauche, canvas en lecture seule à droite** :

- l'outline est un arbre texte — indentation `⇥` / `⇧⇥` pour re-parenter, `Entrée` pour ajouter
  un frère, `⌫` pour supprimer une branche, toggle **requis / optionnel**
  (`required_nodes` / `optional_nodes`, qui pilotent le masquage en mode *Mémorise*) ;
- le canvas **se re-layoute à chaque modification** (elk est déjà asynchrone ; un debounce
  suffit) → Papa voit immédiatement l'effet sur la lisibilité.

**Le drag-to-reparent sur le canvas est écarté** : `mindmap_json` **ne porte aucune position**
(décision §5) ; un drop sur un nœud devrait inventer une sémantique de re-parentage qui **entre
en collision avec le drag du mode Reconstruis**, pour un gain faible. Follow-up si le besoin se
confirme à l'usage.

Sauvegarde → `PUT /mindmaps/{id}` → revalidation → `pending` (règle inchangée).

#### E. Cycle de vie éditorial face à l'historique de Massimo

Quatre règles, à écrire noir sur blanc pour qu'aucune implémentation ne « corrige » l'XP :

1. **Éditer une carte `validated` la retire de la liste de Massimo** jusqu'à re-validation
   (conséquence mécanique de la revalidation + du gate). La modale l'annonce **avant**
   sauvegarde : « Cette carte est visible par Massimo. La modifier la retirera de sa liste
   jusqu'à validation. »

   **Exception — mission engagée (chantier « invariants de lecture des dérivés », 2026-07-28).**
   Une carte référencée par le `resource_id` d'une étape d'une **mission active** de Massimo
   reste **servable jusqu'à la fin de cette mission**, même repassée en `pending`. Sans cette
   exception, l'ADR-0019 §2 rend l'étape incomplétable (il exige une `MindmapAttempt`
   postérieure au `start`) : la mission n'a plus de verdict et Massimo reste bloqué sur un
   parcours mort, du fait d'une action de Papa. Règle générale : **le gate porte sur la
   découverte, jamais sur l'achèvement d'un parcours engagé.** L'exception est nommée et testée
   côté serveur ; la carte disparaît bien des routes de découverte pendant ce temps.
2. **Supprimer une carte supprime ses tentatives** (`mindmap_attempts`, `ON DELETE CASCADE`) :
   un score de reconstruction n'a aucun sens sans l'arbre de référence qui l'a produit.
3. **L'XP déjà crédité n'est jamais rembobiné.** `xp_events` / `learning_events` restent
   intacts à la suppression comme à la régénération. Le décrémenter ferait **régresser le niveau
   de Massimo sur une action de Papa** — inacceptable au regard du principe « l'XP est toujours
   acquis, le verdict pilote la maîtrise silencieusement ».
4. **Régénérer ne recalcule aucun score passé.** Le nouvel arbre rend les anciennes tentatives
   non comparables ; elles sont conservées telles quelles, rattachées à la version de carte qui
   les a produites.

**Signal avant destruction** : la ligne de liste et le `ConfirmDialog` de Régénérer / Supprimer
affichent **« Massimo a reconstruit cette carte N fois (moyenne X %) »**, lu depuis
`mindmap_attempts`. C'est la seule information qui rend la confirmation utile. **Strictement
côté Papa** — rien de cet agrégat ne remonte dans l'interface de Massimo (règle : le suivi est
parent-side, pas d'auto-surveillance).

Le statut `rejected` reste dans le modèle mais **n'est pas câblé** : *Valider* et *Supprimer*
couvrent le besoin réel ; pas de troisième chemin sans usage.

### Alternatives considérées

- **Page dédiée `/mindmaps/:id/preview`** : perd le contexte de l'arbre, duplique la navigation,
  et éloigne les actions de cycle de vie du moment du jugement. → Écartée au profit de la modale.
- **Dupliquer le canvas côté Papa** (copie des composants) : deux renderers à maintenir, dérive
  garantie entre ce que Papa voit et ce que Massimo voit — c'est exactement ce que l'aperçu doit
  éliminer. → Écartée.
- **Import croisé `frontend-papa` → `frontend-massimo`** : viole `CLAUDE.md`. → Écartée.
- **Laisser Papa appeler les routes élève** (`/attempts` + `/evaluate`) : soit 403, soit
  pollution du journal et de l'XP de Massimo. → Écartée au profit de `evaluate-preview` (§C).
- **Rendre le hublot en palette émeraude** (respect littéral de la frontière) : détruit l'objet
  même de l'aperçu — Papa doit juger la lisibilité **réelle**, contraste et néons compris.
  → Écartée, avec encadrement visuel explicite en contrepartie.
- **Conserver l'édition JSON brute** : cohérente avec la Slice B telle qu'écrite, mais
  invalidée par le retour d'expérience des fiches. → Remplacée (§D).
- **Interdire *Reconstruis* dans l'aperçu Papa** (limiter à Regarde + Mémorise) : évite §C à
  coût nul, mais prive Papa du seul moyen de vérifier que la reconstruction est faisable et
  correctement barémée. → Écartée.

### Conséquences

#### Positives

- **Un seul renderer** pour les deux interfaces : ce que Papa valide est, par construction,
  ce que Massimo verra.
- Boucle **voir → juger → agir** fermée dans un seul écran, sans changement de contexte.
- **Une seule** implémentation du barème, côté serveur, consommée par deux appelants.
- Règles d'historique explicitées → plus de zone grise sur l'XP lors des suppressions.
- Aucune dépendance nouvelle ; troisième application du patron d'extraction `@zetis/ui`.

#### Négatives / coûts

- **Refactor transverse** : déplacement de composants + de deux dépendances entre packages du
  workspace, avec non-régression Massimo à prouver (build, `tsc -b`, tests existants).
- `packages/ui` embarque désormais React Flow + elk → **chargement paresseux obligatoire** côté
  Papa, sous peine d'alourdir des pages qui n'en ont pas besoin.
- Un endpoint de plus (`evaluate-preview`) et une prop d'injection (`evaluator`) : légère
  indirection à documenter, sinon quelqu'un recâblera `/evaluate` en dur.
- L'éditeur outline est du travail d'UI réel (raccourcis clavier, re-parentage, garde
  d'intégrité de l'arbre côté client avant `PUT`).
- Exception assumée à la séparation visuelle Massimo / Papa, à ne pas généraliser au-delà des
  aperçus de fidélité.

### Suivi

- **Créer `docs/frontend-papa/page-mindmaps-pilotage.md`** (elle manque ; capsules et quiz ont
  la leur) : arbre matière → leçons → mindmaps, modale d'aperçu 4 onglets, éditeur outline,
  cycle de vie et avertissements.
- **Compléter `page-mindmaps.md`** d'une note : le canvas et les 3 modes sont une **brique
  `@zetis/ui` partagée**, l'évaluation est injectée.
- **Ajouter à `DECISIONS.md`** la ligne `adr-0016` **ainsi que** `adr-0006`, `adr-0007` et
  `adr-0008`, toujours absentes de l'index.
- `DATA_MODEL.md` : consigner `ON DELETE CASCADE` sur `mindmap_attempts` et la règle
  « XP jamais rembobiné ».
- `API_SPEC.md` : `POST /api/mindmaps/{id}/evaluate-preview` (`require_parent`, sans
  persistance).
- **Une slice Claude Code** : extraction `@zetis/ui` + non-régression Massimo → endpoint
  `evaluate-preview` → modale Papa (aperçu 3 modes + éditeur outline + cycle de vie).
  Commit conseillé :
  `feat(mindmaps): shared canvas brick + Papa fidelity preview and editorial lifecycle`
