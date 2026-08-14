# Page Massimo — Mindmaps

> Décision de fond : **ADR-0016** (rendu & layout des mindmaps). Ce document décrit la **surface
> Massimo** telle qu'implémentée. Une mindmap est un objet **leçon-centré** (comme les fiches et les
> quiz), dérivée du **cours canonique** de la leçon (ADR-0011). Le serveur ne sert que le `validated`.
>
> **Le canvas et les 3 modes sont une brique `@zetis/ui` partagée** (`@zetis/ui/mindmap`, addendum
> ADR-0016 §A) : `MindmapWorkspace`, `ModeSegmented`, `LayoutSelector`, `NodeBank`, les nœuds custom
> et le moteur de layout ne vivent plus dans `frontend-massimo`. La page Papa de pilotage en est le
> second consommateur (aperçu de fidélité) — **ce que Papa valide est, par construction, ce que
> Massimo verra**. Deux conséquences pour cette page : la carte descend **en prop** (le gate
> `validated` reste dans la requête serveur, jamais dans le composant) et **l'évaluation de la
> reconstruction est injectée** (prop `evaluator`) — Massimo passe l'évaluateur élève
> (`/attempts`, persiste + crédite l'XP), Papa l'évaluateur d'aperçu (sans effet de bord).
> Ce qui **reste** côté Massimo : les écrans decks/liste, le `POST /seen`, le panneau « fiche ».

## Objectif

Utiliser les cartes mentales comme outil de **compréhension** puis de **restitution active** : voir
la carte d'une notion, s'entraîner à la compléter de mémoire, puis la reconstruire pour gagner des XP.

## Vocabulaire : « mindmap », jamais « carte » `[0052]`

🔴 **Ce que Massimo lit dit « mindmap ».** Le mot « carte » est pris — c'est la **carte de
révision** (SRS, modèle `Card`, module `memory`), et l'app la nomme ainsi partout : « 8 cartes à
revoir », « 5 cartes » sur une échéance, « Refaire un tour (3 cartes) ».

Le coût de la confusion est **mesuré, pas supposé** : le 2026-08-11, un onglet nommé « Cartes »
posé juste avant « Révisions » a fait conclure au commanditaire qu'**il manquait un lien vers les
mindmaps**. Corrigé sur l'onglet et la bande (addendum ADR-0024 §3 bis), puis dans `ACTION_UI`
(PR #117), et enfin ici.

Donc : **« 14 mindmaps »** et non « 14 cartes », **« 🧠 Mindmap »** et non « Carte mentale ».

⚠️ **Côté Papa, « Carte mentale » reste** (`ConseilClasseIAPage`) : la collision est un problème du
vocabulaire de l'enfant — Papa n'a pas « cartes à revoir » à côté.

## Parcours (3 écrans)

1. **`/mindmaps`** — decks par matière (`MindmapsPage` + `SubjectDeckGrid`). Compteur = **mindmaps**
   validées ; matière sans mindmap → deck grisé « bientôt ». En-tête animé (`AnimatedMindmapIcon`,
   voir plus bas).
2. **`/mindmaps/:slug`** — les mindmaps de la matière (`MindmapSubjectPage`, écran 2), **rangées
   par chapitre** dans l'ordre du **programme** et **cherchables au mot** `[0057]`.
   - 🔴 **La recherche traverse les matières** : on cherche sans savoir où c'est rangé. Un résultat
     d'ailleurs apparaît **sous son étagère nommée**, et le clic **emmène** — par `?carte=<id>`,
     **l'adresse d'une mindmap, créée par cette slice**. Elle n'en avait aucune : la carte
     s'ouvrait par son **rang dans la liste**, et un rang n'a pas de sens dans une autre matière.
   - `?carte=<id>` ouvre la mindmap à l'arrivée puis **se retire de l'URL** (patron de `?fiche=`) ;
     le reste des paramètres survit.
   - L'étagère **ne répète pas la matière** quand la page la nomme déjà — mais la nomme **toujours**
     en recherche, sinon on ignore d'où vient un résultat. Le **chapitre ne s'écrit plus sur la
     carte** : l'étagère le porte.
   - Un filtre **ne survit pas** au changement de matière.
   - Source : **`GET /api/student/mindmaps`** (index de toutes les matières), dont l'écran dérive
     celle qui est ouverte — **une seule source**.
3. **Carte interactive** (`MindmapSubjectPage` écran 3 → `MindmapWorkspace`) — layout **elk** rendu
   client (4 présentations : radial / layered RIGHT / DOWN / équilibrée), nœuds déplaçables à la
   souris (disposition persistée en `localStorage` par carte + présentation), arêtes `smoothstep`.

## Les 3 modes (`ModeSegmented`)

Présentés comme un **parcours numéroté** ① ② ③ :

- **① Regarde** (`view`, cyan) — explorer la structure, replier/déplier les branches.
- **② Mémorise** (`train`, violet) — révélation **niveau par niveau** ; popup final « Reconstruis
  pour gagner des XP ».
- **③ Reconstruire** (`build`, or) — **glisser-déposer** en **passes aléatoires partielles**
  (`ceil(n/3)`, le reste de la carte reste en contexte). Validation **instantanée par dépôt** (mauvais
  → revert + popup d'erreur + échec compté). Soumission **auto** quand la carte est complète ; l'XP
  est calculé **serveur** (`/attempts`, réduit par les échecs).

`mode` est **contrôlé par la page** (`MindmapSubjectPage`), qui en a besoin pour piloter le panneau
fiche (ci-dessous).

## Gabarit vertical de l'écran 3 `[0052]`

**La spec ne l'a jamais décrit, et c'est ce qui a laissé le défaut vivre.** L'écran 3 s'empile
ainsi, de haut en bas :

```
① barre des modes  (+ ↺ Disposition, sélecteur de présentation)
② consigne du mode + PassDots
③ ⬅ LA BANQUE D'ÉTIQUETTES        ← mode Reconstruire uniquement
④ le canvas React Flow
```

**La banque est AU-DESSUS du canvas** : on glisse du **haut** vers le **bas**, dans le sens de
lecture, sans jamais franchir une limite de défilement. Elle était en dessous jusqu'au 2026-08-12,
ce qui obligeait à défiler pour atteindre les puces — et remontait hors écran l'emplacement où les
déposer.

⚠️ **Mémorise n'a pas de banque** : on y clique les « · · · » directement sur le canvas. L'ordre
③④ ne concerne que Reconstruire.

🔴 **Le canvas ne se mesure JAMAIS en `vh`.** Il remplit son **conteneur** (colonne flex bornée,
`flex-1` + `min-h-0`). Une hauteur en `vh` mesure le viewport, alors que le workspace vit dans
trois conteneurs dont aucun ne l'est — la page (320 à 463 px de décor au-dessus), la modale de
mission et la modale d'aperçu Papa (toutes deux bornées à `max-h-[calc(100vh-4rem)]`, corps
défilant). Mesuré le 2026-08-12 : en `74vh`, il ne restait **87 px** pour la carte sur un iPhone.

⚠️ **La banque n'a pas de hauteur fixe** — 154 px à vide, **278 px** mesurés sur téléphone (les
puces passent à la ligne). Tout calcul qui la traite comme une constante sera faux sur les grandes
cartes.

**La barre des modes et le sélecteur de présentation passent à la ligne** (`flex-wrap`), **jamais**
de défilement horizontal ni de menu déroulant — même règle que la barre d'onglets de la page
matière (addendum ADR-0024 §3 bis).

## Plein écran `[0052]`

Un bouton donne toute la fenêtre à la carte, **dans les trois modes** — une carte large se lit mal
partout, pas seulement quand on la reconstruit.

Même mécanique que la galaxie : **overlay CSS piloté par un état React**, jamais l'API
`requestFullscreen` du navigateur. Réutilise `CloseFullscreenButton` (cible 44 px, tracé SVG),
**Échap** pour sortir, défilement du corps verrouillé pendant l'overlay.

⚠️ **Un seul `ReactFlow` monté à la fois** — deux instances, ce sont deux calculs de layout elk et
deux jeux de positions `localStorage`.

⚠️ Depuis une **modale** (mission, aperçu Papa), l'overlay passe **au-dessus** d'elle, et en sortir
**ne la referme pas**.

**Une seule façon d'entrer, une seule d'en sortir** : le bouton « ⛶ Plein écran » n'existe qu'en
entrée ; en plein écran, c'est la croix ✕ (et Échap) qui fait sortir.

🔴 **Le sélecteur de présentation reste visible en plein écran, y compris sur téléphone.** Il avait
d'abord été masqué sous 500 px pour rendre de la place à la carte ; mesuré ensuite sur iPhone :
en « Horizontal », un graphe large et plat tombe à un **zoom de 0,32** dans un cadre portrait.
**C'est la présentation qui est le levier de lisibilité** — la masquer retirait l'outil au moment
précis où il sert le plus. La **consigne**, elle, se retire (c'est du mode d'emploi, pas un outil).

## Recadrage et zoom `[0052]`

`fitView` ne joue qu'au **montage** de React Flow. Il est rejoué sur **deux** déclencheurs :
le **cadre** qui change de taille (plein écran) et la **mise en page elk**, qui est asynchrone.

⚠️ **`minZoom` vaut 0,12, pas 0,3.** Un plancher écrit pour un écran de bureau **empêche `fitView`
de faire tenir la carte** sur un téléphone : mesuré à 402 × 874, « Vertical » occupait **124 %** de
la largeur du cadre et « Équilibrée » **122 %**, les deux bloquées au zoom **0,300**. Le signe qui
identifie ce défaut est **un zoom rigoureusement égal au `minZoom`** après un recadrage.

> Une grande mindmap reste petite sur un téléphone — limite du support. Mais **petite et entière**
> vaut mieux que **grande et coupée** : un graphe dont on ne voit pas les bords ne dit pas qu'il
> continue.

## Contrôles de zoom `[0052]`

Les trois boutons (**+**, **−**, **recadrer**) sont en **bas à DROITE**, pas à gauche : les quatre
présentations d'elk poussent la racine à gauche, et depuis qu'ils respectent la cible de **44 px**
ils y masquaient le début de la carte.

Ils reprennent l'habillage de contrôle flottant de `CloseFullscreenButton` (bordure blanche à 15 %,
fond sombre translucide, `backdrop-blur`) — **contraste 15 : 1**. Sans ce style, la feuille de
xyflow les rend blancs sur blanc dans un thème sombre.

