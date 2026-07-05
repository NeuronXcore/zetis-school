# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## Reprise — chantier `mindmap` (ADR-0016) · branche `mindmap`

État global : **Slice A backend = TERMINÉE et COMMITÉE** (`cfe2b43`). **Slice B frontend = quasi
finie mais NON COMMITÉE**, avec un **complément backend** (résumé + XP-pénalité) lui aussi non
commité. **Aucun test end-to-end avec le vrai backend (Postgres + Ollama) n'a été joué** : toute la
vérif front s'est faite dans un harnais isolé à `fetch` mocké.

### FAIT (et vérifié)

- **Slice A backend (commit `cfe2b43`)** : type `MindmapJson` (arbre strict) + miroir Pydantic
  (intégrité de l'arbre), prompt `v1`, service `generate_mindmap`, **reshape de la table `mindmaps`**
  (vestige notion-centré → leçon-centré) + table `mindmap_attempts`, **migration `e4f5a6b7c8d9`
  APPLIQUÉE sur la vraie DB** (roundtrip up/down/up vérifié), endpoints Papa + Massimo, évaluation de
  la reconstruction **serveur** (`score_reconstruction`). 16 tests. → dans Git, rien à refaire.
- **Complément backend (NON commité)** : endpoint `GET /api/student/mindmaps/summary` (compteur de
  cartes validées par matière, decks Massimo) ; **XP-pénalité** `mindmap_reconstruction_xp(score,
  failed_attempts) = max(10, 30 − 5·échecs)` (gamification) ; `record_attempt` accepte
  `failed_attempts` ; champ `failed_attempts` (schéma requête) ; router le transmet. **+2 tests.**
  ⚠️ Pas de nouvelle migration : `failed_attempts` n'est PAS persisté, il ne fait que réduire l'XP
  calculé. **323 tests backend verts.**
- **Slice B frontend (NON commité)** — vérifié en harnais isolé (`fetch` mocké) :
  - Deps épinglées `@xyflow/react@12.11.1` + `elkjs@0.11.1` (massimo).
  - Moteur `lib/mindmapLayout.ts` (elk : radial / layered RIGHT / DOWN + « équilibrée » = miroir
    maison) — **4 layouts rendus OK à l'écran**. `lib/mindmapTree.ts` pur (maxDepth, defaultLayout,
    nodeLevels, **randomPasses**, placementsPayload, shuffle) — testé.
  - Viewer Massimo : `MindmapsPage` (decks) → `MindmapSubjectPage` (liste + `MindmapWorkspace`),
    3 modes : **Regarde / Mémorise / Reconstruire** (badges numérotés colorés ① ② ③ + tooltip XP).
  - **Mémorise** = passes par niveau (`nodeLevels`) + popup final « Reconstruis pour gagner des XP ».
    Vérifié à l'écran (Passe 1/2 → 2/2 → popup → bascule Reconstruire).
  - **Reconstruire** = séance : validation **instantanée par dépôt** (mauvais → revert + popup
    d'erreur immédiat + échec compté), **passes aléatoires partielles** (`ceil(n/3)`, le reste de la
    carte reste en contexte), soumission **auto** quand la carte est complète, popup XP (réduit par
    les échecs). Vérifié à l'écran : blanchiment partiel (3/6), « Passe 1/3 », aléatoire à chaque
    Recommencer, popup erreur + revert, popup succès `+30 XP` / `+25 XP` (1 échec).
  - Nœuds **déplaçables** à la souris (ré-agencement) + arêtes qui se re-routent + **disposition
    persistée en localStorage** par carte + présentation.
  - Arêtes **orthogonales arrondies** (`smoothstep`, `borderRadius: 10`).
  - Pilotage **Papa** : `MindmapsPilotagePage` (briques `@zetis/ui` partagées) + `MindmapEditorModal`
    (**éditeur d'ARBRE structuré**, plus de JSON brut) + route + entrée sidebar.
  - Types partagés `packages/types/src/mindmap.ts`. **81 tests massimo + build + tsc verts** ;
    **papa tsc vert** ; **types tsc vert**.

### E2E vrai backend — JOUÉ ET VERT (Postgres + Ollama, dev DB)

Vérifié le 2026-07-05 (backend `app.main` sur la vraie DB dev, Ollama `Qwen3.6:35b-a3b` +
`nomic-embed-text`, front `massimo-dev` sur 5176 → backend 8001) :

- **Génération Papa via Ollama** : `POST /api/mindmaps/generate {lesson_id:52}` → mindmap
  « Manifestations des séismes » (10 nœuds, arbre cohérent) `pending` → `POST /{id}/validate` →
  `validated`. ✅
- **Endpoint `GET /api/student/mindmaps/summary`** : compteurs réels par matière (SVT passe à 1
  après génération). ✅
- **Viewer réel** : la mindmap générée s'affiche avec layout **elk** (11 nœuds RF + 10 arêtes
  arrondies), 4 présentations, 3 modes. Reconstruire = passes partielles aléatoires « Passe 1/4 »
  (10 nœuds → ceil/3), contexte visible, **plus de bouton Vérifier** (validation auto). ✅
