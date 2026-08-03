# DECISIONS.md — Index des décisions d’architecture

## ADR disponibles

- `docs/decisions/adr-0001-z-etis-sans-obsidian-obligatoire.md` — **Obsidian n'est pas une dépendance fonctionnelle** : PostgreSQL = source de vérité, MinIO = fichiers, pgvector = RAG ; Obsidian reste un export/import optionnel — Accepté
- `docs/decisions/adr-0002-separation-frontends-massimo-papa.md` — **Deux apps frontend séparées** (`apps/frontend-massimo` / `apps/frontend-papa`) : UX distinctes, permissions plus simples, voie ouverte au mobile pour Massimo — Accepté
- `docs/decisions/adr-0003-monorepo.md` — **Monorepo** (deux frontends + backend + workers + packages partagés) : doc centralisée, types et prompts partagés — Accepté
- `docs/decisions/adr-0004-postgresql-pgvector.md` — **PostgreSQL + pgvector** : une seule base pour le relationnel et les embeddings RAG ; migration vers un vector store dédié possible mais non requise au MVP — Accepté
- `docs/decisions/adr-0005-capsules-ia-progressives.md` — **Capsules IA progressives** : V1 script → storyboard → audio → slides, rendu vidéo complet repoussé en V2 (stratégie ; le choix technique du moteur est tranché par `adr-0007`) — Accepté
- `docs/decisions/adr-0006-extension-zetis-clip.md` — Extension navigateur zetis-clip : capture de sources RAG (pages / sélections / PDF) côté Papa vers le pipeline RAG, avec validation humaine — Accepté (2026-07-01)
- `docs/decisions/adr-0007-capsules-ia-remotion.md` — Capsules IA : moteur Remotion (capsule = spec typé ; Player Lot 1 + rendu MP4 Lot 2) — Accepté (2026-07-01)
- `docs/decisions/adr-0008-inference-mlx-vs-ollama.md` — Moteur d'inférence LLM : MLX **rejeté** (plus lent sur M3 Max) ; benchmark qualité de 5 modèles locaux → **adopté `qwen3.6:35b-a3b`** (MoE, qualité ≈ 72b à la vitesse la + rapide ; `OllamaProvider` passe `think:false`) ; embeddings découplés (Ollama/768, zéro migration) ; réf. cloud Claude+GPT prête (clé requise) — Accepté (2026-07-02)
- `docs/decisions/adr-0009-referentiel-programme-scolaire.md` — Référentiel de programme scolaire : génération LLM en deux passes (chapitres → leçons) **dans la hiérarchie existante** (zéro table nouvelle ; `Skill` = référentiel persistant, `Chapter`/`Lesson` = instanciation annuelle), co-construction Papa/IA par nœud (`source` + `validation_status`, le manuel intouchable), `SchoolYear.mode` déprécié, ancrage RAG optionnel, lycée différé à la 2de ; bench T4 → **dérogation cloud étroite** : tâches `curriculum_*` routées vers `claude-sonnet-5` (zéro donnée de Massimo, one-shot Papa, clé en env var, dégradation propre), tout le reste 100 % local — Accepté (2026-07-03)
  - `docs/decisions/adr-0009-addendum-cours-canonique.md` — **Addendum ADR-0009** : le **cours validé** (`Lesson.content_markdown`) est la **source canonique** des dérivés (ELI5, capsule, quiz, mindmap, fiches, SRS) — contexte prioritaire avant le RAG brut et la connaissance du modèle, même porte `pending → validated` ; lien `Lesson ↔ Skill` = table **N-N `lesson_skills`** (PK composite, index sur `skill_id`, `is_primary` en réserve), créée à la passe 2 avec `program_version` ; injection verbatim du cours (pas de ré-indexation RAG) — Accepté (2026-07-03)
