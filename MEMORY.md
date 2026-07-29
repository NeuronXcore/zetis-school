# MEMORY.md — Mémoire de reprise (raisonnement)

> Mémoire du **raisonnement** au sens `docs/WORKFLOW.md` §3/§6.3 : fait / en cours / à-faire /
> décisions actives / prochain pas. Écrit pour la **prochaine session, sans contexte**.
> L'état du **code** se lit dans Git ; les **décisions figées** dans `DECISIONS.md`/les ADR ;
> le modèle de données dans `DATA_MODEL.md`. Ce fichier ne duplique pas ces sources.

## État à la reprise

**Branche : `feat/agenda-scolaire`** (depuis `main`, 2026-07-29) — chantier **Agenda scolaire
(ADR-0025)**. Le cadrage (maquettes → specs → ADR-0025 → 3 prompts de slice) est **sur `main`**,
commit `8be1e0a`. **Slice A backend FAITE** sur la branche, non commitée au moment d'écrire :

- table `agenda_items` + migration `a1b2c3d4e5f7` **appliquée sur le vrai Postgres de dev** ;
- module `app/modules/agenda/` (schémas séparés Student/Pilot, service, 2 routers) ;
- **559 tests verts** (+17), dont les invariants de l'ADR (Papa ne coche pas → 403,
  `parent_note` jamais côté élève, asymétrie de la bande, aucune mission/SRS dans une surface
  datée, évidence inchangée par une coche) ;
**Slice C (page Papa) FAITE** : route `/agenda` + entrée de sidebar après Dashboard, saisie en
lot (matière · chapitre · intitulé · date · type, un seul envoi), charge de la semaine en
7 colonnes, panneau de détail, note privée, archivage sous `ConfirmDialog`, filtres. **Aucune
case à cocher.** A demandé un **ajout backend décidé avec le user** : table `app_settings`
(migration `b2c3d4e5f8a0`, appliquée) + `GET`/`PUT /api/agenda/settings`, parce que
l'interrupteur d'ouverture de la saisie élève doit être « un geste de Papa sur sa page »
(ADR-0025 §10) — une variable d'env ne peut pas l'être. L'env reste la valeur par défaut.

**Slice B (page Massimo) FAITE** : route `/agenda`, bande glissante 7 jours (traces allumées
sans réceptacle, halo cyan sur aujourd'hui, anneau fuchsia sur un contrôle, emplacement ✦ du
plan laissé vide), sections Aujourd'hui / Demain / suite repliée / Ce qui arrive / À reprendre
(3 max, sans compteur), coche optimiste, résumé d'Accueil au-dessus du canvas Galaxy.

**Accès à l'agenda : DEUX portes, tranché par le user le 2026-07-29** — entrée de sidebar en
position 2 (après Accueil, avant Matières) **et** résumé sur l'Accueil. La spec de page
prévoyait le bandeau seul en phase 0 ; elle a été mise à jour, elle ne contredit plus le code.
Bottom-nav mobile inchangée (arbitrage toujours ouvert, lié à `navigation.md` au BACKLOG).

