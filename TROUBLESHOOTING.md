# TROUBLESHOOTING.md — Écarts réels rencontrés

> Journal des divergences concrètes (API inattendue, pièges d'intégration, crashs) rencontrées en
> cours de chantier, avec la cause et la solution retenue. Complète `MEMORY.md` (raisonnement) et
> les ADR (décisions). Une entrée = un piège qui ferait perdre du temps à la prochaine session.

## Chantier `mindmap` (ADR-0016)

### Données / backend

- **Table `mindmaps` préexistante = vestige notion-centré inutilisé** (créée par le schéma initial
  `96c52d4ba103` : `subject_id`/`skill_id`/`student_id`/`title`/`mode`/`status`, aucun code ne
  l'utilisait). La Slice A la voulait leçon-centrée. → **Reshape** (drop + recreate) + table
  `mindmap_attempts`, migration `e4f5a6b7c8d9`. Reshape destructif assumé (table vide de tout usage).
- **La Slice A n'a pas livré d'endpoint `/summary`** que la Slice B (grille de decks Massimo) exige.
  → Ajout d'un `GET /api/student/mindmaps/summary` (counts only). Décidé avec le user malgré le
  périmètre « frontend uniquement » du prompt.
- **`resolve_canonical_context` prend un `skill_id`, pas un `lesson_id`** (piège commun aux dérivés
  leçon-centrés). On force le cours = LA leçon validée et on n'utilise le résolveur que pour son
  complément RAG (même patron que fiches/quiz). Rien de neuf ici mais à re-vérifier pour tout dérivé.

### React Flow (`@xyflow/react` 12.11.1) — plusieurs pièges non évidents

- **`pathOptions.borderRadius: 18` sur une arête `smoothstep` → CRASH silencieux de toute la couche
  d'arêtes** : chemin invalide pour les segments courts, 0 arête rendue, **aucune erreur console
  claire** (juste « An error occurred in component »). `rfEdges` contenait bien les 8 arêtes. →
  Ramené à `borderRadius: 10`. Diagnostiqué en testant `type: "straight"` (qui, lui, rendait).
- **Un `onClick` posé sur le `<div>` d'un nœud NON draggable ne se déclenche JAMAIS** : React Flow met
  `pointer-events: none` sur ces nœuds (pour laisser passer le pan). → Router les clics par le
  `onNodeClick` de `<ReactFlow>` (qui réactive aussi les pointer-events). Symptôme : cliquer un
  `· · ·` en mode Mémorise ne révélait rien.
- **Adresser des handles multiples par `sourceHandle`/`targetHandle` (id) ne résout pas les arêtes**
  (8 handles enregistrés, `rfEdges` peuplé, mais 0 arête rendue, sans erreur). → Revenir à **UN
  handle source + UN cible** par nœud, avec `position` calculée par côté (`sideTo`) selon la
  géométrie → routage orthogonal propre dans toutes les présentations.
- **Recréer les objets nœuds à chaque render (système à deux effets `setRfNodes` qui « préserve la
  data ») strippe les mesures internes RF (`measured`)** → re-mesure perpétuelle → **arêtes jamais
  rendues** (nœuds pourtant présents et mesurés dans le DOM). → **Un seul effet** `setRfNodes(derivedNodes)` ;
  les positions viennent de `livePos` (donc recréer les nœuds ne perd pas l'agencement).
- **Boucle infinie « Maximum update depth exceeded » → écran noir** : `const currentChunk =
  buildPasses[buildPass] ?? []` recrée un **tableau vide neuf à chaque render** quand `buildPasses`
  est vide (ex. en mode Regarde), ce qui fait recalculer `currentSlotSet` → `derivedNodes` →
  `setRfNodes` en boucle. → **`useMemo` sur `currentChunk`** (référence stable).

### Extraction de la brique `@zetis/ui/mindmap` (addendum, 2026-07-27)

- **Le prompt parlait de `MindmapCanvas` — le composant réel s'appelle `MindmapWorkspace`**, et il
  a **deux** points de montage, pas un : `MindmapSubjectPage` **et** `MindmapMissionModal` (step
  mindmap ADR-0019). La non-régression porte sur les deux ; ne conclure qu'après avoir ouvert
  l'étape mindmap d'une mission sur `/missions`.
- **Export en SOUS-CHEMIN obligatoire** (`@zetis/ui/mindmap`, pas la racine `@zetis/ui`) : la brique
  embarque React Flow + elkjs (~1,6 Mo). Ré-exportée depuis `src/index.ts`, elle entrerait dans le
  bundle de **toutes** les pages Papa et le `lazy()` de la modale ne servirait plus à rien.
  Contrôle : après `vite build` de Papa, React Flow doit être dans un **chunk séparé**.
- **Les keyframes CSS ne suivent pas automatiquement le composant.** `mm-gold-pop`, `mm-dot-active`
  et `mm-cheer` vivaient dans `apps/frontend-massimo/src/index.css` ; Papa ne les avait pas → le
  nœud doré et le toast de félicitation auraient été muets côté aperçu, **sans erreur**. Résolu par
  un `mindmap.css` co-localisé, importé par la brique elle-même. Le `@source
  "../../../packages/ui/src"` des deux `index.css` couvre déjà les **classes** Tailwind ; il ne
  couvre pas les `@keyframes`.
- **Simuler un drag dans la brique : `left_click_drag` ne suffit pas.** Il émet des `MouseEvent`,
  or la banque écoute `onPointerDown` → aucun dépôt, et React Flow pan à la place. Il faut
  dispatcher de vrais `PointerEvent` (`pointerdown` sur la puce, puis `pointermove`+`pointerup` sur
  `window`), en **deux evals** avec ~250 ms entre chaque dépôt (React doit re-render entre deux).

### Backend `:8001` sans `--reload` (config `backend-dev`)

- La configuration `backend-dev` de `.claude/launch.json` lance `uvicorn` **sans `--reload`** : un
  backend démarré avant une modification sert l'**ancien code** en silence. Symptôme vécu : les
  champs `attempt_count`/`avg_score` fraîchement ajoutés absents de la réponse `pilotage`, sans
  aucune erreur. → **Redémarrer le serveur après toute modification backend** (`preview_stop` puis
  `preview_start`). Complète le piège du `:8000` stale ci-dessous.

### Harnais de vérification (preview)

- **Le harnais isolé (`mmpreview.html/tsx`) est instable pour les simulations de drag intensives** :
  états de pointeur résiduels après ~30 dispatches, clic juste après un reload qui ne s'enregistre
  pas, et surtout **le tab bascule en `chrome-error://` sur TOUTE erreur d'eval** (même attrapée).
  → Toujours garder les evals (try/catch + null-checks), faire chaque drag en 2 evals
  (pointerdown puis pointermove+pointerup), et redémarrer le serveur si l'état est pollué. Un
  `fetch` mocké dans le harnais permet de tester `/evaluate` + `/attempts` sans backend.

### Divers

- **Fichier mockup supprimé par accident du working tree** (`docs/frontend-massimo/mockup/
  mockup-page-mindmaps.html`) alors qu'on ne devait qu'en corriger le titre. → Restauré via
  `git checkout HEAD -- <fichier>` puis re-application du correctif de titre (« Mes mindmaps »).
  Vérifier `git status` avant tout commit pour ne pas embarquer une suppression involontaire.

## Chantier `mission` (ADR-0017/0018/0019)

### Backend / dev

- **Le backend `:8000` reste STALE toute la session** : démarré avant les Lots missions, il rend en
  **404** toutes les routes récentes (`/pilot/*`, `/command/*`, `/{id}/regenerate`…) alors qu'elles
  sont commitées et enregistrées dans `main.py`. → Un **backend-dev sur `:8001`** (hot-reload actif,
  `--reload`) sert de source de vérité. **Toujours vérifier quel backend répond avant de conclure à un
  bug de routing.** (Le front dev `papa-dev :5175` / `massimo-dev :5176` pointe déjà sur `:8001`.)
- **`ADR-0017` supposait `Skill` cherchable par embeddings** (pour la porte « thématique texte libre »
  de Commander). FAUX : **seul `RagChunk` porte une colonne `embedding` (pgvector) ; `Skill` n'en a
  pas.** → texte-libre reporté (ADR-0018), v1 = sélection référentiel. Annoté dans ADR-0017 §1 (iii).
- **`ADR-0017` déclarait « zéro migration de ciblage »** — faux aussi : `mission_steps.resource_id` et
  `missions.started_at` n'existaient pas (Lot 1, migration `f3a4b5c6d7e8`), et Commander a exigé
  `missions.force_priority` + `missions.due_date` (migration `a7b8c9d0e1f2`). Lire le modèle réel avant
  de se fier à la prémisse « zéro migration » d'un ADR.
- **Cycle d'import** : `pilot.py` fait `from ... import service as msvc`. Donc **`service.py` ne doit PAS
  importer `pilot`** (les fonctions cycle-de-vie renvoient l'objet `Mission`, et c'est le **router** qui
  sérialise via `pilot._to_pilot_out`). Sinon `ImportError` circulaire au démarrage.
- **Le sélecteur plancher-isait TOUTE mission `manual` par son TYPE** (`forced_priority = 1.0 if
  mission_type == "manual"`). Incompatible avec « l'urgence passe par `force_priority` » (ADR-0018). →
  lire le **flag** `mission.force_priority` ⇒ **changement de facteur ⇒ bump `MISSION_SCORING_VERSION`**
  (v1→v2, puis v2→v3 pour le step mindmap). Toute assertion de test sur `scoring_version` à mettre à jour.
- **`MindmapAttempt` n'a ni `context` ni `completed_at`** (contrairement à `QuizAttempt`) : une tentative
  n'existe qu'une fois **scorée serveur** → l'existence vaut complétion. La preuve d'un step mindmap se
  gate donc sur `created_at > started_at` + `score > 0`, sans filtre `context="mission"`.

### Frontend Papa / preview

- **`useState` placé au milieu d'un hook (après des `useCallback`)** → React « change in order of Hooks »
  **au HOT-RELOAD** (Fast Refresh préserve l'état de l'instance montée dont l'ordre diffère) + **white
  screen**. Pas visible au reload complet, donc trompeur. → **Grouper tous les `useState` en tête** du
  hook. (Vu sur `busyMission` dans `useMissionsPilotage`.)
- **`ContentLifecycleActions` (@zetis/ui) n'est pas réutilisable pour les missions** : sa copie de
  ConfirmDialog est figée pour le contenu LLM (« le contenu repassera à valider », « depuis la leçon »),
  fausse pour une mission (regenerate déterministe, pas de reset de validation). → rangée d'actions
  dédiée + `ConfirmDialog` brut.
- **Le runner de mission Massimo n'a AUCUN deep-link de step** (eli5/quiz compris) : l'enfant navigue
  manuellement puis « Valide » (preuve serveur). Le step mindmap ajoute le **premier** CTA de deep-link
  (« Reconstruire → » vers `/mindmaps/reconstruire/:id`). `fetchMindmap(id)` renvoyant déjà `subject_slug`,
  aucune route/schéma supplémentaire n'a été nécessaire pour résoudre le slug côté client.

## Chantier `mission` — frontend Massimo (page decks + modales in-page)

- **⚠️ `backdrop-filter`/`transform` sur un panneau de modale casse les enfants `position: fixed`.**
  Le `MindmapWorkspace` rend son fantôme de drag en `position: fixed; left/top = clientX/clientY`
  (viewport). Dans `ActivityModal`, `backdrop-blur-xl` (et l'ancienne animation `translate/scale`)
  sur le PANNEAU créent un **bloc conteneur** pour les descendants fixed → le fantôme se positionne
  par rapport au panneau centré, pas au viewport (« nœud loin de la souris, hors plan »). Idem pour
  le toast XP d'ELI5. → **Aucun `backdrop-filter`/`transform` sur le panneau** (fond `zetis-surface`
  opaque, le flou n'y servait à rien) ; entrée en **opacité seule**. Le backdrop de l'*overlay*
  (`inset-0`, à 0,0) est inoffensif. Piège de coord classique React Flow / drag custom.
- **Bascule deep-link → modales in-page** (remplace l'entrée « le runner n'a aucun deep-link » plus
  haut) : les 3 activités (ELI5 / quiz / mindmap) s'ouvrent EN MODALE sur `/missions` ; l'étape se
  valide dans la modale (`completeStep`), fin du marqueur `sessionStorage` + de la redirection. Une
  seule modale ELI5 couvre `eli5` + `vocal_explain` (complète `eli5` à `status="explained"`, `vocal`
  à `feedback`+reverse, stop au 1er 409). UI d'activité **extraites** (`Eli5Session`/`QuizRunner`) →
  `Eli5Page.test.tsx` garde le DOM identique (mouvement pur, à relancer après extraction).
- **Étape mindmap absente alors qu'une carte existe** : `_resolve_mission_mindmap_id` résout la carte
  à la **création** de la mission ; une carte validée *après* coup n'est pas rétro-ajoutée. → **régénérer
  le parcours** (`POST /missions/{id}/regenerate`, planned seulement — une mission `active` refuse,
  409). Pas besoin de générer si la carte existe déjà.
