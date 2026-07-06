# ADR-0017 — Arbitrage des missions (moteur de prochaine meilleure action)

## Statut

Proposé — 2026-07-05. Draft préparé pendant le chantier référentiel ; ouverture
du chantier missions après clôture du chantier actif (règle mono-chantier).

> **Amendement acté à l'implémentation du Lot 1 (2026-07-05).** Read-before-code : la
> prémisse « `MissionStep.resource_id` existe déjà → **zéro migration** pour le ciblage »
> (décision 5) était **fausse** contre le modèle réel — le champ n'existait pas, et le
> vocabulaire `step_type` réel était `explain`/`reverse`/`quiz` (≠ `eli5`/`vocal_explain`/`quiz`).
> Stop-on-blocker → décisions validées avec le commanditaire :
> 1. `mission_steps.resource_id` **ajouté** à la migration `f3a4b5c6d7e8` (le ciblage l'exige) ;
> 2. `step_type` réels **migrés** `explain→eli5`, `reverse→vocal_explain` (alignement ADR/DATA_MODEL) ;
> 3. la preuve « postérieure au start » impose de **persister `missions.started_at`** (même migration) ;
> 4. l'auto-génération du quiz de mission (« générer via ADR-0014 si absent », déc. 5) est
>    **reportée au Lot 2** : le moteur quiz est verrouillé à une leçon validée + LLM, indisponible
>    pour une lacune de diagnostic sans leçon. Lot 1 : réutilise un quiz prêt couvrant la notion,
>    sinon l'étape quiz est omise (mission à 2 étapes → verdict `review_later` par défaut, la
>    notion revient via SRS). Générateur `generate_remediation` resté **pur-DB** (déterministe).

