---
id: "0041"
titre: "Tout ce qui produit se voit, attend son tour, et ne se perd pas"
type: surface
statut: propose
date: 2026-08-06
pr: 99
revoque: []        # à remplir à la main — voir annexes/rapport-revocations.md
revoque_par: []
refs: ["0011", "0034", "0037", "0040", "0048"]
---
# ADR-0041 — Tout ce qui produit se voit, attend son tour, et ne se perd pas

## Statut

Proposé — 2026-08-06.

> S'appuie sur : `adr-0031` (production en lot, le journal, « les colonnes disent POURQUOI, jamais
> SUR QUOI »), son addendum `deux-passes-et-gate-cours`, `adr-0036-demande-vers-production` (Amendement 2)
> (« une file sans consommateur n'est pas une attente, c'est un arrêt »), `adr-0023` (l'orchestrateur
> existe déjà ; exécution asynchrone **sans ordonnanceur**), `adr-0011` §1 (un substrat, plusieurs
> consommateurs), `adr-0007` Lot 2 (le rendu MP4 — premier travail asynchrone du dépôt),
> `adr-0026` §4 (ce qui se prépare ne s'annonce pas à Massimo), `adr-0028` §4 (zéro état de
> chargement).
>
> **Ne rouvre pas** : la concurrence 1 du worker de production (« un seul Ollama, un seul GPU ») ;
> la préemption « Massimo passe devant » et son grain à la notion ; le refus d'un ordonnanceur
> séparé (`adr-0023`) ; les cinq régulateurs de volume et leurs trois natures distinctes ; le
> figeage du journal de production ; l'absence de toute surface de production chez Massimo.
>
> **Une migration** — deux colonnes et trois index sur `ai_jobs`, une colonne sur `production_runs`.
> Aucun backfill.

---

> ### Amendements
>
> | # | Date | Titre | Statut | Révoque |
> |---|---|---|---|---|
> | 1 | 2026-08-09 | ADR-0041 addendum — Un travail dit ce qu'il a produit | Accepté | — |
>
> *Tableau généré par `scripts/fusion_addendums.py` — ne pas éditer à la main.*

## Contexte

Le chantier est né d'une phrase du commanditaire, le 2026-08-06 :

> *« La barre de progression d'équipement n'a jamais été vue tourner — c'est ce que je veux
> optimiser. »*

Puis il s'est élargi, dans la même session, à sa vraie forme : **une barre unique dans le header
Papa, pour toute création de contenu, quelle qu'elle soit, d'où qu'elle parte, quel que soit le
déclencheur** — avec une file derrière, qui ne bloque pas et ne perd rien.

### Ce que le read-before-code a trouvé

**1. La barre existe déjà, exactement à l'endroit voulu.** `PapaLayout.tsx:83-118` porte une
pastille de production : point pulsant, trois états, le scope, le pourcentage. Elle est montée dans
le layout, donc elle survit aux changements de route sur les 22 pages. Sa doctrine d'affichage est
déjà écrite, et durement acquise — `useRunProgress.ts:28-52` : `queued` → `pct = null` et **jamais
0 %** (« quatre lots arrêtés affichaient 0 %, lu comme *ça démarre*, alors que rien n'écoutait la
file ») ; worker absent → **« en attente — aucun moteur de production actif »**, distinct de
« en file » ; estimation ancrée sur le `started_at` **du serveur**, jamais sur l'âge de l'affichage.

> **Il n'y a donc rien à inventer sur la façon de dire.** Ce qui manque n'est pas la barre : c'est
> ce qu'elle regarde.

**2. Il y a deux mondes de production, et un seul est déjà ce qu'on demande.**

| | Le lot (`ProductionRun`) | Les ~20 générateurs |
|---|---|---|
| Exécution | asynchrone, file RQ `production` | **synchrone, dans la requête HTTP** |
| État consultable pendant | statut, `done_notions/total_notions`, `heartbeat_at`, `started_at` | **aucun** |
| Progression | **réelle**, calculée serveur (`runs.py:419-423`) | estimation en dur côté client |
| File d'attente | oui, worker à concurrence 1 | aucune |
| Journal | `ProductionEvent` ligne à ligne, commit **par notion** | — |
| Régulateurs | cinq plafonds en code, qui refusent **et le disent** | aucun |
| Vu par le header | ✅ | ❌ |

Le chantier n'est donc pas de **construire** une file : c'est d'y faire entrer le monde synchrone,
et de donner à la barre la fenêtre sur les deux. `jobs.py:78-79` énonce déjà l'invariant à
préserver : *« un seul chemin d'exécution, quelle que soit l'origine »*.

**3. L'estimation locale ne se maintient pas — c'est mesuré, pas supposé.** 23 surfaces Papa
affichent une barre ; chacune déclare sa durée dans son coin. La **rédaction d'un cours a cinq
durées différentes** selon l'écran d'où on la lance — 45 s (`lib/production.ts:41`), 42 s
(`LessonContentModal.tsx:89`), 50 s (`OrphanNotionsPanel.tsx:162`), 50 s
(`NotionRequestActionModal.tsx:39`), 22 s (`ProgrammePage.tsx:34`). **`equip_notion` en a quatre** —
90 s (`ConseilClasseIAPage.tsx:26`), 90 s (`SubjectDetailRow.tsx:13`), 60 s/notion
(`ChampionMissionModal.tsx:27`), 69 s/notion (`lib/production.ts:190`). Le mindmap dit 32 s ici et
30 s là ; le quiz 60 s ici et 30 s là.

🔴 **Une seule de ces valeurs a été mesurée** : les 69 s/notion, relevées le 2026-08-02 (11 notions
en 12 min 35 s). Toutes les autres sont des devinettes, et deux d'entre elles pilotent la même
barre pour le même travail sur deux écrans — elles peuvent déjà diverger sans qu'un test rougisse.

**4. `AIJob` est une trace a posteriori, pas un travail.** Le modèle porte pourtant tout ce qu'il
faut (`status`, `started_at`, `finished_at`, `duration_ms`, `error_message`, `input_json`,
`output_json`). Mais :

- il est créé directement en `"running"` avec un `flush()`, **jamais un `commit`** — la ligne est
  **invisible hors de sa transaction**, donc inutilisable pour un affichage vivant ;
- le statut `"queued"` du défaut modèle **n'est employé par personne** ; `quizzes/service.py:297`
  va jusqu'à créer le sien directement en `"succeeded"` ;
- la table **n'a aucun index** (migration `5678d02df7f6`), alors que `quizzes/service.py:443` et
  `:961` la balaient entièrement ;
- **aucune route de liste** — seulement `GET /api/ai/jobs/{id}` ;
- `JobOut` **n'expose pas `error_message`** : un job `failed` est aujourd'hui **muet** côté client ;
- `created_by` porte l'**acteur** (`"child"`, `"worker-media"`), en `String(20)` sans vocabulaire
  fermé. Il ne dit pas d'où vient le travail.

**5. `apps/worker-ai/` n'existe pas.** C'est un README de trois lignes portant le mot
« Placeholder ». Le worker réel est `app.production_worker` — même runtime que le backend,
`SimpleWorker` sans fork, **concurrence 1, assumée et motivée** (`production_worker.py:12-14` :
*« un seul Ollama, un seul GPU »*).

**6. ⚠️ Les producteurs synchrones contournent déjà cette discipline.** Ils appellent le même
Ollama depuis le process HTTP, pendant que le worker travaille. La concurrence 1 n'est donc pas une
propriété du système : c'est une règle que **seul le worker respecte**. Deux générations peuvent
déjà se disputer le GPU aujourd'hui, sans que rien ne l'empêche ni ne le signale. Migrer ne
contraint pas une garantie existante — **cela la crée**.

**7. Cinq trous de durabilité, localisés.**

1. `enqueue_production` (`core/queue.py:73`) et `enqueue_render` (`:81`) **n'ont aucun try/except** —
   Redis absent ⇒ le `ProductionRun` est **déjà commité** (`runs.py:390`), ou la capsule est déjà
   passée en `rendering` (`capsules/service.py:392`), **puis** 500. L'objet existe en base,
   personne ne l'exécutera jamais, et le client reçoit une erreur.
2. **Aucun retry** — aucun `rq.Retry` nulle part.
3. La `FailedJobRegistry` de RQ existe et **rien ne la lit**.
4. `close_stale_runs` n'est appelé qu'**opportunément**, depuis `create_run` (`runs.py:263`) — un
   lot mort la nuit reste `running` jusqu'au prochain clic de Papa.
5. **Redis sans persistance configurée** (ni AOF ni `save` explicite, aucun `redis.conf` dans
   `infra/`), et `docker-compose.prod.yml` **n'a aucun service de worker de production** : en
   prod-like containerisé, la file `production` n'a **aucun consommateur**.

**8. `run_out()` n'applique pas `run_status()`.** Le Journal sait dire `stale` (`journal.py:417`) ;
`/runs/active` rend `run.status` brut (`runs.py:398`). Un lot zombie apparaît donc `running` dans le
header, indiscernable d'un lot vivant.

### Le point dur, et il commande la décision

**« Ne pas bloquer » et « ne pas attendre » sont deux choses différentes, et un seul GPU les
sépare.**

Mettre les producteurs en file rend la main à l'interface immédiatement — c'est la demande, et
c'est acquis. Mais le travail, lui, attend toujours son tour derrière le précédent, parce qu'il n'y
a qu'un seul moteur d'inférence. Une file ne supprime pas l'attente : **elle la rend visible et
ordonnée**. C'est un progrès réel, et c'en est un moindre que ce que le mot « file » suggère.

La conséquence est immédiate et doit être décidée, pas subie : un clic de Papa peut se retrouver
derrière un lot automatique de trente-six minutes parti à 3 h du matin. Sans décision, le
dispositif serait pire qu'aujourd'hui — car aujourd'hui, ce clic synchrone **double la file en
volant le GPU au worker**.

---

## Alternatives considérées

