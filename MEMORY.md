# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## Reprise — chantier `mission` (ADR-0017/0018/0019) · branche `mission`

État global : les **Lots 1+2 backend de l'ADR-0017 sont COMMITÉS** (`dd9ee78`, `9e10e9b`).
Par-dessus, **4 slices sont FAITES mais NON COMMITÉES** (working-tree) et s'empilent :
(1) page Papa « Missions — pilotage », (2) **Commander** (ADR-0018), (3) **step mindmap**
(ADR-0019), (4) **cycle de vie** (frise + delete/éditer/régénérer). **364 tests backend verts,
tsc + builds massimo/papa verts, E2E live joués et verts** (sauf 2 clics UI finaux, cf. EN COURS).

### FAIT — commité (dans Git)

- **ADR-0017 Lot 1** (`dd9ee78`) : steps à preuves serveur + verdict d'acquisition, migration
  `f3a4b5c6d7e8`.
- **ADR-0017 Lot 2** (`9e10e9b`) : service d'évidence + sélecteur déterministe versionné + 7 routes
  pilotage Papa.

### FAIT — working-tree, NON commité (4 slices, à committer séparément)

1. **Page Papa « Missions — pilotage »** (frontend Lot 2). `lib/missionsPilotage.ts` +
   `hooks/useMissionsPilotage.ts` + `pages/MissionsPage.tsx` (réécrite, 5 sections : KPI → À valider
   → Élue → En cours → Verdicts) + badge sidebar `pending` (`PapaSidebar.tsx`, event
   `zetis:missions-pending-changed`). Frontière `MissionPilotOut` respectée, thème sombre traduit
   depuis la maquette claire. `lib/missions.ts` (ancienne page étape 15) **supprimé**. E2E live vert
   (reject 4→3, KPI + badge en direct).

2. **Commander une mission** (ADR-0018). Papa apporte le scope → ZETIS résout les notions fragiles →
   **1 mission mono-skill par notion cochée** (fan-out, plafond `MISSION_COMMAND_MAX_SKILLS=3`),
   `manual`/`validated` par construction. v1 = 2 portes (Échéance chapitre+date ; Thématique
   sélection référentiel) ; Recommandation + texte-libre **désactivées avec raison**. Backend :
   `missions/command.py` (`preview` sans écriture + `confirm` fan-out), 2 routes `command/preview|confirm`,
   config `mission_command_*`. **Migration `a7b8c9d0e1f2`** (`missions.force_priority` + `due_date`)
   **APPLIQUÉE sur la DB dev**. **Sélecteur bumpé `MISSION_SCORING_VERSION` v1→v2** : `forced_priority`
   lit le flag `mission.force_priority` (plus le type). Front : `useCommandMission.ts` +
   `CommandMissionModal.tsx` + bouton `+ Commander`. E2E live vert (preview, fan-out, badge).

3. **Step mindmap dans les missions** (ADR-0019). Active le créneau `mindmap` (déjà dans le
   vocabulaire fermé ADR-0017 §5). **Aucune migration** (`step_type` `String(20)` suffit). Backend
   `service.py` : `STEP_MINDMAP`, `_resolve_mission_mindmap_id` (optionnel comme le quiz), inséré dans
   `_build_steps` + `_build_revision_steps` (`eli5→vocal→[mindmap]→[quiz]`), `_mindmap_score_after`
   (preuve = `MindmapAttempt` `score>0` ET `created_at>started_at`), branche `_verify_proof`. **Verdict
   OPTION B** : `acquired = reverse≥t ET (quiz≥t OU mindmap≥t)` — la reconstruction **se substitue au
   quiz**. Config `mission_mindmap_threshold=70`, **bump v2→v3**. Front Massimo : CTA « Reconstruire → »
   + route **`/mindmaps/reconstruire/:mindmapId`** (ouvre par id en mode build). Front Papa : emoji/label
   🧠. **E2E live vert** : mission 25 (skill 92, mindmap 3) sans quiz + mindmap 80 + reverse 82 →
   verdict `acquired`.