**Vérification live FAITE (2026-07-29)** — saisie en lot Papa (3 échéances, chapitres du vrai
référentiel) → apparition chez Massimo → coche persistée après rechargement → « cochés par
Massimo : 1 » côté Papa. Elle a rapporté **un bug** (item passé visible dans la bande : la
liste vivante court-circuitait l'asymétrie serveur — corrigé côté client, commit `7cfc7e4`) et
**une décision** : bande élargie à **14 jours, tout vers l'avant** (3 passés / 10 à venir,
réglages `AGENDA_BAND_DAYS_*`, plus rien ne fige l'amplitude). ADR passé **Accepté**,
CHANGELOG 0.27.0 écrit, docs réconciliées (READMEs des deux frontends, modules.md,
DATA_MODEL §AppSetting, API_SPEC §settings, BACKLOG Lot 1 barré).

⚠️ Données de test en base de dev : 3 `agenda_items` (dont 1 coché) + 1 ligne `app_settings`
possible. À purger ou assumer avant la démo.

- **prochain pas : PR vers `main`.** Le composer élève (Lot 1 bis) et le plan de préparation
  (Lot 3) restent fermés — sur décision, pas sur calendrier (revue phase 0 à 4 semaines).

⚠️ **Découverte de la slice A, à ne pas re-débattre** : trois lecteurs de `learning_events`
n'étaient **pas** filtrés par `event_type` — `activity._load_events`,
`activity._trailing_inactive_days`, `motivation._active_days`. Sans exclusion, cocher un devoir
aurait gonflé la heatmap, les minutes actives et les jours de venue. D'où le frozenset
`NON_ACTIVITY_EVENTS` (`activity/events.py`) appliqué à ces trois endroits. `evidence` était
déjà propre (filtré sur `mission_verdict`), `galaxy` aussi (groupé sur `skill_id NOT NULL`).

**Chantier précédent — ZETIS Galaxy : MERGÉ** dans `main` (PR #55, merge `af039d0`).
La section ci-dessous est conservée pour ses pièges, pas pour son état.

Le chantier a été ouvert comme un cadrage (maquette → spec → ADR-0024 → prompts), puis le user a
demandé d'enchaîner l'exécution dans la même session. Les deux slices y sont : backend `galaxy`
(4 routes + frise, **aucune migration**) et frontend Massimo (page Progression refondue + aperçu
sur l'Accueil). **Vérifié à l'écran sur la vraie base**, pas seulement en test.
Voir §« Chantier ZETIS Galaxy » plus bas pour les pièges — ils sont coûteux à re-découvrir.

Le chantier « Couverture de production »
(ADR-0023) est **MERGÉ** : PR [#54](https://github.com/NeuronXcore/zetis-school/pull/54), merge
commit `dc82f9c`, **7 commits conservés individuellement** (merge commit délibéré, pas de squash :
chacun est autonome et revertable seul, ce qui comptait surtout pour `chore(assets)`). Branche
`docs/couverture-production` supprimée en local et sur `origin`.

⚠️ **Ne pas ré-implémenter** la Couverture : elle est complète et sur `main` — backend
(`production` + `engagement` + provenance), page Papa, passe visuelle, convention d'assets.

### Dépôt nettoyé (2026-07-28) — 4 branches et 2 stashes, rien de perdu

**État : `main` seule, local et distant. Zéro branche, zéro stash.**

Les 4 branches supprimées étaient toutes vérifiées fusionnées **avant** suppression, et leurs tips
restent restituables à vie par les refs de PR que GitHub conserve
(`git fetch origin refs/pull/<n>/head`) :

| Branche supprimée | Preuve | Tip archivé |
|---|---|---|
| `feat/activite-backend` | PR #52 · SHA fusionné = tip | `refs/pull/52/head` → `1284deb` |
| `feat/motivation-massimo` | PR #53 · SHA fusionné = tip | `refs/pull/53/head` → `befe91e` |
| `mindmap` | tip ancêtre de `main` | `refs/pull/51/head` → `3d2b499` |
| `mission` | PR #46 · tip ancêtre de `main` | `refs/pull/46/head` → `cb3d581` |

**Les 2 stashes ont été récupérés avant d'être vidés** (commits `08c5723` + `d1b70ba`) :

- `stash@{1}` (4 semaines, `feat/design-system`) portait **deux specs jamais atterries** —
  `docs/frontend-massimo/navigation.md` et `zetis-galaxy.md`, 265 lignes. Vérifié : « galaxy »
  n'existait nulle part ailleurs dans le dépôt. ⚠️ Elles arrivent avec un **bandeau de réserve** :
  elles se déclarent normatives alors qu'elles n'ont jamais été confrontées au code, et 4 semaines
  de développement ont passé. **Ne pas les faire appliquer sans les vérifier ligne à ligne.**
  ZETIS Galaxy reste une conception **non implémentée**.
- `stash@{0}` (24 h) enrichissait l'index des ADR. Repris : les descriptions 0001→0005 et les
  amendements ADR-0017. Le reste (0012→0019) existait déjà dans `main` sous une formulation plus
  récente — sa version de `DECISIONS.md` était antérieure à l'ADR-0023, la restaurer en bloc aurait
  fait régresser le fichier. Écart connu et assumé : pour ADR-0018 et ADR-0019, la ligne d'index du
  stash était plus longue que celle de `main` ; les ADR eux-mêmes sont intacts.

⚠️ **Deux pièges de diagnostic**, à connaître avant de refaire ce contrôle :

- **`git branch --merged` ne liste PAS `activite` ni `motivation`.** Les PR #52 et #53 ont été
  **squashées** : les commits d'origine ne sont donc pas ancêtres de `main`, seul leur contenu y
  est (`6e7cb78`, `40bcef8`). L'outil dit vrai sur la topologie et faux sur le fond — s'y fier
  seul ferait conclure à du travail perdu.
- **Le diff de contenu vs `main` n'est pas un test** : 1188 et 484 lignes d'écart, mais c'est
  `main` qui a avancé depuis sur les mêmes fichiers. Comparer un tip figé à une trunk qui bouge ne
  prouve rien.

Le seul test qui tranche pour une branche squashée : **`gh pr view <n> --json headRefOid`** (le SHA
que GitHub a réellement fusionné) comparé au tip local **et** distant. S'ils sont identiques, rien
n'a été poussé après la fusion.

### Session 2 (2026-07-28) — passe visuelle `/couverture` + rangement des assets

La passe visuelle demandée au « prochain pas » a été faite, **pilotée par le user** qui regardait
la page dans son propre navigateur (l'agent n'a jamais eu de session Papa : il ne saisit pas de
mot de passe). Quatre retours, quatre livrables — détail dans `docs/frontend-papa/page-couverture.md`
§Passe visuelle :

1. **KPI cliquables** → chacun ouvre son complément (« 27/78 cours » ouvre les 51 restants). La
   pilule « 🔒 Bloquées » a été **scindée** en `🔒 Non validées` / `📝 Sans cours` : elle mélangeait
   les deux causes, or `blocked_no_course` ne contient que des leçons *validées* — « Leçons
   validées » ne pouvait pas pointer dessus sans se contredire.
2. **Pictogrammes de matière** sur les en-têtes de matrice **et** en pastilles de filtre (le
   `<select>` a disparu). `SubjectPictogram` extrait de `SubjectFilterChips` → un seul rendu.
3. **Expanders par matière** : repliés en vue d'ensemble, dépliés dès qu'un filtre ou une matière
   est demandé, avec rappel d'anomalies (`🔒 4  ⏳ 2`) calculé sur la matière **entière**.
4. **Icône `CouvertureIcon`** (fournie par le user) + respiration lumineuse, aux 3 endroits qui
   désignent la Couverture (en-tête animé, sidebar, relais Dashboard).

**Rangement des assets, hors chantier mais demandé explicitement** (« mets de l'ordre », puis
« go ») : ~9,8 Mo retirés des bundles (Massimo 10,3 Mo → 1,6 Mo ; Papa 2,1 Mo → 1,0 Mo), 11
originaux rapatriés dans `assets/brand/icons/`, 2 doublons exacts supprimés, planche de contact
sortie du glob. La **règle a été inversée** dans `assets/brand/README.md` : les visuels importés
vivent dans `src/assets/`, pas dans `public/assets/` — c'est ce que le code faisait déjà, la doc
avait tort. Voir §DÉCISIONS ACTIVES.

**Vérifié** : 212 Papa + 111 Massimo verts, `tsc -b` et `vite build` verts sur les deux apps.
L'icône et son animation ont été prouvées sur un **banc d'essai isolé** (le navigateur intégré
n'étant pas connecté) : capture + `getAnimations()`. Le reste de la page **n'a toujours pas été vu
de bout en bout par l'agent**.

### Chantier « Couverture de production » (ADR-0023) — CLOS

Quatre commits, dans cet ordre (chacun dépend du précédent) :

1. **`8c993b6` docs** — ADR-0023 + addenda ADR-0011 §E (fraîcheur) et §F (provenance), 4 ADR
   amendés, maquette + spec + 2 prompts de slice.
2. **`02f37a9` engagement** — prérequis : module neutre `engagement` + exception « mission
   engagée » sur les chemins d'achèvement des mindmaps.
3. **`586b202` production (backend)** — `is_stale`, provenance (migration `d5e6f7a8b9c0`),
   modèle de lecture + 2 endpoints `require_parent`.
4. **(ce commit) frontend + correctifs** — page Couverture, liens ciblés, validation en lot,
   et deux défauts de schéma/UX corrigés (voir ci-dessous).

**Migrations appliquées sur la DB de dev** : `d5e6f7a8b9c0` (provenance, 6 tables, reprise NULL)
et `e6f7a8b9c0d1` (horodatages `fiches`/`mindmaps`).

**Vérifié** : 518 back + 203 Papa verts, `tsc -b` et `vite build` verts, un seul head alembic.
Modèle de lecture éprouvé sur **Postgres réel** (69 leçons, 18 requêtes, 79 ms — aucun N+1).

⚠️ **Ce chantier n'a PAS été vérifié à l'écran de bout en bout** : la session Papa du navigateur
intégré a expiré en cours de route, et l'agent ne saisit pas de mot de passe. Le user a testé
manuellement et a remonté 3 défauts réels que les tests ne voyaient pas (cf. `TROUBLESHOOTING.md`
§ chantier `couverture`). **La prochaine session doit commencer par une passe visuelle.**

### Ce que le user a remonté et qui reste ouvert

- **Colonne Fiche** : le lien ciblé surligne la carte mais n'ouvre pas sa modale — volontaire
  (c'est un ÉDITEUR, pas une vue), à trancher si la symétrie avec quiz/mindmap est préférée.
- **Ouverture auto de la modale mindmap** : ajoutée sur un malentendu de ma part (le user parlait
  de la colonne *Cartes*, pas *Mindmap*). Défendable en soi — à confirmer ou retirer.
- **5 générations non voulues** dans la DB dev (jobs #316→#320), **gardées** sur décision du user.
  « Calculs avec priorités et nombres relatifs » reste en `draft` : son cours vient d'être rédigé,
  le gate ADR-0009 §A joue son rôle — **ne pas la revalider mécaniquement**.

### Derniers chantiers mergés (repères)

- **Conseil de classe IA (ADR-0020) + équipement de mission (ADR-0021)** — PR #48 (`639209e`).
  Module backend `reports` : narration LLM **locale** sur le service d'évidence, rapport **persisté**
  (`council_reports` + `evidence_snapshot_json`, migration `b8c9d0e1f2a3`), recommandations typées →
  missions via Commander ; **équipement** = « Créer ces missions » génère + auto-valide le kit
  (cours/fiche/SRS/quiz/mindmap), **jamais de régénération** de l'existant. Front Papa
  (`ConseilClasseIAPage` + `lib/councilClass.ts` + `hooks/useCouncilClass.ts`) + liste missions
  Massimo (`origin` papa/zetis + badge ✨ new).
- **Missions ADR-0017/0018/0019** (moteur, Commander, step mindmap, frontends) — PR #46.
- **`generate_revision` mono-notion** (ADR-0017 §5) — PR #47.

### DÉCISIONS ACTIVES (figées — ne pas rouvrir ; détail dans les ADR)

- **Couverture** : `absent` se déduit de **l'existence de la ligne**, jamais d'une date — une
  date nulle rend seulement le *périmé* indécidable. Le **cours n'entre pas** dans le pourcentage
  de dérivés (il en est la condition). **Aucun agrégat de provenance** (§F.2), aucun tri, aucun
  score par matière : la page répond à « où j'en suis », elle ne produit pas un classement.
- **§F** : `mark_validated` est l'**unique** point d'écriture de `validated` ; toute action
  groupée écrit `parent_bulk` **sans exception** ; `system` est **strictement réservé au quiz**
  (test-verrou). Une leçon déjà validée n'est jamais re-tamponnée par un lot.
- **Assets (session 2)** — l'original pleine résolution va dans `assets/brand/`, la **réduction**
  (suffixe `_256` / `_384`, dimensionnée sur le rendu réel **× 3** car Massimo tourne sur iPhone)
  va là où le code l'importe : `packages/ui/src/assets/` si les deux interfaces s'en servent,
  `apps/frontend-<app>/src/assets/` sinon. **`public/assets/` n'est plus le point de dépôt** — un
  `import` TS fait échouer le build si le fichier manque, hashe le nom pour le cache, et sort du
  bundle ce qui n'est plus utilisé. Règle complète : `assets/brand/README.md`.
- **Couverture — KPI** : un KPI ouvre son **complément**, pas ce qu'il compte (un chiffre atteint
  ne se travaille pas). Les cartes restent cliquables même à zéro (choix du user).
- **Couverture — expanders** : repliés en vue d'ensemble, **dépliés dès qu'on demande quelque
  chose d'explicite** (pilule d'état ou matière). On ne cache jamais ce qui vient d'être demandé.
  Les rappels d'anomalies sont des **comptes**, jamais un pourcentage — le « aucun score par
  matière » ci-dessus tient toujours.
- **Vocabulaire** : « Mindmap » ≠ « carte (de révision) ». Ne jamais écrire « carte mentale »
  dans l'UI Papa — les deux colonnes sont voisines dans la matrice.
- **Capsules** : non générables en un clic **par construction** (l'API exige une `instruction`
  écrite par Papa). Depuis la Couverture, on ouvre le compositeur pré-rempli — avec `skill_id`,
  sans quoi la capsule ne compte dans aucune fraction.

- **Activité — 2 `event_type` RÉUTILISÉS au lieu d'être dupliqués.** La spec demandait
  `eli5_reverse` et `mission_completed` ; le code émettait déjà, au même instant et pour le même
  acte, `reverse_eli5` (`eli5/service.py`) et `mission_verdict` (`missions/service.py`, posé là
  où `mission.status` passe à `completed`). Les ajouter aurait créé **deux événements pour un
  seul acte** → double comptage dans la heatmap ; les renommer aurait cassé leurs lecteurs
  (`evidence.VERDICT_EVENT`, `completed-today`). Constantes `EVENT_ELI5_REVERSE` /
  `EVENT_MISSION_COMPLETED` dans `activity/events.py`. **7 hooks neufs, pas 9.**
- **Activité** : `POST /api/missions/{id}/complete` de la spec **n'existe pas** et n'a pas été
  créé — les missions se terminent par étape (`/{id}/steps/{step_id}/complete`).
- **Activité** : sessions **jamais stockées** (reconstruites à la lecture) ; `xp_events` et
  `learning_events` **jamais en UNION** ; `days_inactive` toujours calculé **toutes matières**,
  même sous filtre.
- **ADR-0020** : rapport Conseil **persisté** (LLM non rejouable) ; `skill_id` **ancrés** sur
  l'évidence ; 100 % local ; Papa-only ; recommandation → missions **mono-notion** via Commander.
- **ADR-0021** : popup Papa = approbation → **auto-validation** du kit (soupape §5ter bornée) ;
  **jamais de régénération** d'une pièce déjà créée (même `pending`) — on valide l'existant + génère
  le manquant ; équiper **avant** de créer la mission.
- **Missions Massimo** : champ d'affichage `origin` (papa/zetis), **pas** l'enum `created_by`
  (pilot-only) ; badge « new » = mission `planned`.

### Chantier ZETIS Galaxy — CADRÉ **ET LIVRÉ** le 2026-07-28

Branche `feat/galaxy`, poussée. **PR à ouvrir.** 157 tests Massimo + 542 backend, typecheck
Massimo + Papa, build — verts. Vérifié **à l'écran sur la vraie base** (Postgres + backend :8003).

**Livré** : cadrage complet (maquette, spec réécrite, ADR-0024, 2 prompts) **+** module backend
`galaxy` (4 routes élève + frise, **aucune migration**) **+** frontend Massimo (page Progression
refondue, aperçu Accueil 2 colonnes, brique `@zetis/ui/galaxy` + sous-chemin `/canvas`).

⚠️ **Ne pas ré-implémenter.** Détail des routes : `API_SPEC.md` §ZETIS Galaxy.

**Trois amendements de l'ADR-0024, tous par décision explicite du user en cours de session** —
ils sont écrits dans l'ADR avec leur date et leur coût, ne pas les rouvrir sans raison :

1. **§9 rouvert** : un graphe **global** existe sur l'Accueil, alors que l'ADR l'excluait. Coûts
   bornés (canvas en `lazy()`, repli sur matières+chapitres au plafond), pas ignorés.
2. **§4 révisé** : la panoplie **complète** est renvoyée avec `available`, au lieu d'omettre
   l'indisponible. Justification : une fiche manquante n'est pas un échec de l'enfant.
3. **2D → 3D** : `@xyflow/react` avait été retenu pour son coût nul, puis disqualifié par
   l'exigence 3D. Deux moteurs graphe coexistent ; **ADR-0016 non rouvert**, les mindmaps gardent
   React Flow.

**Ce que le read-before-code a invalidé dans le brouillon** — à ne pas re-découvrir :

1. **`Skill.prerequisite_skill_ids` n'existe pas** (ni colonne, ni table) et **`parent_skill_id` est
   NULL partout** (`curriculum/service.py:501-521` ne l'écrit jamais). Les « liens stellaires »
   n'avaient **aucune source de données**. → arêtes dérivées de
   `Skill ← lesson_skills → Lesson → Chapter`, rien d'autre.
2. **`GET /progress/skills` n'existe pas**, et `progress` est **Papa-only** (`require_parent`).
   → trois routes élève neuves sous `/api/student/galaxy`.
3. **`/progression` est déjà un onglet** avec une page XP/badges, dont la section « par matière »
   est **mockée**. → la Galaxy prend sa place, l'existant prime sur `navigation.md`.
4. **Seul ELI5 est notion-adressable par URL** (`/eli5?skill_id=N`) ; Quiz et Révision passent par
   `location.state`, Cours/Fiches/Mindmaps par matière. Et **aucune fonction backend** ne dit « pour
   ce `skill_id`, quels contenus validés existent » (`production/coverage.py` est leçon-centrée
   **et** Papa-only). → 3ᵉ route `galaxy/notion/{skill_id}`, réutilisant les résolveurs de
   `missions/service.py:76,98`.

**Pièges rencontrés À L'EXÉCUTION** — chacun a coûté un aller-retour, aucun n'est théorique :

- `SkillMastery.status` a **SIX** valeurs, pas cinq : `in_progress` est écrit par
  `missions/service.py:859` et ne sort d'aucun `_status_from_score()`. Un mapping à 5 branches le
  manque **en silence**.
- `mastery_score` est sur **0–100** ; `evidence.mastery_by_skill()` renvoie la valeur **brute**.
- **Massimo a trois postes, pas un** (précisé par le user le 2026-07-28) : **iPhone, iPad et un
  MacBook dédié à l'école**. Ne pas re-rédiger « l'iPhone est la cible » — c'est le poste le plus
  **contraint**, et ce sont l'iPad et le MacBook qui donnent son sens à la 3D. D'où un plafond de
  nœuds **adaptatif** (40 / 90 / 150, provisoire) et l'interdiction de faire dépendre quoi que ce
  soit d'essentiel du **survol**, qui n'existe pas au tactile.
- **Le `lazy()` ne suffit pas à isoler Three.js.** Ré-exporter le canvas depuis le baril
  `@zetis/ui/galaxy` le faisait entrer dans le bundle de départ (**3,6 Mo**, mesuré). D'où le
  sous-chemin dédié `@zetis/ui/galaxy/canvas`. Ne pas « simplifier » ce baril.
- **Un matériau très émissif APLATIT une sphère** : elle s'éclaire uniformément, plus d'ombrage
  ni de reflet, elle se lit comme un disque. Vrai pour le soleil comme pour le cerveau — garder
  l'émission basse et mettre l'éclat dans les **aures**.
- **Un panneau face caméra est plat par construction** : le pictogramme de matière plaqué sur le
  soleil masquait le limbe ombré. Il a été retiré du soleil (il reste sur l'écran d'ensemble).
- **Sans nœud racine, les composantes se disloquent** (le moteur de forces éloigne les
  composantes disjointes) — d'où `subject` dans une constellation et `root` dans le graphe global.
- **La remontée de l'or doit être TRANSITIVE** : un seul cran suffit dans une constellation mais
  pas dans le graphe global (3 niveaux) — les liens du cerveau restaient éteints.
- **Tailwind v4 pose `cursor: default` sur les `<button>`** (changement vs v3) : `cursor-pointer`
  est explicite partout où l'interactivité doit se voir.
- **En construisant soi-même les objets 3D, `nodeVal`/`nodeColor`/`nodeRelSize` cessent de
  s'appliquer** — reproduire la formule de la lib (`∛volume × rayon`), sinon les nœuds
  rapetissent d'un coup et deviennent inatteignables au doigt.
- **`GalaxyCanvas` ne filtre plus les clics** : il filtrait sur `kind === "skill"` et avalait les
  clics sur les soleils. C'est l'appelant qui décide du sens d'un clic.

**Vérification : mesurer que ça BOUGE ne prouve pas que ça se VOIT.** Trois rendus ont dû être
repris parce que je validais une propriété calculée (`background-position` qui change, animation
déclarée) au lieu de comparer deux captures d'écran. Les captures comparées sont le seul test
utile sur du visuel.

**Vérifié par le user (2026-07-28)** : **MacBook OK**, l'animation est fluide au plafond desktop
(150 nœuds). C'était le poste le plus confortable des trois.

**Reste ouvert** :

- **iPhone et iPad non essayés.** L'iPhone est le poste contraint : c'est lui qui décide si le
  palier `compact` (40) doit baisser. Si ça coince, on baisse CE palier — on ne retire pas la 3D
  des deux autres.
- **`prefers-reduced-motion` toujours non vérifié à l'écran.** Le panneau navigateur ne l'émule
  pas, et le retour « ça bouge sur mon Mac » prouve justement que l'option est **désactivée**
  chez le user — donc le chemin où tout doit se figer n'a jamais été exercé en vrai. Couvert par
  tests unitaires (`particlesFor`) et par la variante `motion-safe:`, rien de plus.
  Pour l'essayer : Réglages Système → Accessibilité → Affichage → Réduire les animations.

### PROCHAIN PAS

0. **Ouvrir la PR de `feat/galaxy`** — la branche est poussée, rien n'est mergé.
   Vérifications à la charge du user, que l'agent ne peut pas faire : **MacBook ✅ fait**,
   restent **iPhone + iPad** (plafonds 40/90 provisoires) et **`prefers-reduced-motion`**.
1. **Trancher le sort de la photo de Massimo** —
   `apps/frontend-massimo/src/assets/app/ChatGPT Image 5 juil. 2026, 14_36_01.png` (2 Mo, 1254 px)
   est une **photo du visage de l'enfant** montée dans une icône de progression. Elle est
   versionnée, **importée nulle part** (elle ne pèse que dans git). Laissée intacte
   volontairement : l'agent ne décide pas seul du sort d'une image d'un mineur. Trois options —
   garder / renommer et ranger dans `assets/brand/icons/` / sortir du dépôt.
2. **Une fois la Galaxy mergée**, au choix : **file de relecture** (prérequis dur du cron
   ADR-0023 — automatiser la fabrication d'un goulot est le seul vrai risque), ou **production
   en lot** (§7 : deux passes non fusionnables, cours puis équipement), dont le bouton
   « ⚡ Compléter le chapitre » marque déjà l'emplacement, désactivé.
3. ~~ZETIS Galaxy = chantier à ouvrir~~ → **LIVRÉ le 2026-07-28**, cadrage et code.
   Voir §« Chantier ZETIS Galaxy ». Suites possibles, hors v1 : graphe de **prérequis** (la
   donnée n'existe pas, c'est un chantier pédagogique à part), annonce « +1 étoile » en fin de
   mission, animation temps réel poussée par événement, réconciliation de `navigation.md`.
4. Restent ouverts, sans urgence : le **test flaky** `ProgrammePage` (barre de progression
   temporisée, cf. `TROUBLESHOOTING.md`), et la **vérification à l'écran de bout en bout** de la
   Couverture, que l'agent ne peut pas faire sans session Papa.

### Repères (orientation)

- `graphify explain "production"` / `"provenance"` / `"engagement"`. Back :
  `app/modules/production/` (modèle de lecture), `app/modules/provenance.py` (unique écrivain de
  la validation), `app/modules/engagement/` (exception mission engagée). Front papa :
  `CouverturePage.tsx`, `components/couverture/`, `lib/pilotageLinks.ts`, `hooks/useCoverage.ts`,
  `lib/coverageFilters.ts` (fonctions pures : pilules + `subjectAnomalies`),
  `components/CouvertureIcon.tsx`. Partagé : `packages/ui/src/components/subject-pictogram.tsx`.
- Visuels : `assets/brand/README.md` §Règle principale (source de vérité de la convention).
- Décisions : `DECISIONS.md` (index ADR complet 0001→0023, avec les 3 addenda ADR-0009/0011) +
  `docs/decisions/`. Modèle : `DATA_MODEL.md`. API : `API_SPEC.md`. Pièges : `TROUBLESHOOTING.md`.
- Données de test laissées en DB dev (council_report id 1, missions manual, kits générés) — sans
  conséquence.