- **Tout fondre dans `ProductionRun`.** Casse au premier migrant : `generate_chapters` porte sur une
  `SchoolYearSubject` — ni chapitre, ni notion — et viole le `CheckConstraint` « exactement un
  scope ». Et `authorized_by`, les paliers d'autonomie et le gate de cours n'ont **aucun sens** pour
  « génère les chapitres du programme ». → Écarté : on diluerait l'objet le plus précis du projet
  pour y loger ce qui ne lui ressemble pas.
- **Tout aplatir en `AIJob`.** Un lot de 31 notions n'est pas un appel LLM : c'est 155 appels, un
  gate, une préemption, un journal, et **la seule progression non estimée du dépôt** — obtenue
  après qu'une estimation client ait été prise en flagrant délit de mensonge d'un facteur 2 (69 s
  réelles contre 150 s annoncées). → Écarté.
- **Un modèle de travail unique, dont le lot devient un cas.** Cinq tables de contenu portent déjà
  `production_run_id`. → Écarté : le chantier deviendrait d'abord une refonte de modèle, et la barre
  arriverait après.
- **Une barre agrégée, « 3 travaux · 41 % ».** Le chiffre n'a aucun sens physique : il mélangerait
  une progression réelle et deux estimations, et **reculerait** quand un travail nouveau entre dans
  la file. → Écarté (§7) — c'est exactement le genre de nombre qui ment sans qu'aucun test ne
  rougisse.
- **Une ligne par travail, empilées dans le header.** Le header fait 112 px (144 px ≥ `sm`) et porte
  déjà deux pilules ; un scan automatique peut créer plusieurs lots d'un coup. → Écarté (§7).
- **Notification d'échec passagère, puis le Journal.** Le Journal ne couvre que les travaux portés
  par un lot (`journal.py`, portée v1) : l'échec d'une fiche lancée à la main ne serait retrouvable
  **nulle part**. → Écarté (§8).
- **Rejeu automatique silencieux.** Une notion orpheline est insatisfaisable **par construction** :
  la rejouer trois fois ne fait que retarder le même verdict en consommant le GPU. → Écarté au
  profit d'un retry **borné et typé** (§10).
- **Faire remonter tout le retour visuel dans le seul header.** Papa clique « Générer » sur la page
  Fiches et son écran resterait muet. → Écarté (§9) : une source, deux rendus.
- **Migrer les compositions pur-DB aussi.** `create_missions_from_reco`, `champion/preview`,
  `confirm-backfill` ne font aucun appel LLM et durent des millisecondes. → Écarté (§4) : on paierait
  une file, un sondage et un aller-retour pour dégrader un geste instantané.

---

## Décision

### §1 — La barre est une fenêtre, jamais un producteur d'état

Elle **n'invente rien** : elle rend ce que le serveur dit, et rien d'autre. Toute la doctrine
d'affichage déjà écrite dans `useRunProgress.ts:28-52` devient la doctrine de **tous** les travaux,
sans exception :

- `queued` → `pct = null` et le libellé « en file d'attente ». **Jamais 0 %** — 0 % se lit
  « ça démarre », et c'est faux ;
- worker absent → **« en attente — aucun moteur de production actif »**. Une file sans consommateur
  n'est pas une attente, c'est un arrêt (`adr-0036-demande-vers-production` (Amendement 2)) ;
- toute estimation est **ancrée sur le `started_at` du serveur**, jamais sur l'âge de l'affichage.

⚠️ **`run_out()` doit appliquer `run_status()`** (point 8 du read-before-code) : un lot zombie doit
apparaître `stale`, pas `running`. C'est une correction, pas une fonctionnalité.

🔴 **Et une seconde correction, trouvée au read-before-code du 2026-08-06 — celle-ci vise le cœur
du dispositif.** `runs.py:419-423` fait déjà émettre **`progress_pct: 0`** au serveur sur un lot en
file (`else (100 if run.status == "done" else 0)`), et c'est `useRunProgress` qui rattrape côté
client en le remplaçant par `null`. Or cet ADR fait de `/activity` **la source unique**. Bâtir
l'endpoint sur `run_out()` tel quel **déplacerait le mensonge du client vers le serveur**, là où
plus personne ne le rattrape — l'exact contraire du but.

> `/activity` émet **`pct: null`**, jamais `0`. Le zéro n'est pas une valeur basse, c'est une
> absence de mesure, et les deux ne se rendent pas pareil.

### §2 — Deux modèles conservés, une lecture unifiée

`ProductionRun` reste **le lot pédagogique** : les paliers gravés au départ, le gate de cours, le
journal ligne à ligne, la progression réelle. `AIJob` devient **le travail unitaire de file**.

Un endpoint neutre les normalise pour tous les consommateurs — patron `adr-0011` §1 : *un service à
plusieurs consommateurs ne vit pas chez l'un d'eux*.

```txt
GET /api/production/activity        (require_parent)
```

Il ne vit **ni** dans `reports`, **ni** dans `ai` : il vit dans `production`, qui est déjà le
module neutre extrait pour cette raison exacte (`adr-0023`).

### §3 — `AIJob` cesse d'être une trace et devient un travail

Trois changements, aucun destructeur :

1. **Le statut `queued` devient réel.** La route crée la ligne en `queued` **et commite**, *puis*
   enfile. Le worker la passe `running`, puis `succeeded` / `failed`. Le patron existe déjà et
   fonctionne — `worker-media/jobs.py:24-33` commite immédiatement. Le `flush()` de `_run_traced`
   reste pour les producteurs **non migrés** : ils durent des millisecondes et n'ont pas à
   apparaître.
2. 🔴 **L'origine ne se stocke PAS sur le travail — elle se dérive.** *(Corrigé au
   read-before-code du 2026-08-06 ; une version antérieure de ce §  ajoutait une colonne
   `trigger` à `ai_jobs`.)*

   Le modèle l'interdisait déjà, et le motif est écrit en tête de `db/models/production.py` :
   *« `trigger` vit ici et **nulle part ailleurs** : un même déclencheur engendre un cours, trois
   fiches, deux quiz et huit cartes. Le poser sur chaque ligne de contenu, c'est le recopier sur
   cinq tables et le voir diverger au premier correctif. »* Un lot `agenda` sur un chapitre de
   31 notions produit **155 `AIJob`** : la colonne aurait recopié 155 fois le même fait.

   **L'invariant qui la remplace, vérifié en code** — `triggers.scan_agenda` et
   `triggers.scan_requests` passent **tous deux** par `create_run` : il n'existe aucun chemin par
   lequel un déclencheur automatique produirait un travail **hors lot**. Donc :

   > **Hors lot ⇒ `manual`. Toujours.**

   Un travail de `kind="job"` dans `/activity` est un geste direct ; un travail de `kind="run"`
   porte le `trigger` que l'`adr-0031` lui a déjà donné. Rien à ajouter, rien à synchroniser.
   Le jour où un déclencheur automatique produirait un travail hors lot, **c'est ce jour-là** que
   la colonne se justifiera.

   ⚠️ Et on ne réutilise pas davantage `created_by` : il porte l'**acteur** (`"child"`,
   `"worker-media"`), pas l'origine.
3. **La file n'est PAS une colonne** non plus. Elle se **dérive** de la même façon (§5). Une
   colonne qui duplique une dérivation donne deux réponses à une seule question — et c'est cette
   règle-là, écrite ici, que le point 2 violait avant sa correction.

### §4 — Ce qui entre dans la file, et ce qui n'y entre pas

**Entrent** — tout producteur faisant au moins un appel LLM long : `equip_notion`, les cinq
générateurs (cours, fiche, cartes SRS, quiz, mindmap), `curriculum_*` (chapitres, leçons,
skills-backfill), les capsules (script et voix), le diagnostic.

**N'entrent pas** — les compositions **pur-DB, sans LLM** : `create_missions_from_reco`,
`create_champion_from_reco`, `champion/preview`, `generate_remediation|revision|progression`,
`confirm_skills_backfill`. Elles durent des millisecondes ; les enfiler dégraderait un geste
instantané pour rien.

⚠️ **`create_champion_mission` est un cas mixte** : il compose (pur DB) **après** avoir bouclé
`equip_notion` sur chaque notion. Il entre par ses équipements, pas par sa composition.

L'ingestion RAG reste synchrone en v1 — elle ne fait pas d'appel LLM de génération, et son
déclencheur (un dépôt de fichier par Papa) porte déjà son propre retour.

### §5 — Deux files : le geste de Papa passe devant, le lot n'est jamais interrompu

Le worker écoute **deux files, dans l'ordre** — RQ sert la première d'abord :

| File | Alimentée par | Motif |
|---|---|---|
| prioritaire | `trigger = "manual"` | `runs.py:347-349` : **« le geste EST le régulateur »** — aucun plafond de volume ne s'applique déjà à un clic de Papa |
| normale | `agenda`, `request`, et tout déclencheur automatique futur | le travail que personne n'attend devant son écran |

🔴 **Le travail en cours n'est JAMAIS interrompu.** Le grain de préemption reste la notion, et
`runner.py:12-14` a déjà tranché : *prétendre interrompre un appel LLM serait un mensonge
d'architecture*. « Passer devant » veut dire **prendre le prochain créneau libre**, pas voler
celui-ci.

⚠️ **Conséquence à assumer et à afficher** : un clic de Papa pendant un lot de 31 notions attend
la fin de la **notion en cours** (~69 s), pas la fin du lot. C'est ce que la barre doit dire — et
c'est très exactement ce que l'estimation locale ne pouvait pas savoir.

### §6 — Deux régimes de vérité, distingués dans le contrat

Un lot sait dire « 7 sur 31 ». Une génération de fiche **ne sait rien dire** pendant ses 32 s : il
n'y a rien à sonder à l'intérieur d'un appel LLM. Les confondre reviendrait à uniformiser un
mensonge.

Le contrat porte donc `pct_is_measured` :