- `docs/decisions/adr-0010-generation-skills-only-rattrapage.md` — Génération « skills-only » pour un niveau antérieur (rattrapage) : passes 1+2 enchaînées **en mémoire** (échafaudage jamais persisté), seules les notions sont upsertées en `Skill` (`level` = niveau cible) après prévisualisation + confirmation Papa (rien en base avant) ; trace `ai_jobs` `curriculum_skills_backfill`, dérogation cloud `curriculum_*` inchangée ; précise l'ADR-0009 : passe 1 strictement mono-niveau (few-shot SVT corrigé, prompt passe 1 → v2, passe 2 inchangée en v1) — Accepté (2026-07-03)
- `docs/decisions/adr-0011-contexte-canonique-partage.md` — **Substrat de contexte canonique partagé** pour tous les dérivés : un résolveur unique et neutre `resolve_canonical_context` (module `app/modules/ai/canonical_context.py`, zéro code dérivé) avec le **gate `status='validated'` DANS la requête** (impossible de recevoir un cours non validé), une **convention de prompt à deux sections** (`build_canonical_sections` : cours validé + extraits RAG + règle « le cours fait foi ») et une traçabilité `lesson_id`/`lesson_title` uniforme ; **ELI5 v2** est le premier client qui prouve le substrat (prompt explain → v2, badge « D'après ta leçon … ») ; read-only, dégradation gracieuse (cours → RAG → modèle), adoption incrémentale ; les dérivés suivants (quiz → mindmap → fiches → SRS → capsule) le consomment sans le réécrire — Accepté (2026-07-04)
  - `docs/decisions/adr-0011-addendum-fraicheur-derives.md` — **Addendum ADR-0011 §E — Fraîcheur des dérivés** : le gate §1 garantit qu'un dérivé *naît* d'un cours validé, **rien après** — une (re)génération de cours repasse la leçon en `draft` mais les dérivés déjà `validated` restent servis dans leur version obsolète. Définition du **périmé** en fonction pure (`is_stale`, module neutre `canonical_context.py`, jamais dupliquée) ; colonne **`lessons.content_updated_at`** (nullable, bumpée **uniquement** par les deux écrivains de `content_markdown` — `generate-content` et `PATCH` portant `content` : `updated_at` est trop bruyant, un renommage marquerait périmés tous les dérivés) ; référence côté dérivé = son `updated_at` (faux négatif assumé si Papa l'édite après coup) ; le périmé est **signalé, jamais déclassé automatiquement** (ZETIS ne retire rien unilatéralement) ; dérivés **notion-centrés hors périmètre** (cartes SRS, capsules : leur leçon source peut changer, un badge y serait ininterprétable) ; **§E.6 — premier consommateur réel** : corrige l'idempotence de l'ADR-0021 §5, qui devient « déjà validé **et frais** » (une pièce `pending` *et* périmée est régénérée, jamais validée) — `is_stale` est un **prédicat d’orchestration**, pas un badge — Accepté (2026-07-28)
  - `docs/decisions/adr-0011-addendum-provenance-validation.md` — **Addendum ADR-0011 §F — Provenance de la validation** : `source` dit qui a *produit*, `validation_status` dit *si c'est passé* — rien ne disait **qui a laissé passer**. Trois situations portaient la même valeur : relecture pièce à pièce, validation groupée (`validate-all`, équipement ADR-0021 §2), et absence totale de relecture (quiz, ADR-0014 §2). Colonnes **`validated_at` + `validated_by`** (`parent` | `parent_bulk` | `system` | `NULL`) sur chaque table de contenu validable — dérivés **et `chapters`/`lessons`** (`validate-all` est le chemin le plus « en lot » du projet ; `missions` **exclues** : valeur invariable), **même migration que §E** ; `parent_bulk` couvre l'auto-validation **déjà actée** par l'ADR-0021 §2 (correction d'une version antérieure de l'addendum) — notamment le cas où l'équipement **valide un brouillon `pending` préexistant** de Papa, aujourd'hui indétectable ; **aucune rétro-attribution** (historique `NULL` assumé) ; toute action groupée écrit `parent_bulk` **sans exception**, test-verrou « aucun `validated` sans `validated_by` » ; `system` strictement réservé au quiz (test dédié : aucune auto-validation ne doit s'y déguiser) ; **la provenance est un fait, jamais un reproche** — affichée par objet, **jamais totalisée, jamais relancée** — Accepté (2026-07-28)
- `docs/decisions/adr-0031-production-en-lot-et-journal.md` — **ADR-0031 — produire un chapitre en une fois : exécution asynchrone et journal de production** : **ABSORBE ET EXÉCUTE l'ADR-0023**, accepté le 2026-07-28 et resté **sans implémentation à aucun endroit** (vérifié : `equip_notion` toujours dans `reports/`, `plan(scope)` inexistant, aucun endpoint 202, bouton « ⚡ Compléter le chapitre » toujours désactivé, `batch_id`/`PRODUCTION_MAX_PENDING` prose seule). ⚠️ **Le prérequis manquant de TOUT le chantier d'autonomisation, listé nulle part : il n'existe AUCUNE file d'exécution IA** — `worker-ai` est un README, la seule `Queue` RQ sert worker-media, et toute la génération est **synchrone** sur un seul Ollama/GPU. « Départ au plus tard », « Massimo passe devant », lot interruptible : ces trois notions supposaient une exécution différable et préemptible qui n'existait pas. Livre : extraction de l'orchestrateur vers `production` (**refactor de déplacement, tests existants inchangés** — un test retouché invalide le refactor), **`plan(scope)` fonction PURE partagée** avec la matrice de couverture (un substrat, deux consommateurs — deux résolutions divergentes se paieraient comme le prédicat de disponibilité le 2026-07-30), **endpoint 202 + file RQ `production` + worker** (patron worker-media sandboxé, **concurrence 1** : un seul GPU, deux jobs se disputeraient la même ressource), **`production_runs`** (`trigger` sur le LOT jamais sur la pièce, **FK typées jamais polymorphes**, aucune rétro-attribution) + `production_run_id`, **`PRODUCTION_MAX_PENDING` enfin écrit** (régulateur du palier 2 SEULEMENT — le palier 3 auto-valide, le compteur resterait à zéro dans le seul régime où il serait vital), et l'activation du bouton Couverture (page **toujours en lecture seule**). ⚠️ **« Massimo passe devant » se décide ENTRE deux pièces, jamais pendant** : un appel LLM n'est pas préemptible, le grain de la préemption est la pièce — à écrire, sinon quelqu'un promettra une interruption immédiate. **Le modèle anticipe, le code n'anticipe pas** : `production_runs` naît complet, seuls `trigger='manual'` + `authorized_by='parent_direct'` sont émis. **L'OBSERVATION EST LE LIVRABLE autant que le code** — temps réel, taux de dégradation, et surtout « **15 objets d'un coup sont-ils relisables ?** » : la réponse décide du chantier suivant, et l'ADR-0023 l'a déjà tranchée — si c'est non, ce n'est ni le cron ni les déclencheurs, **c'est la file de relecture** — Proposé (2026-08-02)
  - `docs/decisions/adr-0031-addendum-deux-passes-et-gate-cours.md` — **Addendum ADR-0031 — les deux passes du §7 : le gate vit dans la SÉLECTION, pas dans l'orchestrateur** : écrit **pendant** la slice A, à partir de son read-before-code. ⚠️ **Le §7 de l'ADR-0023 — cité par l'ADR-0031 ET par le §G comme « le seul gate humain obligatoire et bloquant, et il ne bouge pas » — n'a JAMAIS été implémenté** : `equip_notion` valide le cours lui-même par **deux chemins** (un brouillon `draft` que Papa avait peut-être délibérément laissé en attente → validé ; aucun cours → généré **puis** validé, Papa ne l'a jamais vu), puis enchaîne les dérivés. **Ce n'est pas un bug** : à l'échelle d'UNE notion c'est la soupape §5ter de l'ADR-0021, « ouverte étroitement », que le §F.4 assume et trace en `parent_bulk`. **C'est l'ÉCHELLE qui la rend inacceptable** — un clic sur « ⚡ Compléter le chapitre » ferait rédiger et auto-valider **quinze cours**, le seul contenu que Massimo lit vraiment. **Décision** : `equip_notion` **ne change pas** (toucher l'orchestrateur régresserait le Conseil de classe et la composition champion, et rouvrirait l'ADR-0021 §2 que personne n'a demandé à rouvrir) ; **le gate vit dans la sélection** — la passe 2 n'équipe QUE les notions dont la leçon est déjà `validated` avec contenu, les autres sont **rendues bloquées avec leur motif**, si bien que les deux chemins d'auto-validation deviennent **inatteignables depuis un lot sans qu'une ligne de l'orchestrateur bouge**. Les deux passes explicitées : passe 1 rédige et **laisse en brouillon**, le gate est Papa via les surfaces existantes (validation par leçon ou `validate-all` → `parent_bulk`, §F.3, **rien à construire**), passe 2 équipe. **Corollaire** : `plan(scope)` livré en slice A **sans** le filtre `validated` de l'ADR-0023 §2 cesse d'être une dérogation locale — **le filtre n'est pas un détail de résolution, c'est LE GATE**, il n'a rien à faire dans un résolveur partagé avec une page de lecture. ⚠️ **Coût nommé** : un lot sur un chapitre neuf **ne produira rien** à la passe 2, tout sera bloqué en attente de validation — la surface doit le dire, sinon Papa lira un échec là où il y a un gate ; **c'est le point le plus facile à rater de la slice C**. Verrou n°1 exigé : *après un lot complet sur un chapitre entièrement en brouillon, AUCUNE leçon n'est passée `validated`* — sans lui, tout cet addendum est décoratif — Proposé (2026-08-02)

  - `docs/decisions/adr-0011-addendum-autorite-paliers.md` — **Addendum ADR-0011 §G — l'autorité monte d'un cran : `parent_rule` et le veto paresseux** : premier document du chantier d'**autonomisation progressive** (paliers 1→2→3). **Une VALEUR de plus sur `validated_by`, pas une colonne de plus** — `parent` (pièce) → `parent_bulk` (lot) → **`parent_rule`** (règle permanente) : la même échelle, un cran de plus ; une colonne `authority` donnerait **deux réponses à une seule question**, le mal que le §F élimine. ⚠️ **Ce qui est nouveau au palier 3 n'est PAS « du contenu non relu atteint Massimo »** — le §F.4 l'a déjà acté (`parent_bulk` couvre l'équipement ADR-0021) : le nouveau, c'est la disparition du **geste par lot**, aujourd'hui **seul régulateur de volume existant**. `system` reste interdit (son test-verrou désigne littéralement ce moment). **Matrice classe × palier** — l'autonomie se dose par **coût d'erreur × réversibilité avant exposition**, jamais par un interrupteur global : A0a dérivés inertes → 3, **A0b cartes SRS séparées** (l'erreur ne dort pas, elle se compose) → 3, A1 rédaction de cours → **2 FIGÉ** (ADR-0023 §7 « ne bouge pas »), A2 référentiel → 1, A3 création de mission → 2 (**élire ≠ créer** : le sélecteur est déjà autonome), A4 terminal → **jamais** (classe C ADR-0027). **Veto PASSIF et PARESSEUX** : servi immédiatement, rétractable sans trace tant que Massimo n'a pas consommé — **la consommation, pas l'horloge, ferme la fenêtre** ; la quarantaine temporelle est écartée (exige un ordonnanceur refusé, ment sur ce qu'elle mesure, réintroduit `pending` en échappant à son régulateur). Traçable pour les **QUATRE** familles : le « trou » fiches/mindmaps **n'existait pas** (`fiche_views`/`mindmap_views` livrées par l'ADR-0030 §4 ; un docstring périmé avait fait croire l'inverse). ⚠️ **Inversion assumée sur A0b** : la fenêtre se ferme au moment où le danger commence → « Corriger » doit pouvoir remettre la planification à zéro. **V1** le retrait est invisible de Massimo, **V2** la dé-escalade ne rétroagit jamais. **`parent_rule` naît LÉGALE et NON ÉMISE** (patron `content_kind`) — aucune migration, aucune table. ⚠️ **Coût nommé** : le veto est un **droit sans notification** (Papa l'apprend en ouvrant une surface, Massimo consomme en 24-48 h) — où cette information apparaît est un **point ouvert de l'ADR-0031** ; et le nuancier Papa **confond déjà** `null` et `parent_bulk`, à corriger dans la même passe — Proposé (2026-08-02)
- `docs/decisions/adr-0032-paliers-autonomie-zetis.md` — **ADR-0032 — les paliers d'autonomie de ZETIS : le panneau de réglage, et la levée du gel d'A1** : troisième document du chantier d'autonomisation, après le §G (autorité, veto) et l'ADR-0031 (exécution, journal). ⚠️ **RÉVOQUE deux décisions écrites** — le §G.2 (« A1 rédaction de cours → **2 FIGÉ** ») et la lettre de l'ADR-0023 §7 (« le gate humain ne bouge pas ») : décision du **commanditaire**, prise au vu de l'observation du 2026-08-02, **bornée, outillée et désarmée par défaut**. **L'observation change le cahier des charges** : sur 33 objets produits, **2 seulement** arrivent en relecture — le panneau ne sert pas d'abord à faire **monter** Papa d'un palier, mais à lui **montrer où il est déjà** (il est au palier 3 pour les dérivés sans l'avoir choisi). **Six clés PLATES dans `app_settings`** (table existante → **aucune migration**), une par classe du §G.2 ; ⚠️ les seules routes de settings sont namespacées `/api/agenda/settings` → **routeur neutre à créer**. **Trois préréglages *Manuel · Semi-autonome · Autonome* = un RACCOURCI D'ÉCRITURE, JAMAIS un état stocké** — l'étiquette se **dérive** des six valeurs et affiche « Sur mesure » sinon ; un mode stocké *plus* six clés donnerait **deux réponses à une seule question**, le mal que le §G.1 a évité en refusant une colonne `authority`. **A2 et A4 ne bougent dans aucun préréglage** (lisibles, non écrivables, refus serveur). **Levée d'A1 sous trois bornes** : désarmée par défaut (2 préréglages sur 3 la laissent à 2), ⚠️ **la provenance suit `authorized_by`, PAS le palier** (corrigé au read-before-code : le §G.1 définit `parent_rule` par l'**absence de clic**, or un lot lancé depuis la Couverture EST un clic — à A1=3 la provenance juste reste `parent_bulk` ; **`parent_rule` demeure légale et NON ÉMISE**), et **le palier 3 n'existe pas sans veto branché**. Le contre-motif est **maintenu au dossier** : le cours est le seul contenu vraiment lu et, depuis l'observation, **le dernier gate humain** — le porter à 3 ne fait pas monter d'un palier, **ça retire le dernier**. **Le palier se branche dans la SÉLECTION** (`runner.select_notions`), jamais dans l'orchestrateur — ce que l'addendum ADR-0031 avait préservé sans le savoir ; **l'autorité devient un PARAMÈTRE** (`equip_notion(..., authority=)`), car un service qui lirait les réglages lui-même deviendrait inappelable par le Conseil de classe et le champion, dont l'autorité reste `parent_bulk` **quel que soit le palier**. ⚠️ **DÉFAUT BLOQUANT trouvé au read-before-code** : `equip_notion` auto-valide le cours via `set_lesson_validation`, qui tamponne **`parent`** — « relu pièce à pièce par Papa » — **sur un cours que personne n'a ouvert** (violation directe du §F.3, invisible du verrou existant qui ne vérifie que la NON-NULLITÉ de la provenance) ; **13 leçons** en base mêlent déjà vraies validations de Papa et auto-validations, **plus séparables** ; réparé ici (**aucune rétro-attribution**, §F.4) car tout le dispositif de paliers repose sur `validated_by` disant vrai. **Le veto obtient enfin une surface** — sur le **Journal** (flux daté + geste par pièce) et non la Couverture (matrice d'état) que le §G suggérait, question que l'ADR-0031 devait trancher et n'a pas tranchée ; ⚠️ ce « Retirer » **n'ouvre pas A4** (A4 dit que *ZETIS* ne supprime jamais seul ; ici c'est *Papa*). **Le régulateur du palier 3 est DIFFÉRÉ avec sa condition d'ouverture nommée** : tant que tout lot part d'un clic, **le geste EST le régulateur** — le jour où un déclencheur non humain existe (`agenda`, `evidence`, `derived`, cron), un plafond de volume par fenêtre devient obligatoire, et ce jour-là c'est un ADR. **Jamais** : compteur d'arriéré, ratio ZETIS/Papa (§F.2), surface Massimo (V1), A4 réglable. Nuancier : 4ᵉ teinte **avec** la correction du `null` confondu avec `parent_bulk` (dette §G constat 5). ⚠️ Coûts : le dernier gate humain devient optionnel ; le veto reste **partiellement** un droit sans notification ; 13 leçons restent mal tamponnées. **Observation attendue** : une **descente** de préréglage dans le premier mois vaudrait plus qu'une montée — elle dirait que le veto n'a pas suffi — Proposé (2026-08-02)
- `docs/decisions/adr-0034-journal-production-et-veto.md` — **ADR-0034 — le Journal de production : ce que ZETIS a fait, et le veto qui rend le palier 3 honnête** : cinquième document du chantier d'autonomisation. ⚠️ **Numéroté 0034 mais écrit APRÈS l'ADR-0035**, sur demande du user — l'axe « déclencheur » a été cadré en premier pour que le Journal soit dessiné en sachant qu'il devra rendre lisibles des lots que **personne n'a demandés** ; le numéro dit la place dans la **livraison**, pas l'ordre d'écriture. **Livre la condition d'ouverture du régime *Autonome*** : l'ADR-0032 a posé `VETO_SURFACE_AVAILABLE = False` au motif que « le palier 3 promet un droit de veto, et ce droit n'a aucun écran » — **ce document construit l'écran**, et sa dernière étape est **une ligne** que les sept premières existent pour rendre honnête. **Huit constats de read-before-code** : `runner.execute` **construit le détail et le JETTE** (`results` retourné au job RQ dont personne ne lit le retour ; seul `done_notions` est persisté — **la donnée demandée existe déjà en mémoire**) ; `equip_notion` **renvoie déjà tout** sous trois formes (rien à instrumenter dans les cinq générateurs, ce que l'addendum ADR-0031 interdit de toucher) ; ⚠️ **le §G.3 dit « quatre familles » et il en OUBLIE une — le COURS**, or A1 est exactement la classe dont le palier 3 justifie ce chantier (le signal `EVENT_LESSON_VIEWED` existe mais sous une **cinquième forme**, `payload_json->>'lesson_id'` **non indexé**) ; `ProductionRun` n'a ni `started_at` ni `heartbeat_at` ni `current_skill_id` (un lot dont le worker meurt reste `running` **pour toujours**) ; **`spaced_review_cards` est la seule table de contenu sans `created_at`** — ⚠️ **nuance corrigeant la recette** : une carte **issue d'un lot** est datable **par son lot** (`production_run_id`), le trou ne concerne que le hors-lot ; le filigrane `_stamp` est exact mais **grossier** (ni notion, ni ordre, ni issue) ; les endpoints existants **suivent un lot, ils ne racontent rien** ; le veto **n'a aucune route** et touchera cinq tables. **Décisions** : **`production_events`, une ligne par pièce** (`piece` NULL + `outcome='blocked'` pour une notion bloquée — la doctrine « une notion silencieusement omise se lirait comme un échec » portée jusqu'au journal), **écrite dans la MÊME transaction que l'acte** (patron `log_learning_event`) ; **l'expiration des zombies est une LECTURE, pas un balayage** — le seul écrivain est le prochain `create_run`, **aucun ordonnanceur** (le §G.3 a écarté la quarantaine temporelle précisément parce qu'elle en exigeait un) ; **table `lesson_views` symétrique des trois autres** plutôt que la requête JSON qui marcherait aujourd'hui (le Journal résoudrait **une famille sur cinq autrement que les quatre autres** ; `lesson_viewed` continue d'être émis pour la heatmap — **deux lecteurs, deux besoins, aucune fusion**), consommation résolue en **une requête par famille, jamais une par pièce** ; `GET /api/production/journal` **`require_parent`, aucune route élève**, **portée v1 = ce qui vient d'un lot ET LA PAGE LE DIT** (⚠️ le Conseil de classe et le champion équipent **hors lot**, leurs pièces ont `production_run_id = NULL` — un journal qui paraît exhaustif sans l'être est pire qu'un journal qui borne son sujet) ; **veto au grain de la PIÈCE**, mais ⚠️ **retirer le COURS emporte ses dérivés et SE REFUSE si l'un d'eux est consommé** — seul choix compatible avec **V1** (retirer quand même ferait disparaître la source d'une fiche que Massimo a lue : le trou inexpliqué que V1 interdit) ; ⚠️ ce « Retirer » **n'ouvre pas A4** (c'est *Papa* qui supprime) et la **suppression est FRANCHE** alors que l'ADR-0025 impose l'archivage sur l'agenda — **deux objets, deux doctrines**, l'agenda est co-édité par Massimo, ici la pièce n'a jamais existé pour lui. **Une seule migration** pour quatre changements de schéma. **Jamais** : surface Massimo, rétroaction sur le servi (V2), total ou ratio (§F.2), balayage périodique, re-génération de ce que Papa retire. ⚠️ Coûts : le veto **reste un droit sans notification** (Papa l'apprend en ouvrant le Journal, Massimo consomme en 24-48 h) ; le refus de retirer un cours consommé sera vécu comme une limite, et c'est le prix de V1 ; la suppression est **irréversible**. **Observation attendue** : si le veto n'est exercé **zéro fois** le premier mois, il faudra savoir si ZETIS produit juste ou si Papa n'ouvre pas le Journal — Proposé (2026-08-02)
- `docs/decisions/adr-0035-declencheur-automatique-production.md` — **ADR-0035 — le déclencheur automatique : ZETIS travaille sans qu'on lui demande, et ce que ça oblige** : quatrième document du chantier d'autonomisation. **Écrit AVANT l'ADR-0034 (le Journal), livré APRÈS lui** — ordre délibéré : dessiner le Journal en sachant qu'il devra rendre lisibles des lots que **personne n'a demandés** évite de le construire deux fois. Ferme le second axe de « full autonomie » : le **palier** dit *« ZETIS ne me demande plus de valider »* (ADR-0032, livré), le **déclencheur** dit *« ZETIS travaille sans que je clique »* — et sans lui, même à `VETO_SURFACE_AVAILABLE = True` et A1 = 3, **ZETIS ne produit rien de lui-même**. ⚠️ **RÉVOQUE une décision écrite dans le code** : `production_worker.py` porte `with_scheduler=False` avec son motif (*« aucun cron, aucune tâche périodique — un scheduler ouvrirait la porte à "tous les dimanches, produire quelque chose", qui n'a pas de sens pédagogique »*). **L'objection est maintenue et SATISFAITE, pas contournée** : le scan se réveille pour **regarder** si le monde réel a demandé quelque chose, il ne produit sur aucun calendrier. **Sept constats de read-before-code** : la table est **prête** (`TRIGGERS` six valeurs, FK typées, `TRIGGER_REFERENCE` — **aucune migration**), `authority_for` est **déjà écrite** pour ce chantier (`parent_rule` s'émettra sans qu'une ligne du runner change), le scheduler est **déjà câblé et désarmé** (un booléen, `rq>=1.16`, **aucune dépendance nouvelle**), `create_run` est verrouillée sur `manual`, **le régulateur actuel sera aveugle au palier 3** (`pending_backlog` compte `Fiche`+`Mindmap` en `pending` → zéro quand plus rien n'est `pending`), la préemption existe mais **rien ne dit si un lot a le droit de DÉMARRER** pendant que Massimo travaille, et `agenda_items` a **déjà** ses données (`chapter_id` posée « pour le Lot 3 »). **Déclencheur v1 = `agenda` SEUL**, cinq conditions (`kind='controle'` · `chapter_id` non nul · non archivé · échéance ≤ N jours · aucun lot ne référence déjà l'item) ; `devoir`/`rendu` **légaux et non émis** (patron `EMITTED_TRIGGERS`). **`evidence` écarté en connaissance de cause** : l'agenda est la seule source **exogène**, sa légitimité se lit sans modèle ; `evidence` ferait décider ZETIS **sur sa propre mesure** — la boucle se refermerait sur elle-même. **Idempotence par la RÉFÉRENCE, jamais par un `produced_at` sur l'agenda** (le module production n'écrit pas dans une table que Massimo co-édite, ADR-0025 §2a) ; un lot **refusé** ne consomme pas la référence. **Régulateur : N lots automatiques par fenêtre glissante de 7 jours (défaut 2), et il REFUSE en le disant** — les lots **manuels ne comptent pas** (le clic de Papa est son propre régulateur) ; `pending_backlog` **reste en vigueur** et s'applique aussi (deux régulateurs, deux objets : le volume produit vs l'arriéré de relecture). Rejetés : le plafond au grain de la notion (couperait un lot en son milieu → chapitre à moitié équipé) et le report au lieu du refus (file invisible ; un lot parti 5 jours après produit pour un contrôle passé). **7ᵉ clé `zetis_auto_trigger_enabled` (défaut 0), INDÉPENDANTE du palier** — deux questions, deux sources ; ⚠️ **elle ne rejoint PAS `AUTONOMY_CLASSES`** (constat de code : booléen et non palier 0-3, et `preset_of()` ferait qu'un **préréglage armerait le déclencheur**) → préfixe distinct pour ne pas être balayée par `write_autonomy`. **`parent_rule` s'émet enfin** — définition littérale du §G.1 satisfaite pour la première fois ; **le palier reste maître de la validation** (un lot `parent_rule` sous A0a = 2 produit du `pending`, `authority_for` renvoie `None`). **Un lot automatique ne DÉMARRE pas pendant que Massimo travaille** (`massimo_is_active` évalué à la création, pas seulement entre deux notions). **Jamais** : surface Massimo, suppression/archivage/dévalidation (A4 reste 0), notification poussée, élargissement silencieux du vocabulaire. ⚠️ Coûts : le Journal est un **préalable de livraison** (un dispositif qui agit sans témoin est une source de surprise) ; **le déclenchement dépend d'un geste que Papa ne fait pas encore** — rattacher un `chapter_id` à un contrôle — et son absence se lira comme une panne ; l'ordonnanceur RQ **n'a jamais tourné ici** (repli nommé : cron + `python -m app.scan_triggers`, **pas un recodage**) ; le plafond 2 est un **pari** calibré sur la seule mesure réelle (69 s/notion) — Proposé (2026-08-02)
  - `docs/decisions/adr-0035-addendum-devoirs-et-porte-echeance.md` — **Addendum ADR-0035 — les devoirs déclenchent aussi, et l'échéance commande enfin ses missions** : écrit le 2026-08-03, **quelques heures après l'ADR-0035**, à partir de quatre questions posées à la relecture — l'écart entre ce que Papa **croit** déclencher et ce qui se passe. ⚠️ **RÉVOQUE le §1** (« `kind == 'controle'` seul ») : `devoir` est le `kind` **par DÉFAUT** de la saisie, si bien que le déclencheur ne se serait presque **jamais** mis en route. **Le contre-motif reste au dossier parce qu'il est juste** — « je relève l'ENT du dimanche soir » (ADR-0025 §9) produit plusieurs devoirs par semaine contre un contrôle toutes les deux ou trois semaines, et sans garde-fou ils consomment le plafond en un jour. **Traité, pas effacé** : `eligible_items` trie par **(priorité de kind, échéance, id)** — le scan s'arrêtant quand le régulateur refuse, **trier décide qui passe en dernier, et ce n'est pas le contrôle**. Conséquence voulue et contre-intuitive, verrouillée par un test : **un contrôle dans 6 jours passe AVANT un devoir de demain**. Le tri vit en **Python, pas en SQL** (la priorité est un vocabulaire du domaine, pas une colonne — un `CASE WHEN` divergerait au premier `kind` ajouté). ⚠️ Coût écrit et non masqué : un devoir fait produire le **chapitre entier**, disproportionné — le scope à la notion supposerait un `skill_id` sur `agenda_items`, qui n'existe pas. **Branche la porte « échéance » du Commander** (ADR-0025 §11 couplage 1, décidé le 2026-07-30 et jamais implémenté) — **implémentation, pas décision, et AUCUNE ligne de backend** : `resolve_chapter_notions` est **déjà** scopé par chapitre, `create_command_missions` prend **déjà** `due_date` + `force_priority`, `CommandPreviewRequest` porte `gate: "deadline"` **depuis l'origine** (déclarée, jamais alimentée), les routes existent, et `reports/service.py` a **déjà** construit ce pont depuis le Conseil de classe — le nôtre est le **second exemplaire**. ⚠️ **Geste de PAPA, jamais le scan**, et la frontière est nette : ZETIS **produit du contenu** sans clic (ADR-0035), il ne **prescrit pas du travail à Massimo** sans clic — `command.py` fonde la validation sur « le preview/confirm avec notions décochables **EST** l'approbation humaine », un scan créerait des missions `validated` que personne n'a approuvées. ⚠️ Piège du hook : `openFor` **ne compose pas** `setGate`+`selectSubject`+`selectChapter` (le premier remet `chapterId` à null, le second lit `gate` dans sa **fermeture** — le preview partirait sous la porte précédente). **Le chapitre s'attache après coup** (panneau de détail ; l'API l'acceptait déjà) et **une échéance sans chapitre le DIT** — sinon le déclencheur paraît en panne ; message **volontairement indépendant du `kind`** (recopier `TRIGGERING_KINDS` au front en ferait une seconde source de vérité, qui aurait divergé le jour même). **Deux corrections de provenance** : (a) `create_manual_chapter`/`create_manual_lesson` écrivaient `validated` **en littéral**, hors de `mark_validated`, donc `validated_by IS NULL` — **le Journal affichait les leçons de Papa « provenance inconnue »** ; `PARENT` est juste (écrire une chose, c'est l'avoir vue), aucune rétro-attribution ; (b) « + Programme » crée une notion **orpheline** que `equip_notion` ne pourra jamais servir — ⚠️ **l'orpheline n'est PAS le défaut** (état légitime et documenté, Papa peut rattacher plus tard), **le défaut était le SILENCE** : signal `needs_lesson` **calculé jamais supposé**, et les deux actions ne fusionnent pas. **Aucune migration, aucune dépendance.** ⚠️ Dettes nommées : **le Commander n'est pas idempotent** (Papa peut commander deux fois la même échéance — `Mission` n'a aucune référence à l'agenda ; exigerait une colonne `missions.agenda_item_id`, donc une migration, **obligatoire le jour où le scan suggérerait**) ; le pont demande → production reste **non émis** ; `skills-backfill` crée les mêmes orphelines ; le panneau d'analyse à 3 compteurs attend une mesure SRS scopée chapitre (`evidence.srs_pressure` est par MATIÈRE). **Observation attendue** : qu'un contrôle soit refusé après des devoirs dirait que le tri ne suffit pas et qu'il faut relever le plafond — Proposé (2026-08-03)
- `docs/decisions/adr-0036-demande-vers-production.md` — **ADR-0036 — la demande de Massimo devient une production : fermer la seule boucle qui reste ouverte** : sixième document du chantier d'autonomisation. `notion_requests` a une boucle **complète** ; `content_requests` n'en a pas — Papa n'a que « Fait »/« Ignorer », et **aucun des deux ne produit quoi que ce soit** : « Fait » est une **DÉCLARATION**, et le seul garde-fou est en aval (`chat/announce.py` refuse d'annoncer un `done` non servable — « le gate est la DISPONIBILITÉ, jamais le statut »). ⚠️ **RÉVOQUE** une décision de l'addendum ADR-0027, écrite dans le code au-dessus de `RequestedPopover.tsx` (« la demande est un REPÈRE DE PRIORITÉ, pas une injonction : la production reste **un geste de Papa** ») — mais **conditionnellement et étroitement** : hors du régime visé, la phrase reste vraie mot pour mot. ⚠️ **Trois désalignements que « brancher le trigger » cachait** : la demande porte une **NOTION**, la production un **CHAPITRE** (aucun scope notion n'existe) ; la demande porte **UN type**, `equip_notion` produit **le kit entier** ; et **`capsule` n'a aucun producteur dans l'équipement**. Brancher naïvement ferait produire ~30 objets parce qu'une fiche manque. **Décisions** : (1) `trigger='request'` s'émet sous **DEUX conditions cumulatives** — régime ***Autonome*** **ET** déclencheur armé ; ce n'est **pas** la fusion que l'ADR-0035 §5 refusait (celle-là rendait le dispositif plus PERMISSIF ; la conjonction est plus RESTRICTIVE), et la porte est plus étroite que pour l'agenda parce qu'une échéance est **exogène** (le collège l'a dit) quand une demande est **endogène** (Massimo peut en poser dix un soir d'ennui) ; (2) **le scope devient la PIÈCE et il est EXPLICITE** — deux colonnes `scope_skill_id` + `scope_kind`, « exactement un scope renseigné » ; ⚠️ **on ne le dérive PAS** de `content_request_id` (l'ADR-0031 §4 : « les colonnes disent POURQUOI, jamais SUR QUOI ») et **on ne réutilise PAS `skill_id`**, déjà référence de déclencheur d'`evidence`/`derived` — une colonne à deux sens est l'ambiguïté qui a fait rejeter `notion_requests` ; `equip_notion` **n'est pas touché**, la production par type passe par les générateurs que `generateForCell` appelle déjà ; (3) **la capsule devient productible SUR DEMANDE, jamais dans le kit** — l'addendum ADR-0031 interdit de toucher l'orchestrateur (ça régresserait le Conseil de classe et le champion), et un lot de 11 notions rendrait **11 vidéos** que personne n'a demandées ; ⚠️ son rendu est **asynchrone**, donc le lot finit avant la vidéo ; (4) **auto-fermeture sur DISPONIBILITÉ**, patron `announce.py` appliqué à l'écriture — aucun statut nouveau, un lot en échec ne ferme rien, `announce.py` revérifie de son côté ; (5) ⚠️ **le régulateur compte des LOTS, pas du COÛT** — un lot-pièce (~30 s) y pèse comme un lot-chapitre (~36 min), donc **quota DISTINCT** (`ZETIS_REQUEST_MAX_RUNS`, initial 10/semaine) : sans lui, deux fiches demandées empêcheraient de préparer un contrôle. **Trois compteurs, trois natures** (clic de Papa = aucun · échéance = 2/sem · demande = 10/sem). **Jamais** : surface nouvelle côté Massimo, compteur ou délai annoncé (« ta fiche arrive dans 3 min » ferait d'une demande une commande), priorisation de file. **Une migration.** ⚠️ Hors périmètre mais nommé : **une demande sur une notion ORPHELINE** (créée par « + Programme » ou `skills-backfill`, sans leçon) **ne pourra jamais être satisfaite** — le cas doit être détecté et DIT, pas produire un lot qui échoue. **Le signal qui dirait qu'on s'est trompé** : Massimo demandant beaucoup PLUS une fois la production automatique — on aurait fabriqué un distributeur, et la réponse serait de refermer le régime, pas d'ajouter un plafond — Proposé (2026-08-03)
- `docs/decisions/adr-0012-stt-whisper-local.md` — **STT (dictée) via Whisper local pour ELI5** : active la Phase 9 de la spec ELI5 (« soit il écrit, soit il parle ») — **`faster-whisper` (CTranslate2) 100 % local**, endpoint synchrone dédié ; l'API vocale du navigateur (`webkitSpeechRecognition`) est **exclue** car elle enverrait à un tiers une production pédagogique privée de l'enfant (ligne ADR-0008 + règle `CLAUDE.md`) ; sans dépendance torch, décodage WebM/Opus via PyAV, modèle **`small`** par défaut (réglable `ZETIS_WHISPER_MODEL` → `medium` / `large-v3`), `device=cpu` / `compute_type=int8` ; dépendance optionnelle (extra `[stt]`) → 503 propre et micro masqué si absente — Accepté (2026-07-04)
- `docs/decisions/adr-0013-generation-cartes-srs.md` — **Génération et cycle de vie des cartes de révision (SRS)** : remplit le réservoir du moteur SRS déjà livré (module `memory`, page `/revision`) ; une carte est un objet **de l'élève** (porte `student_id` + la planification durement acquise `interval_days`/`ease_factor`/`due_at`), son **contenu** dérive du **cours canonique** (`resolve_canonical_context`, gate `validated`, `adr-0011` — dernier dérivé du §A à consommer le substrat) ; **contrat arrêté après maquette validée** : surface = page Papa « Cartes SRS », **génération explicite par matière** (pas d'auto-trigger), aperçu recto/verso, réconciliation des orphelines visible ; upsert préservant la planification à la régénération — Accepté, livré (2026-07-05)
- `docs/decisions/adr-0014-moteur-quiz-unifie.md` — **Moteur de quiz unifié** (formats, correction, doctrine de validation) : un seul moteur pour les quatre contextes (`diagnostic` / `mission` / `revision` / `capsule_post_test`) au lieu d'un générateur par chantier ; deuxième client du substrat canonique (`adr-0011`) ; ligne de partage des formats = leur **mode de correction**, pas leur apparence — **Lot 1** = sept formats à correction **déterministe** (code pur, testable), **Lot 2** = format `open` **jugé par LLM local** critère par critère (bénéfice du doute, ambiguïté remontée à Papa ; hors mix auto-généré, opt-in manuel) ; **doctrine de validation** : le quiz est servi **sans gate** — précédent de l'étape 14 (diagnostic) régularisé a posteriori et assumé, tracé depuis par `validated_by='system'` (addendum ADR-0011 §F) ; **ADR clôturé**, Lots 1 et 2 vérifiés live (Ollama réel) — Accepté (2026-07-05)
- `docs/decisions/adr-0015-fiches-revision.md` — **Fiches de révision** : objet **distinct** (granularité **leçon**, ≠ flashcard SRS qui est notion) ; contenu = **spec fermé à budgets** (`FicheSpec` : essentiel / définitions / points-clés / pièges / exemple) → garantit « 1 leçon = 1 page » **par construction** (patron `adr-0007`) ; **dérivé du cours canonique** (`resolve_canonical_context`, gate `validated`, `adr-0011`) ; deck par matière = vue filtrée (aucune relation nouvelle) ; pont **faible** vers SRS (« Ajouter à mes cartes ») ; impression via CSS (aucune lib) ; table **`fiches`** + validation Papa ; génération **par Massimo différée** (fiches ZETIS vs fiches personnelles) — Accepté (2026-07-05)
- `docs/decisions/adr-0016-mindmaps-rendu-layout.md` — **Mindmaps interactives** : rendu **React Flow** (`@xyflow/react`, état contrôlé requis par la reconstruction) + layout **elkjs** (une lib → `radial` / `layered` RIGHT=horizontal / DOWN=vertical ; « équilibrée » = petit glue maison) ; **4 présentations laissées au choix** + **défaut déterministe** `defaultLayout()` (radial si peu profond/peu de feuilles, sinon horizontal) **surchargeable** ; **layout = présentation → côté client** (métier : évaluation/XP restent serveur) ; dérivé canonique (`adr-0011`) ; 2 dépendances épinglées — Accepté (2026-07-05)
  - `docs/decisions/adr-0016-addendum-pilotage-papa.md` — **Addendum ADR-0016 — Pilotage Papa** : précise le §6 (frontière Massimo/Papa) — **aperçu fidèle** (grande modale 4 onglets rendant la brique Massimo à l'identique, exception cadrée à la frontière visuelle, précédent Player capsules) ; **canvas + 3 modes extraits en brique `@zetis/ui` partagée** (React Flow + elk migrent vers `packages/ui`, chargement paresseux côté Papa, patron d'extraction `SubjectDeckGrid`/`ContentLifecycleActions`) ; **évaluation d'aperçu serveur sans effet de bord** — `POST /api/mindmaps/{id}/evaluate-preview` (`require_parent`, réutilise le barème pur, **aucune persistance** : ni `mindmap_attempts` ni XP), **`evaluator` injecté en prop** (barème serveur unique, 2 consommateurs, patron `adr-0011`) ; **édition par outline structuré** (drag-to-reparent écarté) → `PUT /mindmaps/{id}` → `pending` ; **cycle de vie éditorial** (édition d'une carte `validated` → `pending` donc retirée de Massimo, suppression → cascade `mindmap_attempts`, **XP jamais rembobiné**, régénération sans recalcul des scores passés) — Accepté (2026-07-27)
- `docs/decisions/adr-0017-arbitrage-missions.md` — **Arbitrage des missions** (moteur de prochaine meilleure action) : `mission_type` fermé **orienté source** (`remediation | revision | progression | manual`), sélecteur = **scoring déterministe versionné** (zéro LLM, facteurs nommés), garde-fous anti-anxiété = **invariants serveur testés** (`failed` jamais écrit côté enfant, pas de pénalité temps), générateurs par source produisant des **étapes à preuves** (§5), **verdict d'acquisition découplé de la complétion** (§5bis : XP d'effort **+50 inconditionnel**, `acquired` vs `review_later` sur seuils reverse+quiz), **validation Papa** des missions générées (§5ter : `validation_status`, gate `validated` dans la requête). **Lot 1 livré** (2026-07-05) : preuves serveur + verdict sur `remediation`. **Amendement acté à l'implémentation** : la prémisse « zéro migration de ciblage » était fausse contre le modèle réel — `MissionStep.resource_id` **et** `missions.started_at` ajoutés à la migration (`f3a4b5c6d7e8`), `step_type` réels migrés `explain→eli5` / `reverse→vocal_explain` ; auto-génération du quiz de mission **reportée au Lot 2** (réutilisation d'un quiz prêt sinon étape omise) — Accepté (2026-07-05)
  - Amendements actés en cours d'implémentation, **dans le doc** : migration `f3a4b5c6d7e8` (`mission_steps.resource_id` ajouté, `step_type` migrés `explain→eli5` / `reverse→vocal_explain`, `missions.started_at` persisté) ; auto-génération du quiz de mission reportée au Lot 2 ; addendum **`variety`** (2026-07-06 — la matière de la veille se dérive des **faits persistés**, pas d'une élection théorique, sinon la rejouabilité devient récursive) ; amendement **ordre des étapes** (notion nouvelle → découverte d'abord ; notion déjà vue → **rappel d'abord**, effet de test) ; exécution frontend **en modale in-page**, jamais de redirection ; ⚠️ **facteur `forced_priority` amendé par `adr-0018` déc. 4** — le sélecteur lit désormais le **flag `mission.force_priority`** et non plus le `mission_type` (**bump `MISSION_SCORING_VERSION` v1→v2**) ; ⚠️ **parcours et verdict amendés par `adr-0019`** — step `mindmap` optionnel + `recall_ok` alternatif (**bump v2→v3**). Lignée de la version : **v1 → v2 (0018) → v3 (0019)**