4. **Cycle de vie des missions (Papa)** — CETTE session. Sur la page pilotage, chaque mission
   (pool + À valider) est une **ligne dépliable** → **frise** (`MissionTimeline.tsx`, séquence + statut,
   emoji + ✓/●/○ + score, PAS d'horodatage) + actions **✏️ Éditer / ↻ Régénérer / 🗑 Supprimer**.
   Backend `service.py` : `delete_mission` (hard, mission+steps ; ≠ reject), `regenerate_mission`
   (**planned-only**, reconstruit le parcours, garde `validation_status`), `patch_mission` (champs
   sûrs), `mission_step_options` + `set_mission_steps` (**éditeur de parcours** = palette contrainte,
   planned-only). Routes `DELETE|PATCH /{id}`, `POST /{id}/regenerate`, `GET /{id}/step-options`,
   `PUT /{id}/steps`. Front : `MissionEditModal.tsx` (métadonnées + éditeur d'étapes ↑/↓/✕ + palette
   d'ajout) + `ConfirmDialog` (delete `tone=danger`, regenerate) + `lib/missionSteps.ts` (STEP_EMOJI/
   STEP_LABEL partagés). Hook : mutations `remove/regenerate/patch/saveSteps/loadStepOptions` +
   `busyMission` par id.

### EN COURS / reste EXACTEMENT

0. **Tout le working-tree est NON commité.** À committer en **4 commits séparés** (pilotage → commander
   → mindmap-step → lifecycle) après vérif humaine (tests + diff). Messages suggérés : voir checklist.
1. **2 clics UI non joués** (verif interrompue par le user) : le **ConfirmDialog de suppression** et le
   **bouton Régénérer** n'ont pas été cliqués en navigateur. Le rendu (frise, modale d'édition avec
   éditeur d'étapes, boutons, Régénérer masqué si `active`) EST vérifié à l'écran ; les endpoints sont
   couverts par 9 tests `test_missions_lifecycle.py` (delete, regenerate planned-only, patch, step-options,
   set-steps). Risque résiduel faible. → **Premier geste de reprise** : rejouer ces 2 clics.
2. **Vérif live *propre* du payload force_priority/due_date de la modale Commander** reste à rejouer
   (scripting DOM avait floppé ; logique prouvée par les 7 tests `test_missions_command.py`).
3. **Données de test laissées en DB dev** : missions manual 24/25 (skill 92), +50 XP student ; 8 missions
   validées. Sans conséquence (dev).

### DÉCISIONS ACTIVES (prises en session — ne pas rouvrir)

- **ADR-0018** : fan-out 1 mission/notion (cap 3), 2 portes v1, **texte-libre reporté** (constat
  read-before-code : `Skill` n'a pas d'embedding, seul `RagChunk` en a), `force_priority` **par flag**
  (bump v1→v2). `due_date` **informationnelle Papa-only**, jamais dans un schéma student.
- **ADR-0019** : mindmap créneau activé, **verdict option B** (mindmap substitue le quiz au rappel,
  reverse toujours requis), bump **v2→v3**. Preuve = `score>0` (effort, pas seuil qualité).
- **Cycle de vie** : `delete` = suppression dure (≠ `reject` qui garde un `rejected`) ; `regenerate` =
  déterministe, **planned-only**, garde la validation ; `patch` = champs sûrs uniquement (immuables :
  skill/type/status/validation/started_at) ; **éditeur de parcours = palette contrainte** (types
  disponibles pour la notion, mindmap/quiz ssi ressource résolue), planned-only, ≥1 étape.
- **Frise = séquence + statut** (pas d'horodatage) et **Édition = métadonnées + éditeur d'étapes** —
  tranchés avec le user.

### PIÈGES (détail → `TROUBLESHOOTING.md` §Chantier `mission`)

- Backend **:8000 est STALE** (démarré avant les Lots) → routes récentes en 404. Utiliser **:8001**
  (hot-reload actif). C'est le piège n°1 de toute reprise ici.
- `useState` placé **après** des `useCallback` dans un hook → HMR « change in order of Hooks » + white
  screen à chaud (pas au reload). Toujours grouper les `useState` en tête.
- `service.py` ne doit **pas** importer `pilot` (cycle `pilot→service`) → le **router** sérialise via
  `pilot._to_pilot_out`.
- `ContentLifecycleActions` (@zetis/ui) a une copie de confirmation spécifique au contenu LLM
  (« repassera à valider ») → inadaptée aux missions ; on a assemblé une rangée d'actions dédiée.

### PROCHAIN PAS

1. **Rejouer en navigateur** (login Papa, :5175 → :8001) les 2 clics manquants : Supprimer (popup
   danger → confirmer → la mission disparaît) et Régénérer (mission planifiée → parcours reconstruit).
2. Lancer la **suite complète** (`pytest`, `tsc -b`, `vite build`) une dernière fois, puis **committer
   en 4 slices** + pousser la branche `mission` + ouvrir la PR.

### Repères (Git / orientation)

- `git log --oneline` : `9e10e9b` (Lot 2) = dernier commit ; tout le reste = working-tree.
- Zone code : `graphify explain "missions"` ; back `app/modules/missions/` (`service.py`, `pilot.py`,
  `command.py`, `selector.py`, `schemas.py`, `router.py`) + `evidence/` ; front papa `MissionsPage.tsx`
  + `MissionEditModal.tsx` + `MissionTimeline.tsx` + `CommandMissionModal.tsx` + `hooks/useMissionsPilotage.ts`
  + `useCommandMission.ts` ; front massimo `MissionsPage.tsx` + `MindmapSubjectPage.tsx` (route reconstruire).
- Décisions figées : ADR-0017 / 0018 / 0019 (`docs/decisions/`). Écarts : `TROUBLESHOOTING.md`.