- `true` — progression **réelle**, calculée serveur (le lot, et lui seul aujourd'hui) ;
- `false` — estimation ancrée sur `started_at`, rendue avec une **barre indéterminée** quand la
  durée attendue est inconnue.

La brique sait déjà le faire : `generation-progress.tsx:67-84`, `value: null` ⇒ liseré qui balaie
et **chiffre retiré**. Motif déjà écrit : *« quatre lots arrêtés affichaient 0 % »*.

### §7 — Ce que la barre montre quand plusieurs travaux se pressent

**Le travail courant, et lui seul** : sa barre, son pourcentage (ou son indéterminé), son libellé,
son origine. Plus un compteur discret **« +N en attente »**. Un clic ouvre le détail complet —
`ActiveProductionModal`, déjà monté dans le layout.

Ce qui n'est pas montré est **à un clic**, jamais caché. Le header reste lisible à toute charge, et
aucun nombre agrégé ne se substitue à la réalité de la file.

⚠️ **« +N en attente » n'est pas le compteur que `runs.py:493-496` interdit**, et la distinction
s'écrit ici plutôt que de se laisser à l'intuition du prochain lecteur. `active_run()` porte cette
clause : *« L'indicateur qui le consomme ne doit à aucun moment devenir un compteur d'arriéré […]
la provenance est un fait, jamais un reproche, et elle ne se totalise pas »* (`adr-0011` §F.2). Ce
qu'elle interdit, c'est de totaliser une **dette de relecture** — « 12 contenus non contrôlés », un
reproche permanent. « +2 en attente » compte du **travail en vol**, il retombe à zéro tout seul, et
il ne dit rien de ce que Papa aurait dû faire. Profondeur de file, pas arriéré.

Quand rien ne tourne et que rien n'a échoué, **la barre n'existe pas** — comme la pastille
aujourd'hui. Un indicateur permanent à l'arrêt est un bruit permanent.

### §8 — L'échec reste jusqu'à acquittement

Un travail échoué **passe la barre en état d'échec, avec son motif, et Y RESTE** jusqu'à ce que
Papa la ferme d'un clic. Pas de fermeture automatique.

Motif : un échec qui disparaît après six secondes pendant que Papa est dans une autre pièce est un
**travail perdu en silence** — la négation exacte de « rien ne doit se perdre ». Et le Journal ne
peut pas servir de repli : sa portée v1 ne couvre que les travaux portés par un lot, donc une fiche
lancée à la main et échouée ne serait retrouvable nulle part.

L'acquittement est **serveur**, pas client : une colonne `acknowledged_at` sur les deux tables.
Un acquittement en `localStorage` serait par navigateur, et reviendrait au prochain appareil.

⚠️ **Prérequis** : `JobOut` doit exposer `error_message`. Un job `failed` est aujourd'hui muet.

### §9 — Une source, deux rendus : les 23 constantes meurent, les barres locales restent

Les barres locales **ne disparaissent pas**. Papa clique « Générer » sur la page Fiches : son écran
doit répondre, là où le geste a eu lieu. Faire remonter le seul retour visuel dans le header serait
déroutant.

Ce qui disparaît, ce sont les **23 constantes de durée en dur** — les cinq du cours, les quatre
d'`equip_notion`, et les divergences 32/30 et 60/30. Les deux rendus lisent **la même source**.

- Le header dit : *il se passe quelque chose, quelque part, et voilà quoi.*
- La page dit : *où en est ce que tu viens de lancer.*

**Test-verrou** : aucune constante de durée en millisecondes ne subsiste dans un composant Papa
pour un travail migré.

### §10 — Les trois trous de durabilité que la barre révélerait

Traités ici, parce que sans eux la barre **mentirait** — elle afficherait « en cours » sur un
travail que rien n'exécute :

1. **L'enfilement devient sûr.** L'objet n'est pas commité avant que son enfilement soit acquis. Si
   la file est injoignable, le travail n'est pas créé, et **la route le dit** — plutôt qu'un lot
   fantôme en base et un 500 dans le navigateur.
2. **Retry borné et typé.** Deux tentatives sur échec **transitoire** (moteur injoignable, timeout).
   **Zéro** sur échec **structurel** (notion orpheline, prérequis absent, gate non franchi) : c'est
   insatisfaisable par construction, et rejouer ne fait que retarder le verdict en brûlant le GPU.
   Le verdict structurel remonte **immédiatement** à la barre.
3. **Balayage périodique des travaux zombies.** `close_stale_runs` cesse d'être opportuniste : il se
   greffe sur le réveil **déjà en place** (`scan_triggers` se replanifie seul). Aucun ordonnanceur
   nouveau — l'`adr-0023` en a refusé un, et cet ADR ne le rouvre pas.

#### 🔴 Corrigé au read-before-code de la Slice B (2026-08-06) — trois points

Ce §10 a été écrit avant que la Slice A n'existe. Trois de ses affirmations ne tenaient plus.

1. **Il y a TROIS enfilements sans filet, pas deux.** `enqueue_ai_job` est né dans la Slice A, avec
   le même trou — et c'est **le chemin de la barre**. Le §10.1 s'y applique aussi.

2. **Le §10.4 était infaisable en l'état.** Un `AIJob` n'a **aucun `heartbeat_at`**, et
   `activity._travail` rendait `job.status` **brut** : le défaut exact que le §1 venait de corriger
   pour les lots, réintroduit le même jour sur le modèle frère. Il y fallait donc une lecture
   dérivée symétrique — `sweep.job_status()`, miroir de `journal.run_status()`. Le seuil retenu est
   `PRODUCTION_JOB_TIMEOUT`, **le délai auquel RQ tue le job lui-même** : aucun réglage nouveau,
   aucune variable d'environnement, et une borne qui a un sens par construction.

3. 🔴 **Le balayage ne peut PAS être ce qui rend la barre honnête.** Le seul réveil périodique du
   dépôt bat toutes les **180 minutes** (`production_scan_interval_minutes`). Faire dépendre
   l'affichage de ce passage aurait laissé la barre mentir trois heures — le défaut même que ce
   chantier ferme. C'est le **§1 qui tranche** : *la barre est une fenêtre, jamais un producteur
   d'état*. La vérité se **dérive à la lecture**, instantanément ; le balayage n'est plus que du
   ménage en base (libérer `/runs/active`, cesser de compter un mort parmi les vivants). Les deux
   gestes sont désormais nommés séparément dans `production/sweep.py`, et la contrainte
   « aucun ordonnanceur nouveau » est tenue **sans rien concéder à l'écran**.

#### Borne posée sur le §10.2 : le rejeu ne vaut QUE pour le travail unitaire

Le `Retry` est posé sur `enqueue_ai_job`, **pas** sur `enqueue_production`, et ce n'est pas un
oubli. `runner.execute` réécrit `started_at`, recalcule `total_notions` et **réempile ses lignes de
journal** : un lot rejoué se raconterait deux fois, alors que l'ADR-0034 §1 fait du journal la seule
mémoire de ce qui a été produit. Un lot interrompu se reprend par un lot **neuf** — `equip_notion`
saute ce qui existe déjà (`piece_deja_produite`), donc la reprise ne recalcule rien. Les trois
exemples d'échec structurel du §10.2 (notion orpheline, prérequis absent, gate non franchi) sont
d'ailleurs tous des notions du monde unitaire.

### §11 — Deux dettes nommées, non traitées ici

- ⚠️ **Persistance Redis non configurée** — ni AOF, ni `save` explicite, aucun `redis.conf`.
  Défauts d'image seuls ⇒ jusqu'à 60 s de travaux perdus sur crash brutal. « Rien ne se perd »
  n'est donc vrai qu'**au-dessus de Redis**, et cet ADR le déclare plutôt que de le laisser croire.
- ⚠️ **`docker-compose.prod.yml` n'a aucun service de worker de production.** En prod-like
  containerisé, la file n'a aucun consommateur — la barre dirait « arrêté » en permanence, et elle
  aurait raison.

Les deux sont de l'infra de déploiement, sur un environnement qui n'est aujourd'hui **déployé nulle
part** : les traiter ici, ce serait écrire du non-vérifiable.

### §12 — Massimo ne voit rien, et ce n'est pas une omission

Une production **déclenchée par une demande de Massimo** s'affiche **chez Papa uniquement**. La
décision existe et reste motivée — `useActiveProductionRun.ts:11-14` : *« lui montrer que du
contenu se prépare serait une PROMESSE, donc une relance (`adr-0026` §4) »*.

Aucune surface Massimo n'est touchée. `require_parent` de bout en bout.

### §13 — Le contrat réseau

| Besoin | Route |
|---|---|
| l'activité, pour la barre et pour les pages | 🆕 `GET /api/production/activity` |
| acquitter un échec | 🆕 `POST /api/production/activity/{kind}/{id}/ack` |
| l'état d'un travail précis | `GET /api/ai/jobs/{id}` — **`JobOut` gagne `error_message`** |
| le lot actif | `GET /api/production/runs/active` — **inchangée**, mais `run_out()` applique enfin `run_status()` |

```txt
GET /api/production/activity
→ {
    current:      Activity | null,   # le travail en cours ; à défaut, le premier de la file
    queued_count: int,               # combien attendent derrière lui
    failed:       Activity[],        # les échecs NON acquittés
    worker_alive: bool | null        # null = question pas posée, jamais confondu avec false
  }

Activity = {
    kind:            "run" | "job",
    id:              int,
    label:           str,            # « Équipement · Théorème de Pythagore »
    status:          "queued" | "running" | "stale" | "failed",
    pct:             int | null,     # null = indéterminé. JAMAIS 0 pour dire « ça démarre »
    pct_is_measured: bool,           # §6 — progression réelle vs estimation ancrée
    started_at:      datetime | null,
    trigger:         str | null,     # DÉRIVÉ (§3.2) : run → run.trigger ; job → "manual"
    error:           str | null
  }
```

`/activity` sert **une requête agrégée** : les `ProductionRun` actifs et les `AIJob` actifs en une
passe, **aucun N+1**. Sondage sur le patron existant — `useActiveProductionRun.ts:23`, 4 s, ramené
de 20 s le 2026-08-03 parce qu'*« un lot-pièce dure 15 à 17 s : à 20 s de période, l'indicateur
pouvait ne JAMAIS voir un lot entier »*. La détection de fin réemploie le même patron : l'id
mémorisé, relu **une seule fois**, jamais sur un travail déjà fini au chargement.

### §14 — La migration

```txt
ai_jobs         : + acknowledged_at DateTime(tz) nullable
                  + index (status, created_at DESC)   — la lecture d'activité
                  + index (job_type, status)          — les stats de quiz, qui balaient aujourd'hui
                                                        TOUTE la table (aucun index n'existe)
production_runs : + acknowledged_at DateTime(tz) nullable
```

**Aucun backfill**, et **aucune colonne d'origine** : le §3.2 l'a retirée au read-before-code. Une
ligne historique non acquittée vaut `acknowledged_at = NULL`, ce qui est exactement « jamais
acquittée » — pas d'ambiguïté à lever, donc pas de rétro-attribution à écrire.

### §15 — Ce que les tests ne pourront pas prouver, écrit d'avance

`conftest.py:29-34` **interdit toute connexion Redis** en test, et `conftest.py:37-69` installe un
fixture `autouse` qui remplace les **fabriques** de file par une `FakeQueue` — protection posée
après que **18 jobs réels** soient partis dans la file de dev le 2026-08-04.

Les verrous porteront donc sur **l'appel** (« ce chemin a bien enfilé, avec ces arguments, sur cette
file »), **jamais sur l'exécution**. Aucun test ne prouvera qu'une barre avance.