- `docs/decisions/adr-0018-creation-manuelle-mission.md` — **Création manuelle de mission (« Commander »)** : raffine l'ADR-0017 (type `manual`, validée par construction) sans le rouvrir — Papa apporte le **scope**, ZETIS résout depuis l'évidence les **notions les plus fragiles** (`1−mastery`), preview/confirm **sans état** (patron ADR-0010) ; **fan-out : 1 mission mono-skill par notion cochée** (plafond `MISSION_COMMAND_MAX_SKILLS=3`), `manual`/`validated` par construction ; v1 = **2 portes** (Échéance = chapitre+date ; Thématique = sélection référentiel) — porte Recommandation (attend le Conseil de classe) et **voie texte-libre reportées** (constat read-before-code : `Skill` n'a pas d'embedding, seul `RagChunk` en a) ; `force_priority` **par flag** (plancher, jamais plafond → bump `MISSION_SCORING_VERSION` v1→v2), `due_date` **informationnelle Papa-only** ; migration `a7b8c9d0e1f2` (`force_priority` + `due_date`) — Accepté (2026-07-05)
- `docs/decisions/adr-0019-mindmap-etape-mission.md` — **La reconstruction de mindmap comme étape de mission** : active le créneau `mindmap` du vocabulaire fermé `step_type` (ADR-0017 §5) et amende le verdict §5bis — **verdict option B** : `acquired = reverse≥seuil ET (quiz≥seuil OU mindmap≥seuil)`, la **reconstruction se substitue au quiz** comme signal de rappel (la réexplication reverse reste **toujours** requise) ; preuve = `MindmapAttempt` postérieure au `start`, `mission_mindmap_threshold=70` ; **bump `MISSION_SCORING_VERSION` v2→v3** ; deep-link élève `/mindmaps/reconstruire/:id` (mode build) ; **aucune migration** (`step_type` `String(20)` suffit) — Accepté (2026-07-05)
- `docs/decisions/adr-0020-conseil-de-classe-ia.md` — **Conseil de classe IA** (synthèse périodique Papa-only) : **narration LLM 100 % locale** posée sur le **service d'évidence** (2e consommateur, ADR-0011/0017 ; zéro donnée Massimo vers le cloud, ADR-0008) — le LLM **narre et hiérarchise** une évidence **calculée**, il ne choisit pas de `skill_id` (piochés parmi les notions fragiles fournies, **validés serveur** anti-hallucination) ; **sortie typée versionnée** (`CouncilReportSpec`, `COUNCIL_PROMPT_VERSION`, patron ADR-0007/0015) ; **rapport persisté** (`council_reports` + snapshot d'évidence figé = auditabilité, car artefact LLM non rejouable) ; **pont d'actionnabilité** = recommandation → `create_command_missions` (fan-out **mono-notion**, validation Papa au clic, ADR-0018) ; croisées multi-matières et « évolution » comparative **hors v1** — Accepté (2026-07-06)
- `docs/decisions/adr-0021-equipement-mission-conseil.md` — **Équipement pédagogique d'une mission à sa création** (depuis le Conseil de classe) : « Créer ces missions » = **confirmer (popup Papa) → équiper → créer** ; ZETIS génère le **kit complet** par notion (cours + fiche + SRS + quiz + mindmap, orchestration des générateurs existants, 100 % local) **avant** de créer la mission (ses étapes résolvent les ressources fraîches) ; **auto-validation assumée et bornée** — la popup Papa vaut approbation (soupape §5ter de l'ADR-0017 actée ici, étroitement ; édition/rejet a posteriori), pas de relecture pièce par pièce ; **dégradation gracieuse leçon-centrée** — notion sans leçon canonique validée → contenus leçon-dépendants sautés + signalés (aucune fabrication de curriculum à la volée) ; idempotence (contenu déjà validé non régénéré), `try/except` par pièce ; progression = **barres estimées avec %** par notion — Accepté (2026-07-06). **Amendé par l'ADR-0023 + addendum ADR-0011 §E.6** : l'orchestrateur est extrait dans le module neutre `production` et son idempotence devient « déjà validé **et frais** » (une pièce périmée est régénérée ; une pièce `pending` *et* périmée est régénérée plutôt que validée).
- `docs/decisions/adr-0022-missions-croisees-champion.md` — **Missions croisées « champion »** (multi-matières, multi-outils, verdict PAR NOTION) : ADR dédié exigé par l'ADR-0017 §6 — **nouveau `mission_type='champion'`** (révise le vocabulaire fermé §1), UNE mission `subject_id`/`skill_id` NULL dont les **étapes traversent ≥ 2 matières**, taggées `skill_id` (migration **`c9d0e1f2a3b4`** : `mission_steps.skill_id` nullable, rétro-compatible) ; composition par **saveur** Papa (boss/consolidation/mix, preview/confirm sans état) → **équipement ADR-0021** par notion puis compose ; verdict §5bis **itéré par notion**, **XP majoré** (`base + par-notion`) + badge 🏆 ; **exclue du sélecteur quotidien** (jamais élue), présente en deck Massimo ; deux déclencheurs = **Commander « Défi champion »** + **reco croisée du Conseil de classe** (`create-champion`, agrège les recos ancrées ≥ 2 matières — pas de LLM) — Accepté (2026-07-06)
- `docs/decisions/adr-0023-production-par-scope.md` — **Production de contenu par scope** : constat read-before-code — **l'orchestrateur d'équipement existe déjà** (ADR-0021 : 5 générateurs orchestrés, idempotence, dégradation leçon-centrée, `try/except` par pièce) ; le chantier n'est pas d'écrire un moteur de lot mais de lui donner un **second point d'entrée**. **Extraction** du service `reports` → module neutre `production` (patron ADR-0011 §1 : un service à plusieurs consommateurs ne vit pas chez l'un d'eux — Conseil de classe, champion ADR-0022, Couverture), refactor à comportement constant ; **scope chapitre = une résolution, pas un orchestrateur** (`plan(scope) → [notion]`, fonction pure **partagée avec la matrice de couverture** : un substrat, deux consommateurs) ; **idempotence corrigée par §E.6** (« déjà validé *et frais* » — s'applique à *tous* les appelants, Conseil compris) ; **exécution asynchrone sans ordonnanceur** (`POST /api/production/equip` → 202 + RQ/`worker-ai`, patron du rendu MP4 capsules ADR-0007 Lot 2 — le cron futur appellera le même endpoint) ; **trois invariants d'exécution** : Massimo passe devant (pause si activité < 5 min, même Ollama que l'interface élève), bâton d'autorité (écriture massive → `system_state`), **plafond d'arriéré de relecture** (`PRODUCTION_MAX_PENDING` = 30 : une production qui dépasse durablement la capacité de relecture fabrique une dette qui tue le dispositif) ; provenance **`parent_bulk`** systématique (§F) ; **§7 — le blocage leçon devient la norme** sur un scope chapitre → la Couverture propose **deux passes distinctes et non fusionnables** (rédiger les cours → **validation Papa obligatoire et bloquante** → équiper) ; v1 = un chapitre × cours/quiz/fiche. **Hors v1** : cron (déclencheur événementiel « après validation », **prérequis dur : la file de relecture d'abord** — automatiser la fabrication d'un goulot est le seul vrai risque), file de relecture, scope matière/année, parallélisme, mindmap/capsule en lot. **Coût assumé** : l'auto-validation ADR-0021 passe d'un scope notion à un scope chapitre — un ordre de grandeur de contenu atteignant Massimo sans relecture pièce par pièce, mitigé par §F (visible), §5 (plafonné), §7 (le cours reste gaté), à surveiller sur le premier chapitre réel — **REMPLACÉ (2026-08-02) par l'ADR-0031** : accepté le 2026-07-28 et **jamais implémenté** — cinq semaines plus tard, aucune de ses décisions n'existait en code (`equip_notion` toujours dans `reports/`, `plan(scope)` inexistant, ni endpoint 202 ni worker, bouton « ⚡ Compléter le chapitre » encore désactivé, `batch_id`/`PRODUCTION_MAX_PENDING` jamais sortis de la prose). ⚠️ **Ce qui est remplacé est le PLAN D'EXÉCUTION, pas la doctrine** : l'ADR-0031 reprend ses cinq décisions validées telles quelles et les exécute ; ce document reste la référence pour leurs motifs (notamment le §7, gate humain sur la rédaction de cours) et pour l'observation de son §Suivi, que l'ADR-0031 érige en livrable. Conservé et non supprimé : **une décision acceptée puis restée lettre morte est en soi une information** — elle explique pourquoi le chantier d'autonomisation a été cadré sur un socle qu'il croyait exister — Accepté (2026-07-28)