- **XP-pénalité en base réelle** : reconstruction correcte + `failed_attempts:2` →
  `xp_awarded:20` (= max(10, 30−5·2)), avec **XPEvent** (`mindmap_reconstruction`, 20, matière) et
  **MindmapAttempt** (score 100) réellement persistés. ✅

### EN COURS / reste EXACTEMENT

1. **Commité** : `47d2dde` (Slice B front + complément backend). Reste à **pousser + ouvrir la PR**.
2. **Drag complet des 4 passes en navigateur réel NON simulé** (simulation de drag instable dans le
   preview) — mais la reconstruction + l'XP sont prouvés au niveau API sur la vraie DB, et le drag
   est prouvé en harnais. Risque résiduel faible.
3. **Page pilotage Papa + éditeur d'arbre : pas ré-ouverts en navigateur** cette session (nécessite
   login Papa). Génération/validation Papa prouvées via l'API. À faire à l'occasion.
4. **Badge « Nouveau » / suivi des vues : DIFFÉRÉ** (pas de table `mindmap_views`, `/seen` no-op).
5. **Données de test laissées dans la DB dev** : mindmap SVT id 5 (généré), 1 MindmapAttempt + 1
   XPEvent (+20) pour Massimo. Sans conséquence (dev), à savoir.

### DÉCISIONS ACTIVES (prises en session — ne pas rouvrir)

- Table `mindmaps` vestige (notion-centré, inutilisée) → **reshape leçon-centré** (décidé avec le
  user). Migration `e4f5a6b7c8d9`.
- Ajout de `/api/student/mindmaps/summary` (counts only, **sans** « Nouveau ») bien que le prompt
  Slice B disait « frontend uniquement » — décidé avec le user (les decks l'exigent).
- **Reconstruire = validation instantanée client** (`chipNodeId === slotId`) ; l'XP reste **serveur**
  (`/attempts`, réduit par les échecs). `/evaluate` (pur) existe mais n'est plus appelé côté client.
- **Reconstruire = passes aléatoires partielles**, `ceil(n/3)`, contexte visible (jamais tout
  blanchi depuis le centre).
- Layout = **présentation client** (ADR-0016) → disposition persistée en **localStorage** (pas de
  sync multi-appareils : follow-up).
- Arêtes `smoothstep` avec `pathOptions.borderRadius: 10` (18 fait planter). **Un seul** handle
  source + un cible par nœud, position par côté (les handles multiples adressés par id ne se
  résolvent pas dans React Flow).
- `maxDepth` compte le **centre comme niveau 1** (seuil de `defaultLayout`).

### PROCHAIN PAS

1. **Pousser la branche `mindmap` + ouvrir la PR** (Slice A `cfe2b43` + Slice B `47d2dde`).
   L'E2E vrai backend est **fait et vert** (voir ci-dessus).
2. (Optionnel) Revérifier la page pilotage Papa + l'éditeur d'arbre en navigateur (login Papa).

### Repères (Git / orientation)

- `git log --oneline` : `cfe2b43` = Slice A (dernier commit). Le reste = working-tree.
- Zone code : `graphify explain "mindmap"` ; back `app/modules/mindmaps/` ; front massimo
  `src/components/mindmap/` + `src/lib/mindmap*.ts` ; papa `MindmapsPilotagePage`/`MindmapEditorModal`.
- Modèle de données mindmaps : `DATA_MODEL.md` (sections Mindmap + MindmapAttempt, déjà à jour).
- Écarts rencontrés : `TROUBLESHOOTING.md`.