⚠️ **Corollaire connu, déjà payé** : patcher `enqueue_*` est **vert et sans effet** — `runs_router`
importe la fonction au niveau module. **Le point de greffe est la fabrique.**

Conséquence directe : **ce chantier se vérifie à l'écran ou il ne se vérifie pas.** Voir « Suivi ».

---

## Ce que cet ADR ne fait pas

- **Il n'augmente pas la concurrence du worker.** Un seul Ollama, un seul GPU : la file ordonne
  l'attente, elle ne la supprime pas.
- **Il n'interrompt aucun travail en cours.** Le grain de préemption reste la notion.
- **Il ne crée aucun ordonnanceur.** Le réveil périodique existant suffit ; l'`adr-0023` a refusé
  un ordonnanceur séparé et cet ADR ne le rouvre pas.
- **Il ne migre pas les compositions pur-DB.**
- **Il ne touche pas à `apps/worker-ai/`** — un README de trois lignes qui n'a jamais rien exécuté.
  Le supprimer ou l'écrire est un autre sujet.
- **Il ne configure pas Redis, ni `docker-compose.prod.yml`** (§11).
- **Il ne fusionne pas `ProductionRun` et `AIJob`.**
- **Il ne réécrit pas le journal de production**, et n'élargit pas sa portée v1 aux travaux hors
  lot.
- **Il n'atteint aucune surface Massimo.**

---

## Le signal qui dirait qu'on s'est trompé

- **Papa apprend qu'un travail a échoué en ouvrant une page, pas par la barre.** Alors le §8 aura
  échoué là où il compte, et c'est la persistance de l'échec qu'il faut reprendre — pas le libellé.
- **Le compteur « +N en attente » monte et ne redescend pas.** La priorité du §5 n'aura pas suffi,
  ou la concurrence 1 est devenue le vrai plafond — et c'est le nombre de moteurs qu'il faut
  rouvrir, pas l'ordre de la file.
- **Un clic de Papa se retrouve régulièrement derrière un lot automatique.** La dérivation du §5
  aura été contournée quelque part : vérifier d'abord que `trigger` est bien posé à l'enfilement.
- **Quelqu'un rajoute une constante de durée dans un composant.** Le §9 aura été désarmé ; c'est le
  test-verrou qu'il faut réparer, pas la constante qu'il faut aligner.
- **La barre affiche « en cours » sur un travail mort.** Le §10.3 ne tourne pas — vérifier le
  balayage avant de toucher à l'affichage.
- **Une barre apparaît chez Massimo.** Le §12 aura été perdu de vue, et avec lui l'`adr-0026` §4.

---

## Suivi

### Trois slices, dans cet ordre

**Slice A — le socle et la preuve.** `AIJob` promu (§3), les deux files (§5), `/activity` (§2,
§13), `JobOut` avec son motif d'erreur, `run_out()` qui applique `run_status()` (§1). **Un seul
producteur migré** : `equip_notion` — celui par lequel le chantier est arrivé, et le seul dont la
barre existe déjà en double. Et la barre du header, branchée dessus.
Commit : `feat(production): every producer becomes a queued, visible job`

**Slice B — la durabilité.** Les trois trous (§10) et l'échec persistant jusqu'à acquittement (§8).
Commit : `feat(production): nothing enqueued is lost, and no failure disappears`

**Slice C — la migration du reste.** Les cinq générateurs, `curriculum_*`, capsules, diagnostic
(§4). Les 23 constantes meurent, avec leur test-verrou (§9).
Commit : `refactor(papa): one source of truth for every progress bar`

Motif de l'ordre : la Slice A est **verticale** — elle traverse le backend, la file et l'écran sur
un seul producteur, donc elle est **visible et vérifiable en vrai** avant qu'on généralise. La
Slice B vient avant la migration de masse parce qu'une barre qui ment sur un producteur ment sur
vingt.

### Documents

- ligne dans `DECISIONS.md` ;
- **création** de `docs/frontend-papa/barre-de-production.md` — la spec d'écran ;
- **création** de `docs/frontend-papa/mockup/maquette-papa-barre-production.html` ;
- `API_SPEC.md` : `/activity`, l'acquittement, `JobOut` enrichi ;
- `DATA_MODEL.md` : les deux colonnes, les trois index, les deux natures d'absence de `trigger` ;
- `GLOSSARY.md` : entrées **« Travail »** (unitaire, `AIJob`) et **« Lot »** (`ProductionRun`) — le
  chantier crée deux mots voisins, et un ADR qui les distingue sans les nommer les laisse fusionner ;
- `TROUBLESHOOTING.md` : « la barre dit *arrêté* » → le worker n'écoute pas la file ;
- `CHANGELOG.md`.

### Prompts Claude Code

`prompts/claude-code/prompts-claude-code-adr-0041.md` — **les trois sessions dans un seul fichier**,
convention du chantier précédent. Documents commités d'abord ; les prompts référencent l'ADR et la
spec par leur chemin et n'en recopient pas le contenu.
Read-before-code obligatoire sur : `db/models/ai.py`, `core/queue.py`, `modules/production/`
(`runs.py`, `runner.py`, `jobs.py`, `triggers.py`), `modules/ai/router.py`, `reports/router.py`,
`tests/conftest.py` (le fixture `autouse`), `layouts/PapaLayout.tsx`, `hooks/useRunProgress.ts`,
`hooks/useActiveProductionRun.ts`, `components/ActiveProductionModal.tsx`,
`packages/ui/src/components/generation-progress.tsx`.

### 🔴 Vérification humaine — non négociable sur ce chantier

