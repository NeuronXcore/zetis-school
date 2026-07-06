# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## Reprise — chantier `Conseil de classe IA` (ADR-0020/0021) · branche `feat/conseil-classe-backend`

État global : la branche `feat/conseil-classe-backend` (13 commits) est **POUSSÉE** et la
**PR [#48](https://github.com/NeuronXcore/zetis-school/pull/48) est OUVERTE** vers `main`
(MERGEABLE / CLEAN) — **reste à review + merge**. Le chantier missions précédent
(ADR-0017/0018/0019 + frontend Massimo) est **MERGÉ dans `main`** (PR #46) ; le correctif
`generate_revision` mono-notion est **MERGÉ `main`** (PR #47). **379 tests backend verts, tsc +
builds papa/massimo verts, E2E live Ollama joués et verts.**

### FAIT — sur `feat/conseil-classe-backend` (10 commits, à pousser)

- **ADR-0020 — Conseil de classe IA** (Papa-only). Nouveau module backend `app/modules/reports` :
  narration LLM **100 % locale** (`get_provider`, jamais le cloud) posée sur le **service d'évidence**
  (2e consommateur après le scoring missions). Le LLM **narre et hiérarchise** une évidence
  *calculée* ; il n'invente aucun `skill_id` (revalidés serveur = anti-hallucination). Sortie typée
  versionnée (`CouncilReportSpec` `extra=forbid`, `COUNCIL_PROMPT_VERSION=v1`, une réparation, trace
  `AIJob`). **Rapport PERSISTÉ** : table `council_reports` (migration `b8c9d0e1f2a3`, **appliquée DB
  dev**) + `evidence_snapshot_json` (évidence figée = auditabilité, un artefact LLM n'étant pas
  rejouable). Routes Papa (`require_parent`) : `POST/GET /api/reports/class-council`, `GET /{id}`,
  `POST /create-missions` (pont → `command.create_command_missions`, mono-notion). Front Papa :
  `lib/councilClass.ts` + `hooks/useCouncilClass.ts` + `ConseilClasseIAPage` (mock → réel : Générer /
  Créer / Exporter Markdown, style sombre `papa-*`, logos matières circulaires dorés).

- **ADR-0021 — Équipement de mission** (« Créer ces missions » = **confirmer → équiper → créer**).
  Backend `reports.equip_notion` orchestre les 5 générateurs existants (cours→fiche→SRS→quiz→mindmap)
  et les **auto-valide** ; route `POST /api/reports/class-council/equip-notion`. **On ne régénère
  JAMAIS une pièce déjà créée** (même un brouillon `pending` de Papa) — on génère seulement le
  manquant, et on **valide** l'existant `pending` (helpers en logique d'existence : `_existing_fiche`
  / `_existing_mindmap`, `_has_mission_quiz`, `_has_srs_cards`). Dégradation gracieuse leçon-centrée
  (notion sans leçon validée → contenus sautés + signalés). Front Papa : popup **ConfirmDialog
  `tone="important"`** (cadre doré animé — nouveau ton réutilisable dans `@zetis/ui`) + **barre de
  progression IA dorée** par notion (pipeline des 5 pièces qui s'allument) + **popup éphémère de fin**
  (coche ✓ par pièce) + **badge doré « Missions générées »** sur les notions équipées (persistant, cf.
  décisions).

- **Missions Massimo — « qui a généré » + badge new** (dernier commit). Liste des missions élève :
  chip **👤 par Papa / 🤖 par ZETIS** + badge **✨ new** (style ZETIS de `DeckDisc`) sur les missions
  `planned`. Backend : champ d'**affichage** `origin` (`papa`/`zetis`) sur `MissionStudentOut`, dérivé
  de `created_by` — l'enum interne `created_by` **reste pilot-only** (frontière ADR-0017 §3, test-verrou
  vert). Type partagé `Mission.origin`.

### EN COURS / reste EXACTEMENT

0. **Branche poussée + PR #48 ouverte (MERGEABLE/CLEAN).** → **review + merge**.
1. **Données de test laissées en DB dev** : `council_report` id 1, missions `manual` créées via le
   Conseil de classe, **kits générés** (SVT Magnitude/Foyer, Français, etc. — fiches/quiz/mindmaps/SRS
   validés). Sans conséquence (dev).
2. **Serveurs de vérif encore up possibles** : `backend-dev2` :8002 (frais), `papa-dev2` :5178,
   `massimo-dev2` :5177. Le config `massimo-dev2` a été ajouté à `.claude/launch.json`.

### DÉCISIONS ACTIVES (prises en session — ne pas rouvrir)

- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable → figer + snapshot d'évidence, contraste
  assumé avec l'élection de mission qui ne stocke rien) ; `skill_id` des recommandations **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander ;
  « évolution » comparative et croisées multi-matières **hors v1**.
- **ADR-0021** : la **popup de confirmation Papa vaut approbation** → **auto-validation** du kit
  (soupape §5ter de l'ADR-0017 actée et **bornée** à ce geste) ; **jamais de régénération** d'une pièce
  déjà créée (même `pending`) — seulement validation de l'existant + génération du manquant ; équiper
  **AVANT** de créer la mission (ses étapes résolvent les ressources fraîches).
- **Missions Massimo** : exposer un champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned` (jamais démarrée), aucun suivi de vues.

### PIÈGES (voir aussi `TROUBLESHOOTING.md`)

- **Backends dev sans `--reload`** : `backend-dev2` (:8002) doit être **redémarré** après tout ajout de
  route (equip-notion, origin…) sinon 404 / champ absent. `:8001` (`backend-dev`) est souvent STALE.
- Générateurs (fiche/quiz/mindmap/SRS/cours) **verrouillés à une leçon canonique validée** : une notion
  sans leçon → contenus non générables (dégradation gracieuse signalée).
- `set_lesson_validation(db, id, "validate")` **exige un statut `draft`** ; `generate_lesson_content`
  repasse la leçon en `draft` — d'où l'ordre generate→validate.
- HMR « change in order of Hooks » = **artefact de dev** quand on ajoute/retire un hook ; un **reload
  complet** résout ; l'ordre du code est correct (tsc + build de prod verts).
- `reports/service.py` importe les générateurs en **imports paresseux** (dans la fonction) pour éviter
  tout cycle.

### PROCHAIN PAS

1. **Review + merge de la PR #48** (déjà poussée, MERGEABLE/CLEAN).
2. Suites déjà vertes (`pytest` 379 · `tsc -b` · `vite build` papa+massimo) — relancer une dernière fois
   si besoin après rebase.
3. Débouchés futurs : porte (i) « Recommandation retenue » de l'ADR-0018 (débloquée par cette page),
   « évolution » comparative (slice 2), missions **croisées multi-matières** (ADR dédié à écrire).

### Repères (Git / orientation)

- `git log --oneline main..feat/conseil-classe-backend` = les 10 commits du chantier.
- Zone code : `graphify explain "reports"` / `"missions"`. Back : `app/modules/reports/`
  (`service.py`, `router.py`, `schemas.py`) + `app/prompts/council.py` + `app/modules/evidence/`.
  Front papa : `pages/ConseilClasseIAPage.tsx` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`.
  Front massimo : `pages/MissionsPage.tsx`.
- Décisions figées : ADR-0020 / 0021 (`docs/decisions/`) + `DECISIONS.md`. Modèle : `DATA_MODEL.md`
  (table `council_reports`). API : `API_SPEC.md` §Conseil de classe.