- `docs/decisions/adr-0024-zetis-galaxy-progression.md` — **ZETIS Galaxy : la page Progression rendue en graphe 3D des connaissances** — *premier ADR sur la progression et la gamification* (ces décisions vivaient éparpillées entre `MEMORY.md`, specs de page et commentaires de code) ; cadrage d'un brouillon de fin juin **jamais confronté au code**, dont le read-before-code a invalidé **trois hypothèses** : `prerequisite_skill_ids` **n'existe pas** (et `parent_skill_id` est NULL partout — les « liens stellaires » n'avaient aucune source), `GET /progress/skills` **n'existe pas** (module `progress` Papa-only), et `/progression` **est déjà un onglet**. **Décisions** : la Galaxy est la **surface unique** de progression (pas de 6ᵉ onglet ; la section « par matière » **mockée** disparaît) — **route renommée `/galaxy` le 2026-07-31**, cf. addendum ; **arêtes dérivées de la structure réelle seule** (`Skill ← lesson_skills → Lesson → Chapter`, type `structure`, zéro donnée inventée, **aucune migration**) ; **rendu 3D `react-force-graph-3d`** en `lazy()` — **revirement assumé** : `@xyflow/react` retenu en début de cadrage puis disqualifié par l'exigence 3D + drag élastique, d'où **deux moteurs graphe coexistants** (React Flow reste celui des mindmaps, **ADR-0016 non rouvert**) ; **clic → panneau d'actions** adossé à une 3ᵉ route élève (constat : **seul ELI5 est notion-adressable par URL**, et aucune fonction backend ne dit « pour ce `skill_id`, quels contenus validés existent » — `production/coverage.py` est leçon-centrée **et** Papa-only), ~~règle ferme « une action sans contenu validé n'est pas proposée »~~ **RÉVISÉE le 2026-07-28** : panoplie **complète** renvoyée avec `available` calculé serveur, l'indisponible **grisé et non cliquable** (une fiche manquante n'est pas un échec de l'enfant, c'est du contenu que Papa n'a pas encore produit) ; **6ᵉ consommateur du service d'évidence**, non modifié (patron ADR-0011 §1). **Doctrine figée rétroactivement** : pas de rouge, **aucun score ni pourcentage par matière** (un **compte** d'étoiles allumées), **aucun capital perdable** (pas de streak — une étoile allumée ne s'éteint pas), `mastery_score` jamais affiché (**0–100**, pas 0–1), et le **6ᵉ statut réel `in_progress`** doit être mappé (→ `learning`) sous peine d'être manqué en silence. **Conditions de livraison** : `prefers-reduced-motion`, **repli sans WebGL** (liste par chapitre), plafond **adaptatif** `GALAXY_MAX_NODES` **40 / 90 / 150** (compact / tablette / desktop) — **valeurs provisoires, mesurées sur aucun appareil réel**. **Coût assumé** : un second moteur graphe (~600 Ko-1 Mo, isolé par `lazy()` + export en sous-chemin) et un **risque de perf 3D sur iPhone** — poste le plus **contraint** de Massimo, **pas sa cible unique** (iPhone + iPad + MacBook dédié à l'école) ; **MacBook vérifié le 2026-07-28**, iPhone, iPad et `prefers-reduced-motion` restent dus. **Hors v1** : graphe de prérequis (chantier pédagogique à part), annonce « +1 étoile », animation temps réel, réconciliation de `navigation.md` ; ~~aperçu Accueil~~ **AMENDÉ le 2026-07-28** (graphe global sur l'Accueil, `GET /api/student/galaxy/all`) puis **RÉVOQUÉ le 2026-07-31** (cf. addendum) — Accepté (2026-07-28), **livré** ; **3 amendements le jour même**, puis addendum le 2026-07-31
  - `docs/decisions/adr-0024-addendum-galaxie-page-dediee.md` — **Addendum ADR-0024 — la Galaxy prend sa route ; l'Accueil cesse de payer la 3D** : **renommage** `/progression` → **`/galaxy`** (redirection permanente, libellé de sidebar « Ma Galaxie » **à la même position** — c'est un **renommage**, pas l'ajout de la 6ᵉ entrée que l'ADR interdit, et l'alternative écartée en juillet « `/galaxy` **à côté de** `/progression` » reste écartée : **une seule surface de progression**) ; **révocation de l'amendement du 2026-07-28** — canvas 3D et frise **quittent l'Accueil**, remplacés par une **carte-bouton statique** (un **compte** d'étoiles allumées + pastilles de matières en CSS pur, **zéro import de `@zetis/ui/galaxy/canvas`** direct ou transitif, **test de budget de bundle**) : le coût assumé en juillet (« le moteur 3D arrive sur la page d'atterrissage », chunk 1,37 Mo / 368 Ko gzip) est **annulé, pas atténué** ; le **graphe global** livré le 28 pour l'Accueil (deux colonnes + badges matières cliquables + frise) n'est **pas supprimé, il change d'adresse** : `GET /api/student/galaxy/all` alimente désormais la **vue par défaut de `/galaxy`** — la **galaxie complète, toutes matières**, plafond adaptatif inchangé (replie sur matières + chapitres quand il mord), clic matière → constellation, et les **planètes CSS cessent d'être un écran** pour devenir l'**état d'attente** du chunk 3D et le **repli sans WebGL** ; `/galaxy` paie donc Three.js à l'ouverture — **c'est sa raison d'être**, le gain visait la page d'atterrissage, pas le produit → **zéro travail backend**, aucune route créée ni supprimée, aucune migration ; **continuité de télémétrie** : `POST /api/telemetry/pageview` enregistre la **route brute** depuis le 2026-07-28, le mapping route → libellé côté Papa doit accepter **les deux** valeurs sous **le même libellé**, sinon trois jours de fréquentation réelle de Massimo disparaîtraient de l'historique ou y apparaîtraient comme deux pages (**l'historique ne se réécrit pas, il s'interprète**) — seule surface Papa touchée, et **hypothèse à vérifier** : si ce mapping vit côté serveur (`parent/activity`), l'annonce « zéro backend » tombe — **TRANCHÉ à l'exécution (2026-07-31) : ce mapping n'existait NULLE PART**, ni client ni serveur ; le serveur servait la route **brute** comme `detail` (`activity/service.py:_detail_for`) et Papa la rendait **verbatim** (« Navigation · /eli5 »). Il n'y avait donc rien à **étendre**, il y avait quelque chose à **créer** : `frontend-papa/src/lib/routeLabels.ts`. « Zéro backend » **tient**, mais c'était du travail neuf ; **coûts assumés** : un clic de plus pour voir la galaxie, une redirection et un mapping à deux entrées à maintenir, et **deux décisions du même ADR rouvertes en trois jours** (4 amendements au total — le chantier Galaxy aura été cadré en marchant, c'est écrit pour être lisible, pas répété) ; **corollaires doc** : `page-accueil.md` **réécrite** — elle n'avait **jamais** documenté l'aperçu livré le 28, la spec était en retard sur le code **avant** ce chantier — maquette `mockup/mockup-page-accueil-v2.html`, et `zetis-galaxy.md §13` **redevient exact** ; **chantier autonome**, branche `feat/accueil-galaxy` (correction datée : une première rédaction le rattachait au Groupe 1/ADR-0026), **slice A** (renommage) → **slice B** (refonte de l'Accueil — héros ZETIS livré en **slot non rendu**, pour que le Groupe 1 le remplisse sans rouvrir la composition) — Accepté (2026-07-31), **les deux slices LIVRÉES le jour même**. **Trois écarts trouvés à l'exécution, tous documentés** : `GET /api/student/galaxy/overview` **n'existe pas** (c'est `/api/student/galaxy`, chemin vide — et `/overview` serait absorbé par `/{subject_slug}`, rendant « matière inconnue » plutôt qu'un 404 de route) et ne sert **aucun compte global** (somme client des `lit`) ; le **bandeau Agenda**, absent de la spec réécrite et de la maquette, est **CONSERVÉ** — c'est le seul accès à `/agenda` en phase 0 (ADR-0025), le suivre à la lettre aurait été une régression silencieuse, **la doc a été corrigée, pas le code** ; et la « brique à déplacer » du §C était en fait **deux implémentations concurrentes** (`HomeGalaxyPreview` ~420 lignes = expérience Galaxy complète, doublon de `GalaxyPage`) → **fusion** assumée, `GalaxyPage` absorbe la vue globale, l'orchestration en double disparaît. **Le test de budget interdit les `import()` autant que les imports statiques** : le canvas était **déjà** code-splitté le 28, ce qui coûtait c'était le **MONTAGE** — un test limité aux imports synchrones serait passé avant comme après, donc n'aurait rien protégé (contre-épreuve incluse, vérifiée en réintroduisant la régression)
  - `docs/decisions/adr-0024-addendum-accueil-vivant.md` — **Addendum ADR-0024 — un Accueil vivant, sans cadrage de perte** : la demande était une page plus vivante avec la **heatmap de Papa** en référence ; elle est **REFUSÉE par écrit**, avec ses **trois murs indépendants** (route supprimée par l ADR-0028 et vivant dans un agrégat `require_parent` ; `CLAUDE.md` interdit le « décompte de jours manqués, **sous quelque forme que ce soit** », et les cases vides d une grille **SONT** ce décompte ; `WeekDots.test.tsx:32` le verrouille par un test) — écrit pour ne pas être redemandé dans six mois. **À la place, la même idée RETOURNÉE** : « **Mon ciel** », une étoile par jour où Massimo a **gagné** du XP, **sans grille et sans axe de temps** — sans axe, il n y a **aucun intervalle vide à lire**, donc la carte ne **peut pas** devenir punitive même mal réutilisée (c est le mécanisme, pas une précaution d UI) ; placement **déterministe** dérivé de la date (jamais `Math.random` — un ciel qui se réarrange à chaque visite ne serait pas le sien), éclat ∝ XP du jour sur la rampe indigo → cyan → blanc, `prefers-reduced-motion` respecté. **La décision centrale** : `GET /api/gamification/history` est la **première route élève d historique**, et elle marche sur un refus **déjà écrit** (`motivation/router.py:38` : « un historique d objectifs manqués serait le streak déguisé ») — ce refus est **MAINTENU**, la distinction est de **nature** et non de degré : un **objectif** porte un attendu, donc son historique est un relevé d échecs ; un **XP** est un **gain obtenu**, et un jour sans gain n est pas un jour raté mais un jour dont il n y a **rien à dire**. **Le garde-fou est dans le CONTRAT, pas dans l UI** : les jours sans XP sont **OMIS du payload**, jamais renvoyés à zéro — la donnée d absence **n existe pas**, donc aucun client futur (qui n aura pas lu cet ADR) ne peut en dessiner une. Route dans `gamification` et **surtout pas** dans `activity`, dont le module porte la doctrine inverse (« un enfant chronométré travaille pour le chronomètre ») ; **aucune minute, aucune session, aucun `event_type`**, regroupement en **Europe/Paris** (le défaut exact relevé sur le streak retiré), fenêtre bornée serveur, **aucune migration**. **À coût nul** : « Tes derniers gains » réutilise `recent` et `badges`, **déjà servis** par `/api/gamification/summary` que le bandeau XP appelle **déjà sur cette page**, et **rendus nulle part** jusqu ici — le mapping des `reason` passe au passage de **3 à 8** (invisible tant que rien ne les affichait). **Rouvre le §B du 1ᵉʳ addendum sur un seul point** : la **frise revient** sur l Accueil — elle en avait été emportée **par association** avec le canvas, alors que le coût à annuler était **Three.js** et pas quelques lignes de SVG ; le motif tient, le **test de budget reste vert**. **Test-verrou** : le ciel ne rend **aucun élément** pour un jour sans activité — le pendant de l invariant `WeekDots` sur la nouvelle surface ; et **aucune date** n est affichée nulle part sur la page, une date rendrait le temps lisible et les intervalles vides avec lui. **Coûts assumés** : une route de plus, un second lecteur de `xp_events`, une page plus chargée (le calme du matin est partiellement rendu), et le **§B rouvert le jour même de son écriture** — branche `feat/accueil-vivant`, ouverte **par-dessus** `feat/accueil-galaxy` non mergée — Accepté (2026-07-31)
  - `docs/decisions/adr-0024-addendum-page-matiere-index-notions.md` — **Addendum ADR-0024 — la page
    matière est un index de notions, second rendu du modèle galaxie** : `/subjects/:slug` cesse d'être
    un launcher au grain matière (spec de Phase 1, **antérieure à la doctrine §5** et la contredisant
    sur trois points) et devient l'**index des notions** de la matière — la page matière **EST** le
    repli sans WebGL promis par `zetis-galaxy.md §11`, jusqu'ici une promesse ; contrainte dure :
    **aucun chunk 3D**, test de budget interdisant les `import()` autant que les imports statiques
    (leçon du 2026-07-31 : ce qui coûtait, c'était le **MONTAGE**). Nouvelle route élève
    `GET /api/student/subjects/{slug}/panoply` adossée au **prédicat de disponibilité EXTRAIT de
    `galaxy.notion_panel` en version ENSEMBLISTE** — `notion_panel` en devient le consommateur
    mono-notion, **interdiction d'un second prédicat** (le correctif n°2 du 2026-07-30 a déjà prouvé
    qu'il diverge : cours annoncé dispo sur `lesson_id is not None` au lieu de `content_markdown IS
    NOT NULL`, porte ouverte sur du vide) ; **test-verrou de cohérence croisée** (même `skill_id` →
    même `available` sur les 7 kinds) et nombre de requêtes **indépendant du nombre de notions**
    (référence `coverage.py` : 69 leçons / 18 requêtes / 79 ms). **Recherche locale et lexicale**
    (client-side sur l'index déjà chargé, accents pliés, zéro requête) — la recherche **sémantique**
    reste **au chat seul** : la dédoubler diviserait `resolve_skill` entre deux chemins et imposerait
    d'accorder deux seuils. **Rétrolien DÉRIVÉ du slug d'URL**, jamais d'un `location.state` (robuste
    au refresh, au partage d'URL et au retour physique iPhone) — ⚠️ hypothèse à vérifier sur ELI5,
    notion-adressable et non matière-adressable. **Panoplie entière avec l'indisponible grisé**
    (§4 révisé le 2026-07-28), **l'accent allant à la première activité FAISABLE**, **sauf ELI5 :
    non offerte sans cours validé** — résolution d'une contradiction réelle entre `notion_panel`
    (`eli5` toujours `available`) et l'orchestrateur (qui refuse d'y router sans cours, ELI5 dégradant
    vers le modèle) ; la règle vit **dans le prédicat partagé**, pas dans la page, sinon la divergence
    se reproduit un cran plus haut ; asymétrie assumée (routage ≠ outil). **Retirés de la spec de
    Phase 1** : niveau/XP par matière, « Notions à renforcer » (expose les manques de l'**enfant**,
    pas du **catalogue**), série en cours (streak retiré le 2026-07-27), « meilleure matière » (mise
    en concurrence). **Amende l'ADR-0017** : les activités notion-centrées s'ouvrent **en pleine
    page**, pas en modale — l'arbitrage 0017/0019 ouvert de longue date est tranché, la Galaxy l'ayant
    déjà tranché **de fait** avec son `navigate()`. Maquette `mockup/mockup-page-matiere-v1.html`,
    spec `page-matiere-dediee.md` **réécrite intégralement** ; branche `feat/page-matiere`, slice A
    (backend) → slice B (frontend). **Zéro table, zéro migration** — Accepté (2026-08-01), **les
    deux slices LIVRÉES le jour même**, puis **six amendements au vu de l'écran** : chapitres
    **tous repliés** à l'ouverture (la page présente la matière, pas un chapitre choisi POUR
    Massimo), **témoin « N prêtes »** sur l'en-tête replié (un COMPTE, jamais un ratio — un
    dénominateur ferait un score, un test l'interdit ; à zéro **ni témoin ni atténuation**, un
    chapitre grisé se lirait comme un reproche), **`session_size` par matière** ajouté à
    `/reviews/summary` (`flash_size` est GLOBAL et `due_count` est l'arriéré interdit ; le calcul
    vit là où vit `REVIEW_SESSION_MAX_SUBJECT`, recopier `8` dans un front l'aurait fait mentir),
    et une **bande « ce que ZETIS a pour cette matière »** qui remplace la carte « N cartes à
    revoir » — laquelle n'annonçait qu'un type sur six — **sans une requête de plus** (la panoplie
    porte déjà les identifiants), `eli5` **absent** (il ne stocke rien : capacité, pas produit) et
    `capsule`/`quiz` **non cliquables** (aucune route par matière n'existe ; les envoyer vers la
    liste globale serait la trahison que le rétrolien corrige ailleurs) — **décision RÉVISÉE le
    soir même** sur signalement (« le KPI 1 quiz ne marche pas ») : l'audit a montré que **le
    compte était juste** sur les 8 matières et que c'était l'**affordance** qui mentait, la
    pastille inerte étant rendue **comme une cliquable** ; d'où **`?subject=` ajouté à `/quiz`**
    (la bonne question devant une route manquante est « peut-on l'ajouter ? » avant « comment
    afficher qu'elle manque ? ») et la règle générale **une pastille non ouvrable doit se
    DISTINGUER à l'œil** — *une chose qui ressemble à un lien doit être un lien* — ne laissant
    que `capsule` dans ce cas. **Quatre constats du
    read-before-code ont invalidé le cadrage** : le prompt **se contredisait** (tests de
    `notion_panel` « sans modification » ET bascule ELI5 — tranché en deux temps, 668 verts zéro
    modifié, puis **exactement une** assertion retournée) ; `NotionActionPanel` **ne tire PAS
    three.js** (le baril est léger, Three vit hors baril) ; sa table de routes n'était **couverte
    par aucun test** (9 cas de caractérisation écrits AVANT l'extraction) ; et **`app.routes`
    n'est pas à plat** — un test « telle route n'existe pas » écrit dessus passe **à vide**, donc
    vert même si la route existe. ⚠️ **Piège de comptage à ne pas « corriger »** : les résolveurs
    prennent `MAX(id)` par leçon, donc une leçon à 3 fiches compte **1** sur la page matière et
    **3** sur `/fiches` — **les deux sont justes**, ils ne répondent pas à la même question.
    **Point ouvert** : la page **n'a jamais été vue à l'écran par l'agent**

- `docs/decisions/adr-0025-agenda-scolaire.md` — **Agenda scolaire** : première **source
  exogène** du produit (les dates viennent du collège, jamais de ZETIS) ; objet **distinct
  de `Mission`** (déclaratif et invérifiable vs composé sur preuves) ; **co-édition
  Massimo/Papa** sous quatre règles — aucune réécriture silencieuse, **seul Massimo coche**
  (403 côté Papa), archivage jamais suppression, doublons signalés non fusionnés ;
  traçabilité **non probante** (`agenda_item_created|done`, jamais de `missed` — « l'absence
  n'est pas un événement »), zéro XP, zéro impact sur `evidence/service.py` ; **règle de
  datation** — seul l'exogène est daté, le flux ZETIS ne l'est que par héritage d'une
  échéance réelle ; **bande glissante** 14 jours (3 avant / 10 après — révisée le 2026-07-29,
  tout l'horizon vers l'avant), asymétrie passé/futur
  serveur, **traces positives sans réceptacle vide** (conformité `adr-0024 §5`) ; concilié
  avec `adr-0018 §1` — l'invariant protège d'un compte à rebours *inventé*, pas *subi* —
  Accepté (2026-07-29)

  - `docs/decisions/adr-0025-addendum-temoin-nouveaute-agenda.md` — **Addendum ADR-0025 §12 —
  témoin de nouveauté ≠ compteur d'arriéré** : **révoque une interdiction explicite** de
  `page-agenda.md` (« aucune pastille de compteur sur l'entrée, sous aucune forme ») dont le motif
  était juste mais la portée trop large — elle visait l'**arriéré** et attrapait au passage le
  **témoin de nouveauté** du chantier `adr-0030`. **Test qui sépare les deux objets** : *une date
  qui passe sans que Massimo agisse change-t-elle le compteur ?* — arriéré **oui** (naît d'une date
  franchie, ne meurt que par le **travail**, grossit quand Massimo ne vient pas), nouveauté **non**
  (naît d'un geste de Papa, meurt d'un **regard**). **Badge chiffré**, pas la pastille muette
  d'abord proposée : celle-ci est une alarme sans quantité, **plus** anxiogène qu'un nombre, et
  refuser le chiffre là où le §1 autorise déjà la **date** d'une échéance subie était incohérent.
  **Décision structurante — la granularité de la donnée** : `agenda_last_seen_at`, **un
  horodatage par élève** (high-water mark, écrit à l'ouverture de `/agenda` **et** au rendu du
  bandeau d'Accueil), **jamais un `seen_at` par item** — joint à `done_at`, celui-ci fabriquerait
  la donnée persistée « **vu le 12, jamais fait** », lisible côté Papa par l'asymétrie de
  visibilité (§2c) : la surveillance par la porte de service que §2a et §2b condamnent, et un objet
  **pire** que le compteur qu'on évitait ; absent de `AgendaItemPilotOut` et de toute sortie
  `/api/agenda` (**symétrique exact de `parent_note`**, test de non-fuite). **Non révoqué et
  réaffirmé dans le même paragraphe** : `agenda_item_missed` n'existe pas (§3), aucun compteur
  d'arriéré sur les surfaces Massimo (§7), aucun compteur d'items non faits en KPI Papa (§9) — les
  deux règles se ressemblent assez pour devoir être **lues côte à côte**, les séparer garantirait
  qu'une prochaine session tranche au hasard. **Limite assumée et écrite (§12.5)** : le badge
  retombe à zéro dès l'ouverture et **y reste toute la semaine**, échéances en cours comprises — un
  témoin de nouveauté est **structurellement incapable** d'être un plan de travail, et le rendre
  capable reviendrait exactement à en faire un compteur d'arriéré ; la question « qu'est-ce que
  j'ai à étudier » reste servie par le bandeau d'Accueil et la bande glissante. **Test-verrou** :
  le badge ne bouge ni quand une échéance franchit sa date, ni quand un item est coché.
  Implémentation **dans le lot `adr-0030`**, jamais isolément — Accepté (2026-08-01)
  
  - `docs/decisions/adr-0026-chat-zetis-memoire.md` — **Chat ZETIS : mémoire éphémère,
  traçabilité typée, signal déclaratif** : le verbatim de conversation est **éphémère par
  construction** — M1 en Redis (TTL `CHAT_SESSION_TTL_MINUTES=120`, purge à la clôture),
  jamais PostgreSQL/MinIO, pipeline `ai_jobs` **aveugle au contenu** (le job porte une
  référence, jamais un texte) → la question « journal lisible par Papa ? » se **dissout :
  il n'y a pas de journal** ; le chat **écrit dans le journal commun** : trois
  `learning_events` exactement (`chat_topic`, `chat_tool_response`,
  `chat_difficulty_declared`), émis serveur, non probants, **zéro XP**, jamais de
  `chat_topic_missed` (doctrine `adr-0025 §3`) ; **signal déclaratif = signal faible** —
  premier producteur de `Gap.source=ai_observation`, `severity=low` toujours,
  **corroboration comportementale requise** (mastery `unknown|weak|learning`), jamais
  d'escalade ; **rappel jamais relance** (mémoire en session ouverte par Massimo
  uniquement) + phrase de transparence ; résolution question → `skill_id` (embeddings,
  module partagé) promue de différé ELI5 à **prérequis dur** ; **zéro table, zéro
  migration** — Proposé (2026-07-29)
  - `docs/decisions/adr-0026-addendum-retour-demandes-chat.md` — **Addendum ADR-0026 — le retour de
    demande se ferme dans le chat** : `content_requests` et `notion_requests` sont les **deux seuls
    endroits où Massimo parle en son nom propre**, et les deux seules boucles asynchrones **sans
    retour** — « je le note pour Papa » est un cul-de-sac. La boucle se ferme **là où elle s'est
    ouverte** : dans le chat, en **pull**, **une seule fois**, porté par le **contexte d'ouverture**
    (`ChatSessionOut.announcement`), **composé en Python, déterministe, jamais par le LLM**.
    **Le gate est la DISPONIBILITÉ, jamais le statut** — « Fait » ne change qu'une colonne ;
    l'annonce passe par **`resolve_panoply`** (prédicat unique, addendum ADR-0024), sinon on
    reconstruit le mensonge tué le 2026-07-30 ; `quiz`/`capsule` **non annonçables** (`_notion_route`
    n'a pas leur branche → **pas de route, pas de carte, pas de tampon**). **Pour `notion_requests`,
    le résolveur EST la preuve** : la table n'a **pas de `skill_id`**, donc on **rejoue `resolve_skill`**
    (0.72) sur le texte — il avait échoué à la création, qu'il réussisse **prouve** que la notion est
    entrée au programme (3 lignes max/ouverture, coût embedding borné). **Nommer 2, tamponner tout**
    (sinon le reliquat s'empile et redevient une pression) ; **tampon posé à la composition**, une
    annonce jamais lue est perdue — prix assumé de « aucune file qui grossit ». **Deux asymétries
    gravées** : le **refus n'a pas de canal** (jamais — le silence + la redemande gratuite, que
    l'idempotence de `create_request` gère déjà) et la **route 1 reste muette** (produire sans
    demande n'annonce rien : aucune promesse, donc aucune dette). **`adr-0026 §4` n'est pas amendé,
    il est APPLIQUÉ** ; corollaire : la session naît au **montage de `/chat`** (elle naissait au
    premier message). **Zéro table, zéro `event_type`, zéro composant** — deux colonnes
    `announced_at` + un composeur — Proposé (2026-08-02)

  - `docs/decisions/adr-0027-chat-orchestrateur.md` — **Chat ZETIS orchestrateur : intent typé,
  ancré, orienté vers l'existant** : le chat pilote toute l'app en langage naturel (« montre mes
  fiches sur les fractions », « c'est quoi mes devoirs »). Le LLM propose un **intent** typé, le
  **serveur l'ancre** (patron `reports._anchor`) — `resolve_skill` (slice A) → `galaxy/notion/{skill_id}`
  (matière + contenus **`available`**) → route construite depuis un id **validé** ; une cible non
  ancrable → `action=null` (**jamais de route hallucinée**). `ChatMessageOut.action` = `navigate` |
  `show_data` | `null`. **Navigation modale** : voix → navigue direct, clavier → carte-action à taper.
  **Données affichées dans le chat** (carte + bouton) ; le front fetch (pipeline **aveugle au
  contenu**, ADR-0026 §1c). **Orienter vers l'existant validé, jamais générer** (contournerait Papa) —
  **contenu absent → ZETIS enregistre une demande à Papa** (précédent `notion_requests` ; mécanisme
  différé, Point ouvert n°4) ; **aucun nouvel event** (réutilise `chat_tool_response`, zéro XP) ;
  **rappel≠relance**. Réalise le « routage outils » que l'ADR-0026 remettait à un chantier dédié ;
  **zéro table, zéro migration** — **4 décisions VALIDÉES le 2026-07-30** (Proposé jusqu'au commit sur `main`)
  - `docs/decisions/adr-0027-addendum-content-requests.md` — **Addendum ADR-0027 — liste d'attente de
    contenus pour Papa** : résout le **Point ouvert n°4** (mécanisme de la demande de contenu) et
    **amende le « zéro table »**. Nouvelle table **`content_requests {student_id, skill_id (NOT NULL),
    content_kind, status, source}`** + `UniqueConstraint(student, skill, kind)` (dédup forte, « ×5 » =
    1 ligne, `create` idempotent qui **ré-active** une ligne triée) — **distincte de `notion_requests`**
    (notion hors programme, texte libre) : deux sémantiques. Le chat **émet** (best-effort, aveugle au
    contenu §1c, jamais bloquant) sur deux déclencheurs : type précis manquant → `(skill, kind)` ;
    notion résolue mais **vide** → `(skill, cours)`. Papa la voit en **badge « ⭐ réclamé » sur la
    Couverture** (agrégat lu par le module `content_requests`, **fusion client par `skill_id`** via
    `CoverageNotionItem` — `production/coverage.py` **non touché**, invariant read-only préservé ;
    mutations `done`/`dismissed` **hors `production`**). **+ Volet HORS-PROGRAMME** : notion PAS au
    programme → chat émet en **OPT-IN** une carte `request_notion` (le tap crée un `notion_request`,
    producteur ELI5) ; **inbox Papa `/demandes` UNIFIÉE** (2 sections + pastille sommée) ; **2 ponts de
    création réels** `add-to-program` (→ Skill) / `create-lesson` (→ Skill+Leçon+cours optionnel) —
    « ✓ Ajoutée » ne créait rien auparavant. **+ correctifs live** : `notion_panel` cours honnête
    (`content_markdown`), prompt `chat_v2` (« jamais générer » porté), seuil résolveur 0.55→0.72,
    ELI5 non routé sans cours validé — Accepté (2026-07-30)
  - `docs/decisions/adr-0027-addendum-demandes-surface-eleve.md` — **Addendum ADR-0027 — demander un
    contenu depuis une surface élève** : lève le « hors lot » de l'addendum `content_requests`
    (« émission depuis d'autres surfaces que le chat ») et **ouvre une route enfant en ÉCRITURE**
    (`POST /api/student/content-requests`, `require_child`) sur un module jusqu'ici `require_parent` —
    décision de **sécurité**, prise en ADR et **pas dans un prompt de slice**, livrée en **commit
    séparé**. Constat : le chat émet déjà, mais l'émission est un **effet de bord invisible et
    unitaire** — Massimo la subit, ne sait pas ce qu'il vient de demander, et la surface qui montre
    *littéralement* ce qui manque (la panoplie grisée) n'a aucun moyen de le demander. **Écriture
    seule** : aucun `GET`, aucun `PATCH` élève — la file de Papa n'est pas une surface de l'enfant, et
    un « refusé » visible serait le vocabulaire d'échec interdit. **Trois garde-fous testés** :
    vocabulaire **fermé** (`422`), **plafond** `CONTENT_REQUEST_MAX_KINDS` (v1 = 7, la panoplie
    entière — « tout ce qui manque » tient en **un** appel), et **notion VISIBLE de l'élève** via la
    chaîne de filtrage existante (`skill_id` arbitraire → **404 et aucune ligne créée**, sinon la
    route devient un **oracle d'existence** sur les brouillons de Papa). `source` distingue
    `subject_page` de `chat_orchestrator` — le **choisi** du **subi**. Geste **opt-in** (« demander »
    sur une pastille grisée ; « tout ce qui manque (n) » en un appel), retour « **C'est noté pour
    Papa** », **jamais** « je te le prépare » ; aucun statut, aucun délai, aucun rappel affiché à
    l'enfant. **Aucun XP, aucun `event_type` neuf, aucune trace d'événement** — demander n'est pas
    apprendre, et la **ligne de file EST la trace** (`chat_tool_response` émis hors chat rendrait son
    nom menteur). `create_request` **non modifié** (idempotent + ré-activant : la dédup borne
    structurellement l'abus) ; `production/coverage.py` **non touché**. Écartés : réutiliser
    `notion_requests` (sémantique « hors programme, texte libre, `skill_id = None` » — l'inverse du
    besoin), un endpoint unifiant les deux files (recolle deux sémantiques séparées à raison), un
    `GET` élève « mes demandes » (expose `dismissed`, transforme une file de travail parent en écran
    d'attente d'enfant), et surtout **l'émission automatique à l'affichage d'une panoplie incomplète**
    (la file se remplirait du **survolé** et non du **voulu** — la demande perdrait son sens de
    priorité, précisément ce qui la rend utile à Papa). **Zéro table, zéro migration** — Accepté
    (2026-08-01), **livré le jour même**, puis **amendé DEUX fois le soir**. **(A)** « demander à
    **Papa** » devient « demander à **ZETIS** » : l'interlocuteur de Massimo est l'app — le même
    que dans le chat — Papa restant le **destinataire** (`source: "subject_page"` inchangé) ; le
    retour devient « **C'est noté par ZETIS** ». **(B)** la phrase « ZETIS transmet la demande. Il
    ne fabrique rien tout seul. » est **SUPPRIMÉE — divergence assumée avec cet ADR même**, qui
    l'exigeait : elle était le garde-fou de (A) (« demander à ZETIS » pouvait se lire « ZETIS va le
    faire »), et elle tombe parce que **ZETIS produira bientôt du contenu lui-même** — on ne fige
    pas dans l'UI une limite qu'on s'apprête à lever. Ce qui reste tient sans elle : « c'est noté »
    dit une demande **enregistrée**, sans promettre qui la traitera ni quand ; et le test qui
    vérifiait la phrase est **REMPLACÉ, pas supprimé** — il interdit désormais « je te le prépare »,
    tout délai et tout statut, de sorte que **le garde-fou change de forme sans disparaître**.
    ⚠️ **Un constat du read-before-code a invalidé un garde-fou** : le plafond de 7 « la panoplie
    entière » était **inatteignable donc décoratif** — la panoplie a 7 activités mais le vocabulaire
    n'a que **6** types (`eli5`→`cours`, `revision`→`card`), donc une liste dédupliquée ne peut
    jamais l'atteindre ; il est désormais mesuré sur la charge **BRUTE** (le plafond borne la
    **taille** de l'appel, le vocabulaire borne son **contenu**). **Point ouvert** : le jour où
    ZETIS génère, la demande déclenche-t-elle la génération ou passe-t-elle toujours par la
    validation de Papa ? `CLAUDE.md` penche pour la seconde — **décision d'ADR, pas d'UI**

  - `docs/decisions/adr-0028-dashboard-papa-agregat-unique.md` — **Dashboard Papa : agrégat unique,
    dérivation client, KPI actifs**. La maquette historique contredisait **sept** décisions déjà
    prises (panneau Obsidian vs `adr-0001` ; KPI XP / Niveau / **Série** vs `adr-0024` « aucun capital
    perdable » ; récompenses adossées au temps d'écran ; « taux de réussite 78 % » vs verdict découplé
    `adr-0017 §5bis` ; radar de compétences **sans source dans le modèle** ; générateur de quiz par
    formulaire vs `adr-0011`/`adr-0014` ; palette de Massimo). **Décisions** : `GET /api/parent/dashboard`
    devient **la seule requête du premier rendu** et renvoie les **trois fenêtres** (7/30/90) **non
    filtrées**, séries **par matière jamais pré-agrégées** (« Toutes » = somme client) → changer de
    période, de matière ou de focus **ne déclenche aucun appel réseau** (~1 500 entiers assumés,
    mono-élève par construction) ; **zéro état de chargement après le premier rendu**, exception unique
    et assumée du drill-down jour ; **les 4 KPI deviennent des filtres de focus** (`data-scope`), ce
    qui est la **carte de dépendance entre une mesure et ses preuves** et la seule chose qui rend huit
    diagrammes praticables sur une page ; **une seule carte heatmap à deux vues** (Calendrier =
    *est-ce régulier ?* / Créneaux = *quand travaille-t-il ?*), **échelle émeraude unique — pas de
    gradient vers le rouge** : une case dense n'est pas une bonne note ; nuage « Où agir » (temps ×
    consolidation) qui **repère** l'anomalie là où le Conseil de classe l'**explique**. **Read-before-code
    du 2026-07-31 : 2 vérifications sur 4 sont tombées**, d'où quatre amendements — **§3 bis** :
    « consolidée » **avait déjà** une définition serveur (`SkillMastery.status == "mastered"`, ≥ 90) et
    ce n'était **pas** « intervalle SRS long atteint » ; « fragile » n'en avait **aucune** → mapping
    figé sur les **6** statuts réels (`in_progress` inclus, même piège que `adr-0024`) et constante
    `FRAGILE_STATUSES`, ce qui fait que la page **n'hérite pas** du bug d'échelle `mastery_score` 0–100
    vs 0–1 (dette antérieure, hors périmètre) ; **§3 ter** : la courbe « fragiles » **n'était pas
    reconstructible** (aucun horodatage de bascule) → table **`skill_mastery_history`** + migration,
    ce qui **annule le « aucune migration attendue »** initial et donnera au Conseil de classe et aux
    missions la notion de **régression** qui leur manque ; **§6** : créneaux **8 h → 24 h** (8 h → 22 h
    ne faisait que 7 lignes) et minutes de nuit renvoyées à part plutôt qu'escamotées ; **§7** :
    `generated_at` **n'existe pas** (c'est `created_at`), la route est **`/conseil`**, et la page ne lit
    aucun param → **extension bornée** de `ConseilClasseIAPage` aux query params, en commit révocable
    seul, plutôt qu'un CTA inerte (`adr-0020` non rouvert ; bandeau de fraîcheur hors v1). Également
    constaté : `GET /api/parent/dashboard` **existait déjà** (réécriture **cassante**, un seul
    consommateur) ; `/api/parent/activity/heatmap` **n'a aucun consommateur hors dashboard** (le Cahier
    de bord utilise `/activity/sessions`) → supprimée, **mais** `DayDetailPanel` doit être re-monté
    sinon `/activity/days/{date}` devient orpheline ; les **quiz ne peuvent pas** entrer dans la file
    « À valider » (pas de `validation_status`, doctrine `adr-0014 §2`) ; **5ᵉ `kind="demande"`** ajouté
    (`notion_requests` + `content_requests` existaient déjà et attendaient Papa) ; **ni react-query ni
    lib de graphes** dans le dépôt → hook maison + SVG inline, **zéro dépendance ajoutée**.
    **§9** : la doctrine `adr-0024` (pas de rouge, aucun pourcentage) régit **l'interface de Massimo** ;
    côté Papa les pourcentages **par matière** restent légitimes — instrument d'analyse, pas bulletin —
    seule la **note globale unique** est bannie. Invariants maintenus : **rien du dashboard ne remonte
    chez Massimo**, **aucune notification push** (le décrochage se lit à la consultation) — Accepté
    (2026-07-31)

- `docs/decisions/adr-0029-rejeu-anime-galaxie.md` — **Rejeu animé de la galaxie : voir son chemin,
    pas seulement son état** — *nouvel ADR plutôt qu'un 3ᵉ addendum à l'`adr-0024`, qui n'y révise
    rien* : l'ADR-0024 décide **comment la galaxie est rendue**, celui-ci ajoute une **capacité**
    qui n'existait pas — rejouer le temps. **Constat du read-before-code : la donnée était déjà
    calculée** — `galaxy/service.py:394` faisait déjà `min(created_at).group_by(skill_id)`, soit
    « quand chaque notion a été allumée pour la première fois », puis **jetait le `skill_id`** pour
    ne garder qu'un compte ; rien à calculer, seulement à cesser de jeter (`?with_skills=true`,
    **opt-in strict** : sans le paramètre la clé est **absente** et non `null`, un test le
    verrouille — aucune table, aucune migration, aucune requête de plus). **Décisions** : le rejeu
    vit dans une **modale ouverte depuis « Mon ciel »**, en **DOUBLE `lazy()`** — la modale l'est,
    et elle seule charge le canvas, également en `lazy()` — parce que le graphe d'imports
    **statiques** de l'Accueil ne doit atteindre **ni l'une ni l'autre** : c'est ce qui garde la
    page d'atterrissage à **zéro Three.js au premier paint**, et un import statique d'ici
    remettrait 1,37 Mo **sans qu'aucun test ne le voie** (`accueil.bundle.test.ts` ne parcourt que
    le statique, précisément pour mesurer le premier paint) → un test constate en plus que **la
    modale n'est pas montée au chargement** ; **rejeu 3D EN DIRECT** (aucune image stockée : une
    capture périmerait dès la notion suivante ; le rendu vidéo `worker-media`/MinIO est **écarté**,
    réévaluable si un jour on veut *partager* le rejeu) ; **la frise devient la barre de lecture**,
    tout en **restant telle quelle sur l'Accueil** (information passive qu'on ne veut pas perdre).
    **Deux états seulement** — pas encore née, et allumée : l'état de maîtrise passé existe
    (`skill_mastery_history`, `adr-0028`) mais il est **Papa-only** et il **RÉGRESSE**, un rejeu
    bâti dessus montrerait des étoiles **s'éteindre** ; dérivé de `learning_events` **append-only**,
    le rejeu ne peut donc que monter. **Interdits** : aucune date lisible, aucune période vide
    annoncée, **aucun autoplay**, aucune comparaison entre périodes ; `prefers-reduced-motion` →
    état final + curseur manipulable. **Coûts assumés** : un clic pour y accéder, et une
    **troisième surface** qui monte `GalaxyCanvas`. **Vérifié en vrai** : 0 chunk 3D avant le clic,
    canvas monté après, curseur 0 → 11 → 22 → 37 étoiles — Accepté (2026-07-31)

- `docs/decisions/adr-0024-addendum-galaxie-animee.md` — **Galaxie animée : tout voir, et voir ça
    arriver** — troisième addendum à l'`adr-0024` en une journée, après quatre amendements : il
    révise le §6 (plafond de nœuds) et complète le §C du premier addendum — celui-ci décide ce qui
    est rendu sur la vue par défaut, celui-ci comment ça arrive. **Constat du read-before-code** :
    deux limites distinctes étaient confondues. `GALAXY_MAX_NODES` borne les constellations ; ce qui
    borne la vue par défaut, c'est le filtre client `root` + `subject` posé par le §C au vu du rendu
    réel — supprimer le plafond n'y change rien. **Décisions** : `GALAXY_MAX_NODES` est **SUPPRIMÉ**
    avec son repli « amas + dépliage » (valeurs jamais mesurées — « seul le MacBook a été vérifié »
    — repli absent des livrables de la slice B, donc probablement jamais écrit ; et surtout un
    plafond cache à Massimo une partie de sa propre progression selon un critère matériel, ce qui
    n'a jamais été défendable) ; trois gardes le remplacent, et elles visent le vrai coût — plafond
    sur les particules du flux doré (un objet animé par lien à chaque frame, c'est ça qui tue le
    framerate, pas des sphères statiques), `cooldownTicks` (moteur arrêté après stabilisation, la
    rotation caméra étant quasi gratuite), repli sans WebGL intact ; animation d'arrivée de la vue
    par défaut — le cerveau seul, puis les matières naissent au centre et rejoignent leur créneau,
    l'orbite se traçant derrière la planète (`CORE_IN=420`, `PLANET_STAGGER=80`, `PLANET_TRAVEL=700`
    `easeOutCubic`, `ORBIT_DRAW=600`, total ≈ 1,3 s), ordre du **PROGRAMME** (un ordre chronologique
    ferait de cet écran un mini-rejeu et introduirait un classement implicite, §5), une seule fois
    par visite (rejouer à chaque retour de constellation serait l'animation subie bannie partout
    ailleurs), `prefers-reduced-motion` → composition finale immédiate. C'est un **TWEEN**, pas une
    convergence : le §C pose que les planètes sont posées sur des orbites dessinées, « un placement
    calculé, pas un équilibre » — rallumer le moteur de forces rendrait l'amas refusé le matin même
    ⚠️ si le placement fixe `fx/fy/fz` le nœud est téléporté, n'affecter `fx/fy/fz` qu'à l'arrivée.
    Le filtre `root` + `subject` **N'EST PAS TOUCHÉ**. **Dette §6 reformulée, pas éteinte** : la
    mesure sur les trois appareils reste due, et sur un pire cas semé (référentiel validé complet) —
    l'iPhone tranche, et s'il ne suit pas ce sont les particules qui tombent, pas les nœuds. **Coût
    assumé** : on passe d'un plafond dur (qui n'a jamais servi) à des gardes qualitatives. Aucune
    route, aucun schéma, aucune migration — Accepté (2026-07-31)

- `docs/decisions/adr-0029-addendum-construction-depuis-root.md` — **Construction depuis `root` :
    une croissance, pas une lecture** — addendum à l'`adr-0029` écrit le même jour : il révise le §3
    (la frise servait de barre de lecture) et reformule le §4 (autoplay). **Diagnostic du saccadé**,
    deux causes, aucune n'est un réglage : (1) le pas de temps est la donnée elle-même — la série
    `timeline` est creuse, une journée de mission allume 5 ou 10 notions dans la même frame ; (2)
    chaque cran relance le moteur — réassigner `graphData` perd l'identité des objets nœuds, donc
    leurs positions (`react-force-graph-3d` n'est pas un composant contrôlé, l'`adr-0024` le note
    déjà). **Décisions** : horloge de **RANG**, une notion à la fois dans l'ordre de `first_lit`
    (`STAR_CADENCE=120`, `ANCESTOR_LEAD=60`, `BIRTH=480`) — choix doctrinal avant d'être technique,
    une horloge calendaire violerait les deux interdits du §4 (elle traverserait les vacances en ne
    montrant rien, ce qui est l'annonce d'une période vide) ; graphe **MUTÉ EN PLACE**, jamais
    réassigné, chaque nœud naissant aux coordonnées de son parent, `d3ReheatSimulation` à alpha bas
    (~0.2) ⚠️ jamais `alpha(1)`, c'est la ré-explosion qu'on corrige ; naissance des ancêtres
    dérivée côté client (une matière naît quand sa première notion descendante s'allume) — aucun
    changement d'API, `?with_skills=true` suffit déjà ; la frise devient **TÉMOIN** et non commande
    — plus de curseur, plus de drag, un seul bouton « Revoir » ⚠️ son axe X reste le **JOUR ACTIF**
    : une première rédaction proposait un axe de rang par cohérence avec l'horloge, c'était faux —
    cumul contre rang donne une droite, chaque cran ajoutant exactement 1, et la courbe n'aurait
    plus rien dit ; avec l'axe « jour », une journée à six notions monte en marche d'escalier et
    c'est ça l'information (écrit dans l'ADR pour que personne ne l'« unifie ») ; à la fin ça ne se
    fige pas — `autoRotate` et flux doré à particules, comportements déjà en place sur `/galaxy`,
    rien de nouveau à écrire, et une horloge apériodique par étoile (règle « pas de marionnette ») ;
    le §4 « aucun autoplay » est **REFORMULÉ**, pas supprimé — l'interdit visait l'animation subie
    sur la page d'atterrissage, or dans une modale ouverte exprès le démarrage immédiat est l'objet
    du clic ; nouvelle rédaction : aucune animation ne démarre sur une surface que Massimo n'a pas
    ouverte pour elle ; la modale rend le graphe **COMPLET** avec ses notions et ne peut donc pas
    réutiliser la configuration de la vue par défaut, qui en a été explicitement amputée (filtre
    `root` + `subject`) — l'amas ne se reproduit pas ici parce que la lisibilité vient de l'ordre
    d'arrivée, pas d'un plafond. **Coûts assumés** : on ne peut plus revenir en arrière dans le
    temps (le curseur n'était de toute façon utilisable qu'à la souris), et le temps n'est plus à
    l'échelle dans le canvas — la frise porte seule le relief temporel. Le double `lazy()` du §1
    tient, l'Accueil reste à zéro Three.js au premier paint. Zéro backend, zéro table, zéro
    migration, zéro requête — Accepté (2026-07-31)

- `docs/decisions/adr-0024-addendum-galaxie-sur-accueil.md` — **La galaxie revient sur l'Accueil :
    la vie vaut son prix** — **quatrième** addendum à l'`adr-0024` dans la même journée, et il
    **RÉVOQUE le §B** du premier, écrit le matin même. Motif **produit, pas technique** : voir la
    galaxie se construire donne à la page une vie qu'un compte statique ne donne pas — ce qui était
    déjà l'intention de l'addendum « Accueil vivant », écrit le même jour et qui, faute de mieux,
    s'était rabattu sur « Mon ciel » et « Tes derniers gains ». Deux décisions du même jour tiraient
    en sens inverse : l'une voulait un Accueil vivant, l'autre lui retirait ce qu'il avait de plus
    vivant. **Le coût est ASSUMÉ, pas redécouvert** : c'est le même 1,37 Mo qu'au matin, mis en
    balance avec autre chose et tranché autrement. **Ce qui sépare cette décision de la régression
    du 2026-07-28** : le canvas n'est **jamais monté au premier rendu** — la carte statique EST la
    première peinture, le ciel arrive ensuite à `requestIdleCallback` (repli `setTimeout` 600 ms,
    car **Safari ne l'expose pas** et c'est le navigateur de l'iPhone et de l'iPad de Massimo : le
    repli est le cas COURANT, pas un cas de bord). **L'Accueil rend la CROISSANCE COMPLÈTE**, étoile
    par étoile, via le hook partagé `useGalaxyGrowth` et **rejouée à chaque visite** — le §4 a été
    **corrigé dans la même session, au vu du rendu** : sa première rédaction ne montrait que le
    cerveau et les matières pour économiser deux requêtes, mais deux planètes qui glissent ne sont
    pas une galaxie qui grandit, et l'arrivée ne jouant qu'**une fois par session** la page
    **redevenait inerte dès la deuxième visite** — exactement ce que l'addendum voulait corriger ;
    **coût révisé assumé** : deux requêtes de plus (`galaxy/all` et la frise), tirées APRÈS la
    première peinture, la promesse « zéro requête de plus » étant remplacée par « rien avant la
    première peinture », vérifiée par test ; **tension assumée avec le §6 de l'ADR-0029** (« aucune
    animation ne démarre sur une surface que Massimo n'a pas ouverte pour elle ») — l'Accueil est
    l'exception, écrite ici pour ne pas être découverte comme une incohérence dans six mois ; portée
    de session **distincte** (`accueil` / `galaxy`) sans quoi l'Accueil consommerait le « une fois
    par visite » de `/galaxy`. **3D CONTEMPLATIVE** (`pointer-events-none`, `aria-hidden`) : toute
    la carte reste **une seule cible de clic** — décision du §B qu'on garde parce qu'elle vaut
    (viser un lien de fin de carte est un geste de précision inutile sur iPhone), et sans quoi un
    drag de nœud **dans un lien** déclencherait la navigation au relâchement ;
    `prefers-reduced-motion` ou absence de WebGL → **carte statique, point**. **Le test de budget
    CHANGE DE NATURE sans disparaître** : l'interdit de tout `import()` devient une **liste
    blanche** (`HomeGalaxyCard`), les quatre autres cas sont **inchangés** (aucun import synchrone,
    aucun fichier atteignant `three`, contre-épreuve sur `/galaxy`, garde-fou du test lui-même) et
    un cas est **AJOUTÉ** — le point de montage autorisé doit le faire en `import()`, jamais en
    synchrone. Ce qu'il protège encore, et qui est l'essentiel : qu'un **TROISIÈME** point de
    montage n'apparaisse pas sans que personne ne le voie, mode exact de la régression de juillet.
    **Alternative écartée par Papa** : animer la carte CSS existante (zéro Three.js, aucun ADR à
    rouvrir) — une pastille qui glisse n'est pas une galaxie qui naît. **Coûts assumés** : 1,37 Mo
    repartent vers l'Accueil (différés, jamais bloquants pour le premier rendu, mais téléchargés),
    une décision du matin révoquée le soir, une **troisième surface** montant `GalaxyCanvas` — donc
    trois endroits à vérifier à chaque changement du canvas — et un garde-fou **plus faible**, une
    liste blanche se rallongeant plus facilement qu'un zéro ne se franchit. Dette de mesure sur les
    trois appareils **inchangée et plus pressante** : l'iPhone doit maintenant tenir la 3D sur sa
    page d'entrée — Accepté (2026-07-31, soir)

- `docs/decisions/adr-0024-addendum-constellations-completes.md` — **Constellations complètes : tout
    est là, et tout est posé** — **cinquième** addendum à l'`adr-0024` dans la journée, et le
    **deuxième à révoquer une décision prise le matin même** : le **§C** (vue par défaut réduite à
    `root` + `subject`) tombe, `/galaxy` rend désormais la galaxie **ENTIÈRE**. **Le §C n'était pas
    une erreur de jugement** — c'était une décision correcte sous une contrainte qui n'existe plus,
    et c'est ce qui rend la révocation défendable plutôt qu'inconstante : son amas était **réel**,
    constaté au rendu, mais il venait de la **CONVERGENCE** et non du nombre de nœuds — un moteur de
    forces tasse les nœuds là où les forces s'annulent, sans égard pour la lisibilité, quel que soit
    leur nombre. Deux livraisons du même jour ont retiré cette contrainte (« Galaxie animée » §3 :
    matières posées sur orbites calculées, moteur éteint ; ADR-0029 §2 réécrit : positions calculées
    et nœuds **épinglés** pour que le rejeu pousse sans ré-exploser), si bien que le filtre
    protégeait contre un défaut **qui ne peut plus se produire**. **Trois anneaux CONCENTRIQUES
    autour du cerveau** — matières 150, chapitres 260, notions 370 — **corrigés au vu du rendu dans
    la même session** : une première version posait des orbites **emboîtées** (chapitres autour de
    leur matière, notions autour de leur chapitre), lisible sur le papier et **illisible à
    l'écran**, on ne voyait plus le centre mais des petits amas dispersés. Ce qui garde l'arbre
    lisible malgré des anneaux **communs** : chaque matière reçoit un **SECTEUR ANGULAIRE** et tous
    ses descendants y restent — on lit une part de tarte par matière, du centre vers le bord, la
    **hiérarchie en RAYON** et l'**appartenance en ANGLE** ; 78 % du secteur occupé, le reste étant
    la respiration sans laquelle deux matières voisines se touchent. ⚠️ Le nombre d'anneaux ne
    dépend **PAS** du nombre de matières : trois, toujours, un par étage — c'est ce qui distingue
    cette vue du système solaire du §C où chaque matière avait son orbite. Ordre des matières =
    celui du **programme**, jamais un classement ; **déterministe**, aucun `Math.random`.
    **L'arrivée sort chaque constellation d'un seul tenant** : tout ce qui descend d'une matière
    porte **le rang de sa matière** (`arrivalOrder`) — sans quoi les nœuds sortiraient du centre un
    par un et la constellation se **disloquerait en vol** — et la durée se compte en **rangs
    distincts**, pas en nœuds, donc cent notions d'une même matière n'allongent pas la chorégraphie
    d'un cran chacune. **Alternative écartée, et c'est LE piège** : tout afficher en rallumant le
    moteur de forces « maintenant qu'on maîtrise mieux » — c'est littéralement l'amas du §C, et le
    raisonnement est **inverse** : c'est parce qu'on ne rallume pas les forces que tout peut être
    montré. **Une incohérence disparaît au passage** : on avait supprimé un plafond de nœuds *parce
    qu'il cachait la progression de Massimo*, tout en gardant un filtre qui en cachait davantage.
    **Contrat serveur inchangé** — `galaxy/all` servait **déjà** tout le graphe, le filtre était
    **client** : zéro route, zéro schéma, zéro migration. **Coûts assumés** : beaucoup plus de nœuds
    à l'écran sur la vue par défaut et une **lisibilité à plusieurs centaines de notions JAMAIS VUE
    EN VRAI** (le point à regarder en premier), une deuxième décision du matin révoquée le soir, et
    une **dette de mesure devenue critique** — l'iPhone doit tenir la galaxie complète sur `/galaxy`
    alors que l'Accueil en montre déjà une ; si ça ne passe pas, ce sont les **particules** qui
    tombent, pas les nœuds. **Hors périmètre, et à ne pas décider avant d'avoir regardé** : le
    niveau de détail adaptatif (notions révélées au-delà d'un certain zoom), qui serait la vraie
    réponse si la lisibilité ne tenait pas — Accepté (2026-07-31, soir)

- `docs/decisions/adr-0030-temoins-nouveaute-navigation.md` — **Témoins de nouveauté en
    navigation** — *nouvel ADR plutôt qu'un addendum : la règle est **transverse** (elle touche
    `adr-0007`, `0013`, `0015`, `0016`, `0017`, `0025`), elle décrit un mécanisme qui n'existait
    pas, et elle a de vraies alternatives à documenter.* **Constat** : cinq surfaces portent déjà
    un badge « ✨ nouveau » **en page**, aucune ne le remonte en navigation — un contenu validé par
    Papa n'existe pour Massimo que s'il visite la page **au hasard**, ce qui vide de son sens le
    geste de validation. **La règle, en une phrase** : *un badge de navigation compte ce qui est
    **NOUVEAU**, jamais ce qui est **DÛ*** — nouveauté = naît d'un geste de Papa, meurt d'un
    **regard** ; arriéré = naît d'une date franchie, ne meurt que par le **travail**, **grossit
    quand Massimo ne vient pas** (c'est la définition d'une relance, interdite sur les deux
    interfaces). **Corollaire non négociable — un badge exige un `seen`** : un compteur de
    **récence** décroît par le temps et non par le regard, il allumerait une entrée fraîchement
    visitée et s'éteindrait sans avoir été lu → **ELI5 n'a pas de badge** (son `new_count` est un
    critère de récence à 7 jours sur `Lesson.created_at`, faute d'horodatage sur `Skill`), il reste
    sur ses decks. **Périmètre** : Agenda (`agenda_last_seen_at`, cf. addendum `adr-0025 §12` —
    seule entrée ayant exigé la révocation d'une interdiction écrite) · Fiches · Capsules
    (**spécifié dès `page-capsules-ia.md`, jamais livré en navigation**) · Révision — `new_count`
    **et surtout pas `due_count`**, à portée de main sur le même endpoint et précisément le
    compteur interdit (`adr-0013` : une carte due depuis 5 jours est « à revoir », jamais « en
    retard ») · Missions (`new_count` à créer : `validated` jamais démarrées). **Mindmaps différé
    et la dette est nommée** : `POST /seen` est un **no-op en V1** (`adr-0016`), le rendre réel
    demande une table miroir de `capsule_views` + migration — du backend étranger au chantier
    navigation ; mindmaps reste **la seule famille de dérivés sans témoin**, écrit ici pour que
    l'asymétrie soit datée et non oubliée. **Transport** : **un seul appel**
    `GET /api/student/news/summary` monté une fois dans `MassimoLayout`, invalidé par
    `NEWS_CHANGED_EVENT` (patron `CONTENT_REQUESTS_CHANGED_EVENT`, éprouvé en live) —
    **aucun polling, aucune horloge** : un compteur qui change sans que Massimo ait rien fait
    **est** une notification. **Forme** : le badge `DeckDisc` existant, `9+`, absent à zéro, sans
    pulsation ; **l'or reste à ZETIS qui parle**, l'ambre aux files de validation Papa.
    **§7 — la doctrine Papa est clarifiée, pas changée** : `page-dashboard.md` interdisait « tout
    badge de compteur en navigation » alors que la sidebar Papa en porte un (Missions `pending`) et
    que la pastille `/demandes` est livrée — deux objets distincts, une **file de validation**
    (travail que Papa a demandé) n'est pas un témoin de nouveauté, et ce dernier **ne s'applique
    pas à l'interface Papa**. **Coûts assumés** : un endpoint agrégé à étendre à chaque famille
    future, un `new_count` missions à créer, l'asymétrie mindmaps, et une **pression durable** pour
    brancher ces badges sur les files — c'est la version utile, et c'est la version interdite.
    **Test-verrou** : aucun badge ne consomme `due_count` / `due_at` / `done_at` / une échéance, et
    aucun écoulement du temps ne l'augmente. **LIVRÉ le jour même** (branche `feat/news-badges`),
    avec quatre écarts au cadrage, tous constatés au vu du code : (1) le §Constat était **faux** —
    la sidebar portait **déjà** deux pastilles avec un `fetch` chacune, le lot en unifie deux et en
    ajoute quatre ; (2) **`reviews/summary.new_count` était inutilisable ET violait déjà la règle en
    production** — il exige `due_at <= now` alors que `schedule_review` crée les cartes avec une
    échéance **future**, si bien qu'une carte fraîchement générée entrait dans le compteur 1 à
    7 jours plus tard **sans aucun geste** ; expression dédiée `new_cards_count`, et le badge
    Révision s'allume désormais dès la génération (conséquence visible assumée) ; (3) « le badge
    `DeckDisc` repris à l'identique » était ambigu — `DeckDisc` en porte **deux**, dont un compteur
    de cartes **dues** dont il ne fallait surtout pas emprunter le dégradé ; teinte emerald +
    plafond `9+` via `capNewsBadge`, **distinct** de `cappedCount` (15+) et un test croise les deux ;
    (4) **mindmaps n'est plus différé** — la dette du §4 a été levée dans la foulée à la demande :
    table `mindmap_views` (migration `d2e3f4a5b6c7`, calque de `fiche_views`, **sans compteur**),
    `mark_seen` cesse d'être le placeholder qui répondait 204 sans rien retenir, **plus aucune
    famille de dérivés n'est sans témoin** et le périmètre passe à **six entrées**.
    **Corollaire produit, tranché dans la même session** : un badge est **un nombre sans date** et
    ne peut donc pas répondre à « quand ai-je des choses à étudier » — le faire compter les items
    **non faits** en aurait fait le compteur d'arriéré interdit. La réponse est allée sur la bonne
    surface : le bandeau d'Accueil gagne une section **« À préparer »** alimentée par
    `/agenda/upcoming` (livré au Lot 1, jamais remonté), **avec les dates**, plafonnée à 2 — une
    échéance venue du collège est un fait **subi**, jamais un compte à rebours fabriqué par ZETIS
    (`adr-0025 §1`), et c'est l'argument même qui avait autorisé le badge chiffré. Zéro backend.
    668 tests back + 319 Massimo, E2E live vérifié (badges, retombée sans rechargement, aucun appel
    périodique, 14 → 13 mindmaps après un regard) — Accepté (2026-08-01)

## Quand créer un ADR ?

Créer un ADR si la décision :

- change la stack ;
- change l’architecture ;
- ajoute une dépendance lourde ;
- modifie la sécurité ;
- rend un service obligatoire ;
- change la séparation Massimo/Papa ;
- change la stratégie IA.

## Format ADR

```md
# ADR-XXXX — Titre

## Statut

Proposé | Accepté | Remplacé | Abandonné

## Contexte

...

## Décision

...

## Conséquences

...
```
