# ADR-0041 — Tout ce qui produit se voit, attend son tour, et ne se perd pas

## Statut

Proposé — 2026-08-06.

> S'appuie sur : `adr-0031` (production en lot, le journal, « les colonnes disent POURQUOI, jamais
> SUR QUOI »), son addendum `deux-passes-et-gate-cours`, `adr-0036-addendum-file-sans-consommateur`
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
  n'est pas une attente, c'est un arrêt (`adr-0036-addendum-file-sans-consommateur`) ;
- toute estimation est **ancrée sur le `started_at` du serveur**, jamais sur l'âge de l'affichage.

⚠️ **`run_out()` doit appliquer `run_status()`** (point 8 du read-before-code) : un lot zombie doit
apparaître `stale`, pas `running`. C'est une correction, pas une fonctionnalité.

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
2. **La colonne `trigger`**, vocabulaire fermé **partagé** avec `ProductionRun.TRIGGERS`. Motif :
   `adr-0031` §4 — *les colonnes disent POURQUOI*. Et un besoin produit direct : quand la barre
   montre à Papa un travail qu'il n'a pas lancé (une échéance d'agenda partie à 3 h), il doit
   pouvoir savoir **pourquoi il tourne**.
   ⚠️ On ne réutilise **pas** `created_by` : il porte l'acteur (`"child"`, `"worker-media"`), pas
   l'origine. Une colonne à deux sens est l'ambiguïté que ce dépôt rejette depuis `adr-0036` §2.
3. **La file n'est PAS une colonne.** Elle se **dérive** du `trigger` (§5). Une colonne qui duplique
   une dérivation donne deux réponses à une seule question.

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
   greffe sur le réveil **déjà en place** (`production/jobs.py:101-107` se replanifie seul). Aucun
   ordonnanceur nouveau — l'`adr-0023` en a refusé un, et cet ADR ne le rouvre pas.

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
    trigger:         str | null,     # null = travail antérieur à la trace
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
ai_jobs         : + trigger         String(20) nullable  (vocabulaire ProductionRun.TRIGGERS)
                  + acknowledged_at DateTime(tz) nullable
                  + index (status, created_at DESC)   — la lecture d'activité
                  + index (job_type, status)          — les stats de quiz, qui balaient aujourd'hui
                                                        TOUTE la table (aucun index n'existe)
production_runs : + acknowledged_at DateTime(tz) nullable
```

**Aucun backfill.** Les lignes historiques gardent `trigger = NULL` — « antérieur à la trace », même
doctrine que l'`adr-0011` §F : *aucune rétro-attribution, historique `NULL` assumé*.

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