## Panneau « fiche du cours » (Regarde / Mémorise)

Sur l'écran 3, bouton **« 🗂️ Voir la fiche »** → ouvre la **fiche de révision** de la leçon dans un
panneau à **gauche** de la carte (`FicheSidePanel`, réutilise `FicheCard`), **sans masquer la
sidebar** de l'app.

- Visible **uniquement en Regarde et Mémorise**. En **Reconstruire**, le bouton est masqué et le
  panneau refermé (consulter la fiche pendant le test = triche).
- Retrouve la fiche depuis la mindmap (`subject_slug` + `lesson_id`) via les routes élève existantes :
  `GET /api/student/subjects/{slug}/fiches` → fiche dont `lesson_id` correspond →
  `GET /api/student/fiches/{id}`. État doux si la leçon n'a pas encore de fiche validée.

## Récompense visuelle (Reconstruire)

- **Nœud bien placé → doré** (état `correct` dans `MindmapNode`, `mm-gold-pop`). L'or **persiste** au
  fil des passes → Massimo voit sa carte se dorer.
- **Popup éphémère de félicitation** grand et centré (`mm-cheer`, ~1,1 s, message aléatoire) à chaque
  bon dépôt.

## Progression par passes (Mémorise / Reconstruire)

Composant partagé **`PassDots`** : une pastille par passe — **done** (pleine, accent) / **active**
(qui respire, `mm-dot-active`) / **todo** (creuse). Le changement de statut est animé.

## En-tête animé

`AnimatedMindmapIcon` (SVG + CSS, aucune dépendance) remplace l'emoji 🧠 : une carte mentale qui **se
construit en boucle** — nœuds **rectangles** apparaissant un à un, **liens dorés** tracés en séquence,
entourée d'un **halo doré** qui respire. `motion-safe` (se fige en `prefers-reduced-motion`).

## Données API (routes élève)

- `GET /api/student/mindmaps/summary` — decks (compteur de cartes validées par matière).
- `GET /api/student/subjects/{slug}/mindmaps` — cartes d'une matière.
- `GET /api/student/mindmaps/{id}` — arbre + métadonnées (`mindmap_json`, `lesson_id`, `subject_slug`).
- `POST /api/student/mindmaps/{id}/seen` — no-op en V1 (suivi des vues / badge « Nouveau » différé).
- `POST /api/student/mindmaps/{id}/attempts` — reconstruction : score + XP (réduit par les échecs).

Génération & validation côté **Papa** (`/api/mindmaps/*`) et évaluation serveur de la reconstruction :
voir `docs/ai/mindmaps.md` et ADR-0016.