`EQUIP_MS` existe depuis des semaines et **la barre qu'elle pilote n'a jamais été vue tourner une
seule fois**. Cinq chantiers d'affilée ont été mergés sans qu'un humain regarde (#79, #89, #91,
#92, #93). Le §15 dit pourquoi aucun test ne comblera ce trou ici.

Avant toute PR :

1. un **équipement réel** depuis Progression, dans le vrai navigateur, sur une notion sans kit —
   la barre observée **sur toute sa durée**, pas seulement à son apparition
   (⚠️ coût assumé : `equip_notion` génère **et auto-valide** un kit entier en base de dev) ;
2. le **même travail depuis le Conseil de classe** — les deux surfaces doivent dire la même chose
   au même moment ; c'est le motif d'origine du chantier ;
3. un travail lancé, puis **changement de route** : la barre survit et ne repart pas de zéro ;
4. un travail **mis en file derrière un lot** : « +N en attente », et l'ordre du §5 respecté ;
5. un **échec provoqué** (worker arrêté) : « arrêté », jamais « 0 % », et il reste ;
6. **responsive** — le header fait 112 px / 144 px ≥ `sm` et porte déjà deux pilules. Aucun contrôle
   responsive n'a été fait sur les trois derniers chantiers.

---

## Addendum — le Journal de production accueille les travaux unitaires (2026-08-06)

**Statut : Accepté.** Décidé après la vérification à l'écran des slices B et C, sur une question du
commanditaire : *« pourquoi cela n'apparaît-il pas dans le Journal de production ? »*

### Le constat

Le Journal (ADR-0034) est bâti **entièrement** sur `ProductionRun` + `ProductionEvent` :
`journal.py` et `journal_router.py` ne référencent `AIJob` nulle part. Le §2 de cet ADR avait
conservé deux modèles et unifié la lecture **uniquement dans `/activity`**, qui alimente la barre.

Ce n'était pas une régression — avant la migration, ces quinze producteurs étaient synchrones et
n'apparaissaient nulle part non plus. Mais c'est devenu une **incohérence visible** : un chantier
qui s'appelle *tout ce qui produit se voit* ne peut pas laisser le registre historique ignorer les
trois quarts de ce qui produit.

### §16 — Le Journal lit les deux modèles, dans UN flux chronologique

Un travail unitaire y entre comme une ligne à part entière, à sa date, mêlée aux lots.

🔴 **La fusion se fait en SQL, jamais en Python.** Le Journal filtre, trie et pagine côté serveur —
`WHERE` puis `ORDER BY` puis `LIMIT`, dans cet ordre, et l'addendum « tri et filtre » §2 dit
pourquoi : *filtrer les lots déjà chargés répondrait « rien en maths » alors que les lots de maths
sont page 4 — un défaut qui ne ressemble pas à un défaut.* Fusionner deux pages déjà chargées
rouvrirait exactement ce défaut, en pire : la page 1 mélangerait les vingt lots les plus récents
avec les vingt travaux les plus récents, et perdrait tout ce qui tombe entre les deux.

La forme retenue est donc une **union légère pour l'ordre et la pagination** — `(kind, id, date)`
sur les deux tables — suivie du chargement des seules lignes de la page. `total` et `has_more`
portent sur l'union filtrée.

### §17 — Ce qu'un travail unitaire porte au Journal, et ce qu'il NE PORTE PAS

C'est le cœur de la décision, et elle applique la doctrine de l'ADR-0011 §F et de l'ADR-0040 :
**ne jamais affirmer ce que l'évidence ne porte pas.**

| | Un LOT | Un TRAVAIL unitaire |
|---|---|---|
| date, issue, durée | ✅ | ✅ |
| ce qu'il fabriquait (libellé, notion) | ✅ | ✅ |
| motif d'échec | via son journal | ✅ `error_message` |
| **régime d'autonomie** (`zetis_mode`) | ✅ gravé au démarrage | ❌ **`null`** |
| **provenance des pièces** (`validated_by`) | ✅ | ❌ |
| **veto** (retirer ce qui a été produit) | ✅ | ❌ **impossible** |
| **journal ligne à ligne** (`ProductionEvent`) | ✅ | ❌ |

⚠️ **Le veto est le point dur, et il n'est pas négociable en l'état.** `DELETE /journal/pieces/…`
s'appuie sur le tamponnage `production_run_id` posé sur chaque pièce produite. Un `AIJob` ne
tamponne rien : on ne saurait pas quoi retirer. Une ligne de travail unitaire **n'offre donc aucun
bouton de retrait** — et l'écran doit dire pourquoi plutôt que d'afficher un bouton inerte.

⚠️ **`zetis_mode` reste `null`, jamais « manuel ».** Un travail hors lot est manuel *par
construction* (§3.2), et il serait tentant de l'écrire. Ce serait confondre **l'origine** (qui a
demandé) avec **le régime** (sous quelles règles ZETIS avait le droit de servir sans relecture) —
deux choses que l'ADR-0034 a séparées exprès. L'origine, elle, s'affiche : elle est dérivée.

### §18 — Les filtres que les travaux ne portent pas les ÉCARTENT, et l'écran le dit

`piece`, `mode`, et le filtre par chapitre n'ont aucun sens sur un travail unitaire. Plutôt que de
leur inventer une valeur, un filtre actif sur l'une de ces dimensions **ne rend que des lots**.

⚠️ **Et la page l'annonce**, sinon Papa lirait une absence comme un vide : « ce filtre ne porte que
sur les lots ». Une exclusion muette est la même faute qu'une troncature muette (§7).

Le filtre par **matière** fait exception : il s'applique aux deux, via la notion du travail
(`input_json.skill_id`). Un travail sans notion identifiable est écarté quand ce filtre est actif —
même règle, même raison.

### Ce que cet addendum ne fait pas

Il **ne tamponne pas** les pièces produites hors lot, donc il n'ouvre pas le veto sur elles. C'est
la seule voie vers un Journal réellement unifié — pièces comprises — et elle mérite son propre
cadrage : elle touche le modèle de données, pas seulement une lecture.

---

## Addendum 2 — la barre devient une bande, et la production se compte en pièces (2026-08-06)

**Statut : Accepté.** Décidé sur la maquette
`docs/frontend-papa/mockup/maquette-papa-header-production.html`, produite par le commanditaire
après la livraison des trois slices.

### Le constat

La barre livrée par cet ADR est correcte et **n'a toujours pas été vue tourner**. Le §
« Vérification humaine » n'a été honoré qu'en partie, et le message du commit de livraison le dit
lui-même : *« le critère d'écran de la Slice C n'est pas tenu (un seul producteur lancé, sans
empilement), les scénarios de la Slice B n'ont pas été rejoués »*.

La maquette ne corrige pas un défaut d'affichage : elle attaque la cause. Une pilule qui passe de
`0/31` à `1/31` toutes les 69 secondes **ne bouge pas à l'œil**. Rien n'y indique qu'un travail est
en cours autrement qu'un point qui clignote — et un point qui clignote ne dit pas *que ZETIS
fabrique*, il dit *que l'interface est vivante*.

> **Ce n'est pas une barre, c'est un tapis.** Les rouages fabriquent à gauche, la pièce traverse, la
> boîte l'avale à droite. La texture en biais dit le sens de marche : sans elle, une barre qui se
> remplit ne dit pas *d'où vers où*.

### Le point dur qui commande cet addendum

**Le grain de la mesure décide si le mouvement existe.** Un lot de chapitre de 31 notions dure
~36 minutes et n'a que 31 paliers : un pas toutes les 69 secondes, c'est-à-dire, à l'œil, une
barre immobile.

🔴 **Corrigé au read-before-code, et c'est la correction la plus importante de cet addendum.** La
première version disait : *« le même lot a 155 pièces, donc un dénominateur 5× plus fin, donc la
barre bouge cinq fois plus souvent. »* **C'est faux**, et le code le dit :

```python
for skill_id in eligible:
    result = equip_notion(...)          # ~69 s — les 5 pièces sont fabriquées
    run.done_notions += 1
    _record_notion(db, run_id, result)  # les 5 lignes de journal sont ajoutées ICI
    db.commit()                         # et commitées d'un seul coup
```

Les cinq `ProductionEvent` d'une notion naissent **dans le même commit que l'avancement** — et ce
n'est pas un hasard, c'est une décision : *« un lot tué entre les deux laisserait un journal qui
ment sur ce qu'il a fait »* (`runner.py:439`). Donc :

| | pas | fréquence |
|---|---|---|
| notions | `1/31` = 3,23 % | ~69 s |
| pièces, comptées sur le journal | `5/155` = 3,23 % | **~69 s** |

**Identique.** Compter des pièces au lieu de notions ne fait bouger la barre ni plus souvent, ni
d'un pas différent. Un renommage.

**Ce qui débloque réellement le mouvement** est ailleurs : `equip_notion` ne commite jamais
lui-même, mais **les cinq générateurs de pièces commitent chacun en interne**. Il passe donc déjà
un commit toutes les ~14 secondes — il suffit de lui faire porter **la pièce en cours**. D'où le
§20 bis, sans lequel le §20 ne serait qu'un changement de vocabulaire.

C'est aussi ce qui rend le tapis honnête : une pièce qui voyage et tombe dans la boîte est
l'image exacte de ce qui se passe en base, pas une métaphore décorative.

### §19 — La bande remplace la pilule, et le §7 est révoqué EN PARTIE

La pilule (`ProductionBar`) et son liseré (`ProductionEdge`) disparaissent. Une **bande de
production** de 46 px prend leur place, **sous le bandeau de marque, dans le même `<header>`**.

🔴 **Le §7 est révoqué sur un point et un seul** : « quand rien ne tourne, la barre n'existe pas ».
Au repos, la bande **se replie** au lieu de disparaître.

L'argument d'origine reste vrai et n'est pas abandonné : *« un indicateur permanent à l'arrêt est
un bruit permanent »*. Ce qui change est qu'un **liseré immobile n'est pas un indicateur** — il
n'annonce rien, ne compte rien, ne reproche rien. Le §7 visait un compteur qui vous regarde ; il
ne visait pas une couture.

⚠️ **Tout le reste du §7 tient** : la bande montre **le travail courant et lui seul**, jamais un
agrégat. « 3 travaux · 41 % » reculerait quand un travail entre dans la file. *Ce qui attend se
compte, il ne se dessine pas.*

⚠️ **Le §12 tient intégralement.** Aucune bande chez Massimo. `require_parent` de bout en bout.

### §20 — La mesure passe de la notion à la pièce

| | Avant (§6) | Après |
|---|---|---|
| dénominateur | `total_notions` | `PIECES_PAR_NOTION × total_notions` |
| numérateur | `done_notions` | `COUNT(production_events)` résolus |
| ce qu'on lit | `7 / 31 · 23 %` | `37 %` · `7 / 19 pièces` |

`equip_notion` produit **exactement 5 pièces par notion éligible** — cours, fiche, srs, quiz,
mindmap — sans exception, y compris le repli « cours indisponible » qui pousse les quatre dérivés
en `skipped`. La constante `PIECES_PAR_NOTION` vit **avec le vocabulaire `PIECES`** et nulle part
ailleurs, et un test verrouille que `equip_notion` émet bien ces cinq natures : une constante qui
dérive du code qu'elle décrit est une constante fausse le jour où quelqu'un ajoute une sixième
pièce.

Trois nombres, pas un :

- **`pieces_done`** = les pièces **résolues** (`generated` ∪ `skipped` ∪ `error`). C'est lui qui
  fait avancer le tapis : il ne recule jamais et atteint 100 %.
- **`pieces_produced`** = les seules `generated`. C'est lui qui allume la boîte. Une pièce
  `skipped` était **déjà** dedans — la faire tomber une seconde fois serait un mensonge sur le
  stock.
⚠️ **Il n'y a PAS de troisième liste `pieces_recent`.** Le cadrage en prévoyait une — les natures
des dernières pièces produites, pour nommer les jetons du tapis — et elle était à la fois inutile
et fausse : le journal atterrit **après coup**, donc les jetons seraient partis tous les cinq d'un
coup, en retard. C'est `current_piece` (§20 bis) qui les lance : **son changement de valeur dit
qu'une pièce vient d'être finie**, à l'instant, avec son nom. Une requête de moins, et le bon
moment.

⚠️ **Filtrer `piece IS NOT NULL`.** Les lignes `blocked` portent sur la **notion**, pas sur une
pièce (`production.py:256`). Les compter gonflerait le numérateur d'un travail que personne n'a
fait.

🔴 **Les quatre champs de mesure passent sous une seule condition.** `runner.execute` commite
`status = "running"` **avant** de poser `total_notions` : il existe une fenêtre réelle où un lot
est `running` avec ses compteurs à `NULL`. Quatre champs sous un invariant, c'est un invariant à
tenir ; quatre conditions séparées, c'est quatre occasions de servir `null / null · 37 %`.

⚠️ **Un lot-pièce reste non mesuré.** Une pièce sur une pièce n'est pas une progression. *Sur un
lot-pièce, le remplissage disparaît, un liseré balaie, et la case du % **n'existe pas** : un « — »
à cet endroit se lirait encore comme une valeur.* C'est le §6 appliqué, pas contredit.

### §20 bis — La pièce en cours, sans laquelle le §20 n'est qu'un renommage

`production_runs` gagne **une colonne, `current_piece`** — la pièce que le lot est en train de
fabriquer, `NULL` entre deux notions et à la fin.

```txt
pieces_done = COUNT(événements de pièces)  +  index(current_piece)
              └─ le RÉCIT, atterrit à       └─ la POSITION dans la notion
                 la fin de chaque notion       en vol, bouge toutes les ~14 s
```

Les deux ne se contredisent jamais : le journal porte les notions **achevées**, `current_piece`
porte la notion **en vol**. La somme est monotone et exacte.

Trois propriétés qui font que ce n'est pas cher payé :

1. 🔴 **Aucun commit n'est ajouté.** Les cinq générateurs commitent déjà en interne (10, 11, 10 et
   8 `db.commit()` dans `fiches`, `mindmaps`, `quizzes`, `memory`). Poser `current_piece` avant
   d'appeler le générateur suffit : c'est son propre commit qui l'emporte.
