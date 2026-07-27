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

## Parcours (3 écrans)

1. **`/mindmaps`** — decks par matière (`MindmapsPage` + `SubjectDeckGrid`). Compteur = cartes
   validées ; matière sans carte → deck grisé « bientôt ». En-tête animé (`AnimatedMindmapIcon`,
   voir plus bas).
2. **`/mindmaps/:slug`** — liste des cartes de la matière (`MindmapSubjectPage`, écran 2).
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