> S'appuie sur : `adr-0009`/`adr-0010` (les `Skill` sont le référentiel durable,
> y compris les notions de rattrapage skills-only), l'étape 15 (missions de
> remédiation à étapes **déterministes**, décision réaffirmée ici), `adr-0008`
> (frontière locale : aucune donnée de Massimo vers le cloud). Ne modifie pas
> `adr-0011` (le résolveur canonique reste consommé par les *dérivés* ; le
> sélecteur de mission n'appelle aucun LLM).

## Contexte

L'étape 15 a livré une **boucle de remédiation** : lacune ouverte (`gaps`) →
mission à 3 étapes → complétion déclarative → lacune résolue + XP. Trois limites
structurelles la séparent de la vision produit (`PRODUCT_SPEC.md`, parcours
`Accueil → Mission du jour → ELI5 → Quiz → Feedback → XP` ; `page-accueil.md`,
carte « Mission du jour » avec une *raison*) :

1. **Source unique** : seules les lacunes de diagnostic produisent des missions.
   Or trois autres gisements existent ou arrivent : les révisions espacées dues
   (`spaced-reviews/due`), la **progression programme** (les `Skill` du
   référentiel ADR-0009, dont les notions de rattrapage ADR-0010 — qui notait
   déjà « l'ordonnancement fin des missions de rattrapage » comme chantier
   ultérieur : c'est ici), et les missions manuelles Papa (reporté étape 15).
2. **Pas de sélection** : `GET /missions/today` renvoie une liste triée par
   priorité ; l'Accueil suppose *une* mission élue, avec une raison lisible
   (« parce que cette notion revient bientôt »).
3. **Divergence de vocabulaire constatée sur pièce** : `DATA_MODEL.md` documente
   `mission_type = learn | practice | revise | explain | capsule | mindmap`
   (orienté *activité*), mais l'implémentation de l'étape 15 écrit
   `mission_type = remediation` (orienté *source/intention*). Les deux
   coexistent sans arbitrage documenté.

Le sujet de cet ADR n'est pas « ajouter des missions » mais **« qui décide de la
mission du jour, et comment »** — et comment cette décision reste auditable,
reproductible et non anxiogène.

## Alternatives considérées

- **Planificateur LLM** (le modèle choisit la mission du jour) : séduisant, mais
  non reproductible (deux exécutions ≠ même choix), inauditable (« pourquoi
  cette mission ? » sans réponse mécanique), et introduirait de la variabilité
  dans le seul endroit où Massimo a besoin de constance. Contraire à l'esprit de
  la décision étape 15 (étapes déterministes = robustes et testables). → Écarté.
- **Pilotage 100 % manuel Papa** (Papa compose et choisit) : double rejet.
  Charge quotidienne que ZETIS existe pour supprimer (`PRODUCT_SPEC.md`), et
  surtout **composition à l'aveugle** : Papa n'a pas l'évidence (mastery par
  skill, verdicts pondérés ADR-0014, lacunes) — le but des missions est de
  corriger les faiblesses *mesurées*, pas supposées. Papa reste commanditaire
  et validateur (décision 1), jamais compositeur solitaire.
  → Écarté comme mécanisme principal.
- **File FIFO / priorité statique** (l'existant prolongé) : ignore les révisions
  dues et la variété des matières ; une lacune sévère monopoliserait l'Accueil
  des semaines. → Écarté.
- **Vocabulaire `mission_type` orienté activité** (celui de `DATA_MODEL.md`) :
  redondant — l'activité est déjà portée par `MissionStep.step_type`
  (`lesson | eli5 | quiz | mindmap | capsule | vocal_explain`). Le type de la
  mission doit dire *d'où elle vient et pourquoi*, pas *ce qu'on y fait*.
  → Écarté ; `DATA_MODEL.md` à corriger (Suivi).

## Décision

1. **Vocabulaire fermé de `mission_type`, orienté source** :
   `remediation | revision | progression | manual`.
   - `remediation` : issue d'une lacune ouverte (existant, inchangé).
   - `revision` : issue des cartes de répétition espacée dues.
   - `progression` : issue du référentiel — prochaine notion non maîtrisée d'un
     chapitre actif, ou notion de rattrapage (ADR-0010) jamais travaillée.
   - `manual` : **commanditée par Papa, jamais composée par lui seul**
     (`created_by = parent`). Papa apporte l'**intention**, sous trois formes :
     (i) une recommandation retenue du Conseil de classe
     (`page-conseil-classe-ia.md`, scope déjà résolu) ; (ii) une échéance
     (« contrôle jeudi », scope = chapitre) ; (iii) une **thématique** —
     sélection dans le référentiel (matière/chapitre/notions) ou texte libre
     **résolu en `Skill` par similarité d'embeddings** (nomic + pgvector
     existants, read-only, classement `similarité × fragilité` — zéro
     dépendance nouvelle). **⚠️ Voir ADR-0018 — constat read-before-code : la
     prémisse « embeddings existants » est fausse contre le modèle réel (`Skill`
     n'a pas de colonne d'embedding, seul `RagChunk` en a). La voie texte libre
     est reportée ; la v1 de la porte (iii) se limite à la sélection dans le
     référentiel.** Dans les trois cas, ZETIS compose depuis son
     évaluation pédagogique (mastery par skill, lacunes, verdicts pondérés
     ADR-0014) les notions les plus fragiles *du scope* ; Papa confirme via un
     flux preview/confirm sans état (patron ADR-0010 : rien en base avant
     confirmation). La preview affiche les notions résolues, **décochables** —
     garde-fou indispensable pour la voie (iii), le texte libre étant flou par
     nature. Priorité forcée optionnelle (une mission « avant le contrôle »
     peut court-circuiter le score, jamais l'inverse). **Aucun formulaire de
     création vierge n'existe.**
   L'activité reste dans les étapes ; aucun nouveau `mission_type` sans révision
   de cet ADR. `DATA_MODEL.md` est aligné sur ce vocabulaire.

2. **Arbitrage = scoring déterministe côté serveur, zéro LLM.** Chaque mission
   candidate (`planned`/`active`, `available_from` atteint) reçoit un score
   composé de facteurs nommés :
   - `severity` : sévérité de la lacune liée (remediation) ;
   - `due_pressure` : nombre/retard des cartes SRS dues (revision) ;
   - `continuity` : chapitre en cours vs rattrapage ancien (progression) ;
   - `variety` : malus si la même matière a été élue la veille (anti-répétition) ;
   - `forced_priority` : plancher des missions manuelles Papa.
   Les pondérations vivent dans la config (`config.py` + `.env.example`), pas
   dans le code du service. La formule est **versionnée**
   (`MISSION_SCORING_VERSION`, `v1`) : tout changement de facteur ou de
   pondération = bump, tracé dans la sortie du sélecteur — même principe que
   `CURRICULUM_PROMPT_VERSION`. Dès qu'un mécanisme décide à la place de
   quelqu'un, on doit pouvoir répondre après coup à « pourquoi cette mission ce
   jour-là ? ».

3. **Contrat de `GET /missions/today` (breaking, assumé)** : la réponse passe de
   « liste triée » à un objet `{ elected: MissionOut | null, reason: str,
   reason_code: str, scoring_version: str, alternatives: [MissionOut] }`.
   - `reason` est une **phrase template** choisie par le facteur dominant du
     score (ex. `due_pressure` → « parce que cette notion revient bientôt »),
     jamais générée par LLM — vocabulaire bienveillant de `CLAUDE.md` garanti
     par construction.
   - `alternatives` (2 max) alimente les raccourcis de l'Accueil sans imposer.
   - `elected: null` = l'état « Aucune mission » de `page-accueil.md` (« Tu n'as
     rien d'obligatoire maintenant »), servi tel quel, sans mission de
     remplissage artificielle.
   - **Frontière de schémas** (séparation Massimo/Papa) : deux schémas, deux
     routers — `MissionStudentOut` (sans scores, facteurs, seuils ni motifs de
     génération) et `MissionPilotOut` (sur-ensemble analytique). Jamais un
     schéma unique filtré en aval : un champ présent dans la réponse réseau
     est un champ exposé, quoi qu'en fasse l'UI.

4. **Garde-fous anti-anxiété = invariants serveur, pas préférences UI** :
   - une mission non faite **réintègre le pool** sans pénalité de score, sans
     compteur de retard, sans état « en retard » exposé à l'enfant ;
   - le statut `failed` de `Mission` n'est **jamais** écrit par un flux enfant
     (réservé à un usage administratif Papa éventuel) ;
   - une seule mission élue par jour ; budget cible ~15 min par mission
     (contrainte de *génération* des étapes, pas de chronomètre affiché) ;
   - pas de génération compensatoire : deux jours sans activité ne produisent
     pas deux missions le troisième jour.
   Ces invariants sont testés (un test par invariant, comme les invariants de
   frontière cloud de l'ADR-0010).

5. **Générateurs par source, même moteur d'étapes — une mission est un
   *parcours mixte*, jamais une activité unique.** Chaque source a son
   générateur idempotent (le `generate-remediation` existant devient le premier
   d'une famille : `generate-revision`, `generate-progression`), tous produisant
   des étapes **déterministes** via des templates pédagogiques nommés qui
   composent les modules réels de ZETIS :

   ```txt
   remediation / progression :
     1. Découvrir    step_type=eli5          → ELI5 explain (skill_id)
     2. Verbaliser   step_type=vocal_explain → ELI5 reverse, score retourné
     3. Mini-quiz    step_type=quiz          → quiz réel (context=mission), score
   revision :
     1. Cartes dues  step_type=lesson|eli5   → relecture / rappel court
     2. Mini-quiz    step_type=quiz          → récupération active, score
   ```

   Chaque `step_type` a une **preuve d'exécution** définie : une étape `quiz` ne
   peut être complétée que si une `QuizAttempt` (`context=mission`) existe pour
   son `resource_id` ; une étape `vocal_explain` que si un score reverse a été
   retourné ; une étape `eli5`/`lesson` est complétée à la consultation. Deux
   règles constitutives de la preuve : elle doit être **postérieure au `start`
   de la mission** (une vieille `QuizAttempt` ne valide pas une étape jamais
   travaillée), et les étapes se complètent **dans l'ordre** (`sort_order`) —
   le parcours pédagogique n'a de sens que séquencé. C'est ce
   qui ferme définitivement la complétion déclarative de l'étape 15 : le serveur
   vérifie la preuve, il ne croit pas le client. Constat sur `DATA_MODEL.md` :
   `MissionStep.resource_id` et le vocabulaire `step_type` existent déjà — le
   ciblage réel n'exige a priori **aucune migration** ; à vérifier sur le modèle
   réel avant tout code (règle read-before-code). Les templates sont des
   fonctions pures versionnées avec le scoring (`MISSION_SCORING_VERSION` couvre
   formule *et* templates : un changement de parcours change ce que « mission »
   veut dire, il se trace pareil).

   - **⚠️ Amendé (slice frontend Massimo) — l'ORDRE dépend du type, ELI5 pas
     toujours en tête.** Le bloc de templates ci-dessus fixait « découverte
     d'abord » pour tous. Correction pédagogique (effet de test) : `progression`
     (notion **nouvelle**) garde la découverte d'abord (`eli5 → vocal_explain →
     [mindmap] → [quiz]`) ; `remediation` et `revision` (notion **déjà vue**)
     passent au **rappel d'abord** (`[mindmap] → [quiz] → eli5 [→ vocal_explain]`).
     `manual` n'est pas réordonné (Papa compose). Sans ressource de rappel (ni
     carte ni quiz), les deux ordres coïncident. Le front est **agnostique** : il
     rend le `sort_order` servi et n'ouvre que l'étape courante ; la preuve de
     chaque `step_type` est inchangée. Bump `MISSION_SCORING_VERSION` couvre déjà
     les templates.
   - **Exécution frontend : activités EN MODALE in-page.** Chaque `step_type`
     s'ouvre dans une modale (`ActivityModal`) sur `/missions` (jamais de
     redirection) ; la preuve est produite DANS la modale et l'étape validée
     aussitôt (`completeStep`), verdict inline en fin de mission. Une seule modale
     ELI5 couvre `eli5` + `vocal_explain`. Aucun marqueur de retour.

5bis. **Verdict d'acquisition découplé de la complétion (mise en conformité
   avec les règles métier de `DATA_MODEL.md`).** Les règles métier existantes
   exigent que la maîtrise combine « score moyen, récence, répétitions
   réussies, capacité à expliquer » et qu'une lacune ne soit résolue que sur
   « plusieurs réussites, explication reverse correcte, score stable » — or
   l'étape 15 résout la lacune sur simple complétion. Correction :
   - **Compléter ≠ acquérir.** La mission se termine quand toutes les étapes
     ont leur preuve ; l'XP est crédité **dans tous les cas** (l'XP récompense
     l'effort, règle XP de `DATA_MODEL.md`). Arbitrage de l'incohérence
     documentaire : **+50 XP** (valeur `DATA_MODEL.md` retenue ; `API_SPEC.md`,
     qui disait +20, est corrigé).
   - Le **verdict d'acquisition** est calculé à la complétion à partir des
     preuves : score reverse ≥ seuil ET score quiz ≥ seuil → `skill_mastery`
     mis à jour à la hausse, lacune liée → `resolved`. Sinon → `skill_mastery`
     mis à jour honnêtement, lacune → `in_progress`, et une carte SRS est
     (re)programmée : la notion **revient d'elle-même**, via la source
     `revision` — c'est la boucle qui vérifie l'acquisition dans le temps,
     conformément à « plusieurs réussites espacées ».
   - Seuils dans la config (voisins des pondérations), versionnés avec elles.
   - **⚠️ Amendé par ADR-0019 (verdict, option B)** : le signal de *rappel* peut
     être prouvé par le quiz **ou** par une reconstruction de mindmap
     (`acquired = reverse≥t ET (quiz≥t OU mindmap≥t)`). La réexplication reste
     toujours requise. Bump `MISSION_SCORING_VERSION` v2→v3.
   - **Formulation enfant : deux issues, toutes deux positives.** « Mission
     terminée ! +60 XP — la notion est bien en place ✓ » ou « Mission
     terminée ! +60 XP — on la reverra bientôt, tranquille. » Jamais de refus
     de complétion, jamais de « raté » : le verdict pilote la *machine*
     (mastery, gap, SRS), pas le *discours*.

5ter. **Validation Papa des missions générées (alignement sur la règle
   fondatrice).** Toute mission produite par un générateur (`remediation`,
   `revision`, `progression`) naît en **`validation_status = pending`** —
   colonne dédiée (`pending | validated | rejected`), distincte du statut de
   cycle de vie, même séparation que sur `Lesson`. Le **gate est dans la
   requête** (patron ADR-0011) : le sélecteur n'élit que parmi les validées,
   les routes student ne sérialisent que les validées — une mission `pending`
   ne peut pas atteindre Massimo, par construction. Papa valide **en lot**
   depuis la page de pilotage (rejet à l'unité) ; les missions `manual` sont
   **validées par construction** (le preview/confirm avec notions décochables
   satisfait l'invariant « un humain a approuvé avant exposition » — pas de
   double validation). Dégradation assumée : pool vide → `elected: null` →
   état serein « rien d'obligatoire », jamais une panne. Soupape future (hors
   v1, sur constat d'usage) : règle d'auto-validation par type choisie par
   Papa — on commence strict, on relâche sur constat, jamais l'inverse.
   Migration : une colonne sur `missions` (la seule du chantier avec
   `subject_id` nullable) ; les missions existantes de l'étape 15 sont
   backfillées **`validated`** — nées d'un endpoint Papa, l'invariant « un
   humain a approuvé avant exposition » était déjà satisfait.

6. **Hors périmètre (explicitement)** :
   - le **Lot 1** (`start`, `complete-step`, preuves d'exécution, verdict
     d'acquisition) implémente les décisions 5/5bis pour le type `remediation`
     existant, **sans attendre** le sélecteur ni les nouvelles sources — il
     reste antérieur au Lot 2 mais n'est plus ADR-indépendant ;
   - les **missions multi-matières** (« croisées », esprit EPI du cycle 4) :
     `subject_id` passera nullable, matières dérivées des `Skill` des étapes ;
     v1 = croisées via le flux `manual` uniquement, et leur **proposition
     automatique appartient au Conseil de classe IA** (seule vue transversale
     légitime : « la compréhension de consignes pèse sur la SVT ») — jamais au
     sélecteur quotidien ;
   - le chaînage des prérequis (`prerequisite_skill_ids`, flaggé par l'ADR-0010)
     enrichira `continuity` plus tard, sans changer la mécanique (bump de
     `MISSION_SCORING_VERSION` le moment venu) ;
   - tout ajustement *adaptatif* des pondérations (apprentissage des préférences
     de Massimo) est exclu de v1 — il réintroduirait l'inauditabilité écartée.

## Conséquences

### Positives

- La mission du jour devient **explicable** : facteur dominant → phrase → audit.
  Papa peut vérifier a posteriori pourquoi le système a proposé quoi.
- Le référentiel (ADR-0009/0010) trouve son **débouché élève** : les notions de
  rattrapage 5e entrent dans le quotidien de Massimo sans action manuelle.
- Réutilisation maximale : tables `missions`/`mission_steps` inchangées (hors
  vérification décision 5), moteur d'étapes de l'étape 15 conservé, `award_xp`
  et résolution de lacunes inchangés.
- Les invariants anti-anxiété passent du statut de « bonne pratique UI » à celui
  de **contrat testé** — le même mouvement que le filtrage serveur des contenus
  validés (règle de sécurité, pas préférence d'affichage).
- Les missions rejoignent la règle fondatrice : **plus aucun objet n'atteint
  Massimo sans être passé par Papa** — la dernière exception est fermée (5ter).
- Dividende du déterminisme : l'élection est **rejouable à la demande**
  (`GET /missions/election/today` côté Papa recalcule facteurs, scores et
  alternatives) — auditabilité gratuite, **aucune trace d'élection à stocker**.

### Négatives / coûts (complément 5ter)

- Friction de validation dans la boucle courte : si Papa ne valide pas, le pool
  s'appauvrit (mitigé par le lot, le badge, et l'état `elected: null` serein).
  Les missions `revision` seront la source la plus fréquente de la file — point
  d'observation pour la soupape d'auto-validation par type.

### Négatives / coûts

- Contrat de `/missions/today` cassant : `page-accueil.md` et la MissionsPage
  Massimo à adapter dans le même lot (acceptable : consommateurs internes
  uniquement).
- Une formule de scoring, même simple, se règle : les premières pondérations
  seront empiriques et demanderont 2-3 itérations (chacune = bump de version,
  discipline assumée).
- La source `revision` couple les missions au module SRS : si les cartes SRS ne
  sont pas encore alimentées à l'ouverture du chantier, la source démarre vide
  (dégradation gracieuse — le sélecteur opère sur les sources disponibles).

## Suivi

- **Docs** : ligne dans `DECISIONS.md` (« ADR-0015 — arbitrage des missions,
  scoring déterministe versionné ») ; correction du vocabulaire `mission_type`
  dans `DATA_MODEL.md` (décision 1) ; mise à jour `API_SPEC.md` §Missions
  (nouveau contrat `/missions/today`, générateurs par source) ; pointeur dans
  l'`adr-0010` (conséquence négative « ordonnancement fin des missions de
  rattrapage » → couverte par le facteur `continuity` du présent ADR).
- **Lot 1 — exécution réelle des étapes + verdict d'acquisition** (implémente
  les décisions 5/5bis sur le type `remediation` existant) :
  `POST /missions/{id}/start`, `POST /missions/{id}/steps/{step_id}/complete`
  avec **vérification de preuve serveur** (QuizAttempt `context=mission`,
  score reverse), verdict d'acquisition à la complétion (mastery + gap +
  carte SRS), XP inconditionnel, deux formulations enfant positives ;
  vérification du modèle réel (zéro migration attendue). La résolution de
  lacune sur simple complétion (étape 15) est **retirée** au profit du
  verdict. Prompt Claude Code dédié.
- **Lot 2 — sources + sélecteur** (implémente cet ADR) : générateurs
  `revision`/`progression`, scoring versionné, nouveau `/missions/today`,
  adaptation Accueil/MissionsPage Massimo. **Extrait un service d'évidence
  partagé** (module neutre, déterministe : mastery par skill, lacunes,
  verdicts, scores pondérés ADR-0014, stats SRS) dont le scoring est le
  premier client — le Conseil de classe IA en sera le second (narration LLM
  locale + recommandations typées posées sur la même évidence, patron
  ADR-0011 : un substrat neutre, plusieurs consommateurs, zéro duplication).
  Porte la migration `validation_status` + `subject_id` nullable (5ter),
  le gate dans les requêtes du sélecteur et des routes student, et la zone
  « À valider » (validation en lot, badge) sur la page pilotage Papa.
  Prompt Claude Code dédié, maquette Accueil confirmée d'abord.
- **Lot 3 — recommandations actionnables du Conseil de classe** : le
  `POST /ai/reports/class-council` produit des recommandations **structurées**
  (`{ skill_ids, mission_type, template_hint, justification }` — spec typé,
  patron ADR-0007/0015, jamais de prose à re-parser) ; l'évidence est
  **calculée** (mastery, lacunes, verdicts), le LLM ne fait que narrer et
  hiérarchiser ; bouton « Créer cette mission » → preview → confirm →
  mission `manual`. MissionsPage Papa en vue de pilotage. Maquette d'abord.
  Dépendances par porte : (ii) échéance et (iii) thématique n'exigent que le
  service d'évidence (Lot 2) ; seule la porte (i) exige la page Conseil de
  classe (non implémentée à ce jour). Ordre cible :
  référentiel → page Quiz (runner) → Lot 1 → Lot 2 (+ service d'évidence)
  → Conseil de classe → Lot 3.
- **Slice frontend Massimo — page élève** (`page-missions.md`) : navigation par
  **decks** (accueil disques matières + disque « Mission du jour » → matière →
  **timeline horizontale** → étape), activités **EN MODALE in-page** (ELI5 /
  quiz / mindmap ; brique `ActivityModal`, UI d'activité extraites et partagées
  avec leurs pages pleines), champs d'affichage `estimated_minutes`/`xp_reward`,
  endpoint `GET /missions/completed-today`, et l'**ordre des étapes par type**
  (§5 amendé). Croisées multi-matières **différées** (modèle mono-matière → ADR
  dédié). Commit suggéré :
  `feat(missions): student page — deck nav, in-page activity modals, type-ordered steps`.
- Ordre dans la file : après clôture du chantier référentiel (mono-chantier).
- Commits suggérés : `feat(missions): real step execution (start/complete-step)`
  (Lot 1) ; `feat(missions): multi-source generation + deterministic daily
  arbitration` (Lot 2).