2. **Le journal n'est pas touché**, donc l'invariant de `runner.py:439` tient intact. La position
   est un état courant, pas une trace ; les confondre reviendrait à écrire l'histoire à l'avance.
3. ⚠️ **`equip_notion` n'apprend rien de `ProductionRun`.** Il reçoit un `on_piece:
   Callable[[str], None] | None = None`, et le runner y branche l'écriture. Ses deux autres
   consommateurs — le Conseil de classe et la composition champion — **ne changent pas d'un
   caractère**, exactement comme pour `authority` (§ docstring d'`equip_notion`). Un service qui
   irait chercher le lot lui-même deviendrait inappelable par eux.

⚠️ **L'index vient de l'ordre de `PIECES`**, qui documente déjà être « l'ordre dans lequel
`equip_notion` les produit ». Deux ordres divergeraient en silence ; il n'y en a qu'un, et le test
qui verrouille les cinq natures verrouille aussi leur ordre.

⚠️ **Le pas n'est pas régulier, et c'est correct.** Une pièce déjà produite passe en `skipped` en
quelques microsecondes ; une fiche prend 32 s. La position avance donc par bonds inégaux. Une
progression régulière sur un travail irrégulier serait une animation, pas une mesure.

### §21 — Un régulateur qui refuse laisse une trace

Les cinq régulateurs lèvent un `HTTPException(409)` et **rien n'est écrit**. Un refus survenu à
3 h du matin sur le scan automatique est **définitivement perdu** — ce qui contredit frontalement
le titre de cet ADR.

**Seuls les refus AUTOMATIQUES sont persistés** (`trigger != "manual"`). Un refus manuel est déjà
dit à Papa, synchroniquement, au clic, dans le `detail` du 409 ; le persister en ferait une
notification en double d'un événement qu'il vient de lire.

Table `production_refusals` : `trigger`, `regulator` (vocabulaire fermé — `duplicate` ·
`already_produced` · `pending_backlog` · `request_volume` · `auto_volume`), `detail`,
`chapter_id` / `skill_id` nullables, `created_at`, `acknowledged_at`.

- Le `detail` est rendu **tel quel**, comme un motif d'échec (§8). Une table
  « motif technique → phrase douce » est exactement ce que le §8 a écarté.
- 🔴 **Corrigé au read-before-code : il n'y a rien à écrire « avant le `raise` ».** Le cadrage
  prévoyait d'insérer l'écriture dans `create_run`, en la commitant avant de lever, sous peine de
  la voir emportée par la transaction. C'était résoudre un problème qui n'existe pas :
  `triggers.py` **attrape déjà** le `409` dans un `except` ordinaire, et les cinq régulateurs
  gardent **avant** toute écriture du lot — la session est propre. La trace s'écrit donc chez
  l'appelant, hors de tout chemin exceptionnel.
- ⚠️ **Le tri se fait sur le TYPE, jamais sur la phrase.** `ProductionRefused` est une
  `HTTPException` qui porte en plus un code de régulateur : la route rend toujours son `409` avec
  son `detail`, et pas une ligne de `runs_router` ne change. Sans ce code il faudrait reconnaître
  le motif dans le texte français — et le jour où quelqu'un reformule « contenus attendent déjà
  votre relecture », la classification tomberait **sans qu'aucun test ne rougisse**, puisque le
  message resterait juste.
- ⚠️ **Les `404` du même chemin n'entrent pas.** Chapitre introuvable, profil élève absent : ce
  sont des défauts de donnée, pas des décisions de politique. Sous le mot « refusé », un bug se
  lirait comme un régulateur qui fonctionne — et resterait affiché jusqu'à ce que Papa l'acquitte
  sans avoir rien à réparer.
- ⚠️ **Un refus répété n'est pas dédupliqué**, et c'est voulu. Un scan qui tourne toutes les trois
  heures sur une limite non levée empile ses refus : c'est exactement ce qu'il faut voir — la
  limite n'a pas bougé, ZETIS n'a rien produit de la journée. Masquer les répétitions ferait lire
  un incident isolé là où il y a un blocage installé.
- **Un refus n'est pas une panne.** Il ne prend pas le ton d'un échec : rouages estompés, motif
  affiché, et le popover dit **ce qui le rouvrira**. Un refus invisible se lit comme une perte.
  Deux listes distinctes dans `/activity`, jamais une : confondues, elles apprendraient à Papa à
  ignorer les deux.

### §22 — Les couloirs deviennent visibles, et `worker_alive` cesse d'ignorer le média

Trois défauts réels, tous visibles dès qu'une capsule tourne :

1. **`queued_count` mélange les deux couloirs.** Un rendu vidéo fait afficher « 1 en attente » sur
   le couloir LLM alors qu'il ne le bloque en rien — le média a son propre worker et sa propre
   file. `queued_count` devient **le couloir LLM seul** ; les travaux média portent leur `lane` et
   n'apparaissent que dans le popover.
   *Deux tapis côte à côte diraient qu'il y a deux productions, alors qu'il y a deux ressources.*
2. **`worker_alive` n'interroge que les files de production.** Le worker média peut être mort avec
   `worker_alive: true`. Ajout de **`media_alive`**, champ **additif** : `worker_alive` garde sa
   forme, donc rien de ce qui le lit ne casse. La règle `=== false` — jamais la fausseté — vaut
   pour les deux.
3. 🔴 **`worker_media` écrit `job_type="capsule_render"` quand la table des libellés et les
   estimations attendent `"capsule_render_v2"`.** Papa lit donc « capsule_render » en toutes
   lettres, et l'estimation retombe au défaut. C'est le défaut que le §9 disait avoir supprimé,
   survivant sur le seul producteur qui vit dans un autre dépôt d'application.
   Et **aucun `AIJob` n'est créé à l'enfilement** : un rendu qui attend est invisible — le défaut
   exact que la Slice A a corrigé pour tous les autres.

### §23 — Le popover remplace la modale

`ActiveProductionModal` devient `ProductionPopover` : 340 px, ancré sous la bande, fermé au clic
extérieur **et à `Escape`** (la modale n'avait ni l'un ni l'autre).

**Les sept invariants de la modale sont portés, pas supprimés** : l'ordre de la file tel qu'il sera
servi, l'origine toujours dite, aucun pourcentage sur ce qui attend, l'échec avec son motif et son
acquittement, la troncature déclarée, le résumé qui compte les **statuts** et non la présence d'un
objet, l'état vide.

Le pied gagne **« Voir au Journal → »** vers `/journal?statut=queued&statut=running`.
⚠️ La syntaxe est la **répétition** du paramètre : `?statut=queued,running` serait silencieusement
ignoré.

### §24 — Le contrat réseau, étendu

```txt
Activity += {
    lane:            "llm" | "media",   # §22 — dérivé du job_type, jamais stocké
    pieces_done:     int | null,        # §20 — résolues ; null AVEC pct, jamais séparément
    pieces_total:    int | null,
    pieces_produced: int,               # ce qui tombe VRAIMENT dans la boîte ; toujours servi
    current_piece:   str | null,        # §20 bis — la position, et le lanceur de jetons
  }

ProductionActivity += {
    refused:     Refusal[],             # §21 — non acquittés
    media_alive: bool | null,           # §22 — additif, worker_alive inchangé
  }

Refusal = { id, regulator, detail, trigger, created_at }
```

⚠️ `GET /api/production/activity` **n'a pas de `response_model`** — elle est typée `-> dict`.
**Les tests SONT le contrat.** Toute forme ajoutée ici sans test correspondant n'est garantie par
rien.

### §25 — Les deux contradictions de la maquette, tranchées

La maquette se contredit elle-même sur deux points. Les trancher ici plutôt qu'au clavier :

1. 🔴 **Elle dit que se replier « garde la boîte atteignable d'un clic », et son propre CSS la fait
   disparaître** (`.strip[data-state="repos"] > * { opacity: 0 }`). C'est le repli qui est retenu,
   donc c'est la hauteur qui doit céder : **au repos, la bande garde la boîte et rien d'autre**.
   Seize pixels ne suffisent pas à la loger ; la hauteur de repos se règle **à l'écran**, pas dans
   ce document. Ce qui est décidé, c'est que le repos porte **un seul objet cliquable**, et que cet
   objet est la boîte.
2. **Elle n'a aucun état pour « un lot attend, rien ne tourne encore »** — son état `file` a
   toujours quelque chose en cours. Cet état existe pourtant, et le code sait déjà le dire : il est
   **conservé** comme huitième état, avec ses mots actuels (« ZETIS va produire · en file
   d'attente »), verrouillés depuis le 2026-08-05.

⚠️ **La maquette conserve le verbe** (« ZETIS produit — », « ZETIS **ne produit pas** »). Les deux
verrous de `PapaLayout.test.tsx` restent donc valides sur le fond ; seul leur crochet d'animation
change (voir ci-dessous).

⚠️ **Le hook d'animation devient un attribut, jamais une classe.** Les assertions qui vérifient que
« rien ne bat quand rien ne bouge » s'accrochent aujourd'hui à `.animate-pulse`. Un `className` est
précisément ce qu'un refactor renomme sans que rien ne rougisse. L'attribut `data-tourne` **porte**
l'animation dans le CSS : l'observer, c'est observer le mouvement lui-même.

⚠️ **`prefers-reduced-motion` fige sans rien retirer.** Rouages arrêtés, tapis sans texture animée,
liseré immobile — remplissage, chiffres, couleurs et boîte restent. Couper l'animation effacerait
le signal ; on l'immobilise.

🔴 **Or `#ffcf47` interdit.** Il reste réservé à ZETIS quand il parle à Massimo. L'attente et
l'arrêt sont en ambre `#f0a02a`, **jamais du rouge pour une file** : le rouge est l'échec seul.

### Ce que cet addendum ne fait pas

Il ne touche pas au bandeau de marque (hauteur, image, fondu, les deux pilules) · il n'augmente pas
la concurrence du worker · il n'interrompt aucun travail en cours · il ne crée aucun ordonnanceur ·
il ne migre pas les compositions pur-DB · il n'ajoute **aucun compte de pièces à `CoverageOut`**
(le brut y est calculé puis jeté — c'est une dette nommée, pas un oubli) · il ne tamponne pas les
pièces hors lot, donc n'ouvre toujours pas le veto sur elles · il n'atteint aucune surface Massimo.

### Le signal qui dirait qu'on s'est trompé

1. **La bande au repos finit par porter un deuxième objet** — un compteur, un badge, un lien. Le
   §7 aura été perdu de vue : ce qu'il interdisait n'était pas la continuité visuelle, c'était
   l'affordance permanente.
2. **Papa regarde les rouages plutôt que le tapis.** Le mouvement le plus visible doit être celui
   qui porte l'information ; si le décor gagne, c'est le décor qu'il faut réduire.
3. **Le tapis recule.** Alors le numérateur aura cessé d'être un compte de faits résolus.
4. **Quelqu'un traduit un motif de refus en phrase douce.** C'est la table écartée par le §8 qui
   revient par la porte du refus.

### Vérification humaine — la même, et elle n'a toujours pas été faite

Les six contrôles du § « Vérification humaine » restent dus **en entier**, et quatre s'y ajoutent :
un refus provoqué (abaisser `PRODUCTION_MAX_PENDING`), une capsule en rendu (couloir média
distinct et libellé lisible), la bande au repos, et `prefers-reduced-motion` activé.

> `EQUIP_MS` a été supprimée, mais **la barre qu'elle pilotait n'a toujours jamais été vue
> tourner**. Cet addendum ne sera pas fini quand son code sera vert.

---

## Amendement 1 — ADR-0041 addendum — Un travail dit ce qu'il a produit — 2026-08-09

> Fusionné depuis **Amendement 1** le 2026-08-16. Statut d'origine : **Accepté**.

### Statut

**Accepté — 2026-08-09.** Six décisions gelées. Aucune migration, aucun endpoint neuf, aucune
requête réseau supplémentaire.

⚠️ **Deux corrections le jour même, toutes deux nées de la relecture visuelle** — elles sont en fin
de document et il faut les lire avec les décisions : (1) `curriculum_lessons` disait « N leçons
créées » là où le job en avait créé cinq sur sept ; (2) **la Décision 4 est AMENDÉE** — le
diagnostic mène à sa matière au lieu de n'avoir aucun lien.

✅ **LIVRÉ ET MERGÉ — 2026-08-09.** PR
[#107](https://github.com/NeuronXcore/zetis-school/pull/107), **squash `a8123ee`**, parent `e1d350b`
(vérifié : `a8123ee^` est bien le commit de cet ADR). Une seule session, **aucune migration**, aucun
endpoint neuf. Branche `feat/travail-dit-ce-qu-il-a-produit` **CONSERVÉE**. Suites : backend 1141,
Papa 758, `tsc -b` propre sur les deux fronts.

> ✅ **La relecture visuelle humaine a EU LIEU**, et elle a rapporté **deux défauts** dont un
> mensonge (« 7 leçons créées » pour cinq créées), alors que les trois suites étaient vertes **et
> que les deux test-verrous avaient été sabotés et rougis**. Deuxième chiffrage du dépôt sur ce que
> cette relecture achète — et il confirme celui de l'`adr-0048`, la veille au même endroit.

> Cadré le 2026-08-09 selon le rituel `mockup → spec → ADR → prompt`, sur `main`, à partir d'une
> observation du commanditaire à l'écran : *« on n'arrive pas à savoir si les data ont été créées
> ou pas »*. Le read-before-code a été rendu **avant** toute décision, et il a **démenti quatre
> points** du cadrage annoncé — ils sont consignés ci-dessous et deux d'entre eux changent la
> conception.

### Contexte

L'ADR-0041 s'appelle « tout ce qui produit se voit ». Sa doctrine a été appliquée aux **lots**
(`ProductionRun`) : l'en-tête raconte le lot, le pli montre chaque pièce avec son issue
(`generated` / `skipped` / `blocked` / `error`) et un lien vers la pièce produite.

Elle n'a **jamais été appliquée aux travaux unitaires** (`AIJob`, « hors lot »). `_travail_out`
(`production/journal.py`, **ligne 538 AVANT ce chantier — 761 après**, les numéros de ce document
décrivent l'état trouvé) lit `job.input_json` et **jamais** `job.output_json`. La ligne rend
donc son libellé, son statut, sa durée, sa date et son origine — et rien d'autre.

Conséquence, observée à l'écran le 2026-08-09 sur sept lignes consécutives : **trois issues
radicalement différentes rendent trois lignes identiques.**

| Ligne à l'écran | Ce qui s'est réellement passé |
|---|---|
| `Équipement · Quotient de relatifs — fait · 0 s` | 🔴 **rien produit** — `generated: []`, cinq pièces `skipped` |
| `Cartes de révision · Magma — fait · 6 s` | 3 cartes créées |
| `Diagnostic — fait · 113 s` | un quiz de 40 questions |

« Fait » veut dire *« le programme est allé au bout »*. Papa lit *« la donnée existe »*. Les deux
divergent, et la ligne du haut est la preuve que la divergence est réelle, pas théorique.

🔴 **C'est le motif de l'ADR-0037 pris à l'envers.** Là-bas, du contenu produit était invisible ;
ici, l'écran laisse croire à une production qui n'a pas eu lieu. Même famille : l'écran et la base
ne disent pas la même chose, et rien ne rougit.

### Constat read-before-code — quatre points démentis

**1. 🔴 « Il suffit de lire `output_json` » est vrai, mais pas celui qu'on croit.** Le Journal
n'affiche que les lignes `created_by == 'file'` — les traces d'appel LLM (`created_by == 'parent'`)
sont volontairement exclues (`journal_filters.selectionner_travaux`, *« 143 traces pour une poignée
de gestes »*). Or les deux lignes d'un même travail ne portent pas la même chose :

| `job_type` | ligne VISIBLE (`file`) | trace exclue (`parent`) |
|---|---|---|
| `lesson_content` | `{"lesson_id": 114}` | `{"content_chars": 4942, "model": …}` |
| `curriculum_lessons` | `{"chapter_id": 44, "lesson_ids": [114, 115, 153, 154, 155, 156, 157]}` | `{"lessons_count": 5, "skills_created": 7, …}` |
| `srs_cards_generate` | `{"skill_id": 149, "created": 3, "updated": 0, …}` | `{"cards": [ … ]}` |
| `diagnostic_generate` | `{"quiz_id": 57, "subject": "Histoire-Géo", "questions_count": 40}` | — |
| `equip_notion` | `{"skill_id": 64, "generated": [], "skipped": [ … ], "errors": [], "reason": null}` | — |

**La longueur du cours n'est donc PAS disponible** sur la ligne visible. Le résumé dira « cours
rédigé », pas « 4 942 caractères » — aller la chercher demanderait de lire une seconde ligne, et
c'est un couplage qu'on refuse pour un ornement.

**2. 🔴 La forme de lien existante ne convient pas.** `BlockedTargetOut` exige `lesson_id` **et**
`chapter_id`, tous deux non-nuls. Or un diagnostic n'a **aucune leçon** (il est notion-centré),
`curriculum_lessons` a un chapitre mais **sept** leçons, et `srs_cards_generate` n'a qu'un
`skill_id`. La réutiliser obligerait à **fabriquer des valeurs** pour satisfaire un type — soit
exactement ce que `journalLink` et `reviewLink` ont déjà refusé de faire deux fois, chacun avec sa
branche explicite plutôt qu'« une cinquième entrée forcée dans un type qui ne la veut pas ».

**3. 🔴 Un diagnostic n'est toujours pas ouvrable par URL.** `reviewLink:91` porte un `null` assumé
et daté : *« la page `/diagnostics` ne sait pas encore ouvrir un diagnostic précis : sa refonte est
la session C de l'adr-0043 »*. Cette session **a été livrée** (PR #99) — le commentaire pourrait
donc être périmé. Vérifié : il ne l'est pas. `DiagnosticsPapaPage` tient son focus en `useState`,
sans `useSearchParams`. Un lien y déposerait Papa au hasard.

**4. ⚠️ `equip_notion` est le seul type déjà complet** : `generated`, `skipped`, `errors` et
`reason` sont tous écrits. C'est aussi le seul dont l'issue « rien produit » soit nommable
précisément — et c'est le cas qui a déclenché ce chantier.

### Décisions

**Décision 1 — le résumé est calculé SERVEUR, en un seul endroit.** Une fonction
`resume_de_production(job, …)` dans `production/journal.py`, une règle par `job_type`. Motif
ADR-0037 : « qu'a produit ce travail » doit avoir **une** réponse dans le dépôt. Un `switch` en
TypeScript serait une seconde définition, qui divergerait au premier `job_type` ajouté.

**Décision 2 — le champ ajouté est `production`, et il porte une ROUTE, pas une cible
leçon-centrée.**

```
production: { texte: str, ton: "succes"|"neutre"|"avertissement", route: str | None } | None
```

`route` est une route Papa toute faite (`/programme?subject=1&chapter=44&lesson=114`). C'est la
conséquence directe du constat 2 : trois des cinq types n'ont pas de leçon, et forcer
`BlockedTargetOut` fabriquerait des valeurs. ⚠️ **La composition des routes reste celle de
`pilotageLinks`** — le serveur produit les mêmes URL, il n'invente pas une seconde convention.

**Décision 3 — `route = None` dès que rien n'a été produit, et c'est un test-verrou.** Reprise
mot pour mot de la doctrine déjà écrite dans `journal.py:382` pour les pièces `skipped` : *« la
pièce existe, mais elle appartient à un autre moment ; la rattacher ici ferait croire que ce lot-là
l'a faite »*. Un travail qui n'a rien produit ne doit **jamais** rendre un lien.

**Décision 4 — le diagnostic n'a pas de route, et l'écran ne prétend pas le contraire.** `texte`
dit « 40 questions », `route` est `None`. **Dette nommée**, pas contournée : elle se lèvera quand
`/diagnostics` lira un paramètre d'URL, et le `null` de `reviewLink:91` tombera dans le même geste.

> 🔴 **AMENDÉE le même jour — ne pas s'arrêter ici.** Cette version laissait un doute à l'écran :
> ni lien, ni indication d'où aller. Voir **§ Décision 4 AMENDÉE** en fin de document — le
> diagnostic mène désormais à sa **matière**, et le libellé annonce ce grain. Le texte ci-dessus
> est conservé parce qu'il dit ce qui a été décidé d'abord, et pourquoi.

**Décision 5 — aucune migration, aucun appel réseau, une seule requête en lot.** Tout se lit dans
`output_json`, déjà chargé. Seule exception : `lesson_content` ne porte qu'un `lesson_id` et la
route Programme demande `chapter` et `subject` — d'où **une** requête en lot sur les leçons de la
page, exactement le patron que `_travail_out` utilise déjà pour les noms de notions (`names`).
🔴 **Jamais une requête par ligne.**

**Décision 6 — trois tons, et le troisième est le sujet de cet addendum.**

| Ton | Quand | Exemple |
|---|---|---|
| `succes` | quelque chose a été créé, **et la sortie le prouve** | « 3 cartes créées », « cours rédigé », « 40 questions » |
| `avertissement` | le travail a réussi et **n'a rien produit** | « rien produit — les 5 pièces existaient déjà » |
| `neutre` | issue sans production prouvable, ou type sans règle | « 7 leçons au chapitre », « terminé » |

⚠️ **« et la sortie le prouve » n'est pas une nuance de style** — voir la correction à l'exécution en
fin d'ADR : `curriculum_lessons` a d'abord porté `succes` et « N leçons créées », ce qui était faux.

⚠️ **`avertissement` n'est pas une erreur** et son ton ne doit pas être rouge : ne rien produire
parce que tout existait déjà est un **résultat correct**. Il est signalé parce qu'il est
*surprenant*, pas parce qu'il est *mauvais* — même distinction que l'ambre du rail de fiabilité de
l'ADR-0048, « ambre jamais rouge ».

### Périmètre

**Dedans** : `resume_de_production` et ses règles, le champ `production` sur `JournalTravailOut`,
le rendu de la ligne `TravailSection` dans `JournalPage.tsx`, les types partagés, et leurs tests.

**Dehors, explicitement** :

- **les lignes de LOT** — elles ont déjà leur pli, leurs pièces et leurs liens ; y toucher serait
  la dérive ;
- **l'ouverture d'un diagnostic par URL** (décision 4) — c'est son propre chantier ;
- **la file de relecture** et le `null` de `reviewLink:91`, qui tombera avec elle ;
- **le veto** : un `AIJob` ne tamponne aucune pièce, il n'y a rien à retirer (§17 inchangé) ;
- **les traces `parent`**, qui restent hors du Journal ;
- **la longueur du cours** et toute donnée qui ne vit que sur une trace (constat 1).

### Conséquences

#### Positives

- La question « est-ce que ça a créé quelque chose ? » se répond **sur la ligne**, sans ouvrir la
  base ni une autre page.
- Le cas « rien produit » devient **nommé** au lieu d'être indistinguable d'une production réussie.
- La doctrine de l'ADR-0041 cesse d'être vraie pour les seuls lots.

#### Coûts assumés

- **Une règle par `job_type`** : dix-neuf entrées à `LIBELLE_JOB`, cinq règles écrites, le reste
  retombe sur `neutre`/« terminé ». ⚠️ Un `job_type` neuf sans règle **n'est pas un bug** — il
  dégrade proprement, et son absence de résumé se voit.
- **Le diagnostic reste sans lien** (décision 4). C'est le seul type dont on nomme la production
  sans pouvoir l'ouvrir.

### Le signal qui dirait qu'on s'est trompé

- Un travail affiche « rien produit » alors que Papa retrouve l'objet ailleurs → la règle du type
  lit le mauvais champ, **et le test-verrou ne l'a pas vu** ;
- une ligne mène à une page qui ne montre pas l'objet → la route est composée à côté de
  `pilotageLinks`, ce que la décision 2 interdit ;
- Papa cesse de lire le résumé parce qu'il dit « terminé » partout → trop de types sans règle, il
  faut en écrire, jamais retirer le repli.

### ⚠️ Correction à l'exécution — décisions inchangées (2026-08-09)

**La relecture visuelle a trouvé un défaut, et c'était celui-ci même, à l'envers.**

La première écriture de la règle `curriculum_lessons` rendait **« 7 leçons créées »** sur le
chapitre 44. Vérifié en base pendant la relecture : le job du 09/08 00:24 en avait fabriqué
**cinq** (153 à 157) — les leçons **114 et 115 dataient du 06/08**, trois jours plus tôt.

`lesson_ids` est l'**état résultant** du chapitre, pas la production du travail. Et le compte
réellement créé (`lessons_count`) vit sur la trace `parent`, **exclue du Journal** par le constat 1 :
il ne peut pas être dit, donc il ne se devine pas.

La règle rend désormais un **état au ton `neutre`** — « N leçons au chapitre » — et non une création
au ton `succes`. Un test l'épingle, `assert "créé" not in texte` compris.

🔴 **Ce que cet épisode démontre, et qui vaut au-delà de la règle corrigée** : les trois suites
étaient vertes, le test-verrou avait été sabotté et rougi, et l'écran affirmait quand même une
chose fausse. Aucun test ne pouvait la voir — il aurait fallu connaître la date de création de deux
leçons pour douter du mot « créées ». **C'est la sixième fois que ce dépôt le constate, et la
deuxième fois qu'on le chiffre.**

⚠️ **Dette nommée** : le nombre de leçons **réellement créées** par un
`curriculum_lessons` reste indisponible côté Journal. Le rendre lisible demanderait soit de faire
entrer la trace `parent` (refusé, constat 1), soit que le travail l'écrive dans sa propre sortie —
une modification de `curriculum/service.py`, hors périmètre ici.

### ⚠️ Décision 4 AMENDÉE — le diagnostic mène à sa matière (2026-08-09, même jour)

**Motif : la version livrée laissait un doute à l'écran.** « 40 questions · Histoire-Géo », sans
lien ni indication d'où aller. Le commanditaire l'a dit en une phrase : *« il faut qu'aucun doute ne
soit permis à l'écran en lisant »*. Un texte juste qui n'indique rien reste un cul-de-sac — c'est le
motif de l'`adr-0047`, appliqué à la ligne qu'on venait d'écrire.

**Ce que la recherche d'une destination a établi, et qui vaut d'être écrit** : aucune surface Papa
n'ouvre un diagnostic précis. `/quiz` filtre sur `QUIZ_TYPE_MISSION` dans **sept comparaisons de requête** de
pilotage — un diagnostic n'y apparaît jamais ; `/relecture` rend `null` (`reviewLink:91`) ;
`/diagnostics` montre les **passations**, pas le quiz généré.

**Décision** : la route est de **grain matière** — `/diagnostics?subject=<id>`, l'id lu dans
`input_json` (la sortie ne porte que le *nom* de la matière, et une route ne se compose pas sur un
nom). Aucune requête de plus.

🔴 **Ce qui rend ce lien acceptable là où l'`adr-0047` Décision 8 en a condamné un** : le libellé
**annonce son grain**. La station ② disait « Produire le quiz de cette notion → » et envoyait sur la
matière — elle promettait un grain qu'elle ne livrait pas. Ici on écrit « voir les diagnostics
d'Histoire-Géo → », au pluriel, et c'est exactement ce qu'on sert. **Le défaut n'était pas le grain
matière ; c'était l'écart entre le grain promis et le grain servi.**

**Conséquences de l'amendement** :

- **`route_texte` est ajouté** au contrat, et il devient obligatoire dès qu'il y a une route.
  ⚠️ Un « voir → » nu était d'ailleurs déjà un écart à la maquette, qui disait « voir la leçon → » /
  « voir le chapitre → » / « voir les cartes → » : l'implémentation les avait collapsés. Corrigé,
  et tenu par un test paramétré sur les quatre types à route.
- **`DiagnosticsPapaPage` lit `?subject=`** — sans quoi le lien aurait promis une matière et livré
  la page par défaut. ⚠️ **Amorçage, pas synchronisation** : la pastille reste maîtresse ensuite, et
  le `focus` du bandeau reste strictement local. Trois tests, dont un `?subject=` illisible.
- **L'élision est traitée** (`d'Histoire-Géo`, `d'Anglais`, `d'Espagnol`) : trois matières sur huit
  commencent par une voyelle, un libellé sur cinq se lirait de travers sans elle.

**Ce qui reste dû, et n'a pas bougé** : ouvrir **LE** diagnostic — ses 40 questions — depuis Papa.
C'est un chantier à part, et il fermera aussi le `null` de `reviewLink:91`.
