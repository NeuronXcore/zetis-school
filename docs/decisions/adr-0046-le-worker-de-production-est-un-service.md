# ADR-0046 — Le worker de production est un service, et son absence vient à toi

## Statut

**Accepté — 2026-08-08.** Les huit décisions sont **gelées**, y compris la **Décision 5** (le canal
est l'e-mail, pas Web Push) : elle a été soumise séparément au commanditaire, **avec son motif de
déploiement**, et l'acceptation de l'ADR la ratifie.

> Historique : Proposé — 2026-08-08, **le même jour**. Ce qui autorise l'acceptation sans délai :
> le read-before-code a été rendu **avant** toute décision, et les deux constats qui falsifiaient le
> cadrage d'origine (constats 1 et 4) ont été portés au commanditaire **avant** que la moindre
> décision soit écrite. Le maintien de la notification au périmètre est sa réponse, pas une
> déduction.

> Cadré dans l'ordre du rituel, **sans une ligne de code**, sur `main`. Pas de maquette : le
> chantier touche le **déploiement** et un **canal**, pas un écran. La seule surface visible est un
> message texte, dont la formulation est fixée en Décision 6.
>
> S'appuie sur : `adr-0031 §3` (le backend n'exécute jamais un lot — il enfile),
> `adr-0036-addendum` (une file que personne n'écoute n'est pas une attente),
> `adr-0041 §5` (deux files, un seul chemin d'exécution), `adr-0034 §F.4` (le Journal ne réécrit
> pas le passé), `DEPLOYMENT.md` (aucune CI, aucun environnement distant).
>
> **Ne révoque rien.** L'addendum ADR-0036 a traité la file au niveau **applicatif** : ce que
> l'écran doit dire quand personne ne consomme. Celui-ci traite le niveau en dessous — **le
> processus qui consomme**, son cycle de vie, et le fait que son absence doit sortir de l'écran.

### Pourquoi un ADR neuf et non un addendum à l'ADR-0036

Un addendum étend une décision **dans son sujet**. L'addendum ADR-0036 répond à *« que dit
l'application quand la file n'est pas servie ? »* — et il y répond bien. Ce chantier répond à trois
questions qui ne sont pas dans ce sujet : **qui lance le consommateur**, **qui garantit qu'il n'y en
a qu'un**, et **par quel canal son absence atteint un humain qui n'a pas l'app ouverte**. Il ajoute
un service de déploiement, un garde-fou de démarrage, une dépendance et un canal sortant. Ce n'est
pas une extension, c'est un sujet voisin.

## Contexte

Le 2026-08-08, trois `ai_jobs` `diagnostic_generate` attendaient en file — deux du 2026-08-07, un du
jour même — `started_at` NULL, `rq:queue:production-priority` en contenant exactement trois, et
**aucun worker de production en vie**.

La panne était **déjà** au `TROUBLESHOOTING.md:1450`, diagnostiquée le 2026-08-05 avec le même
`ps aux | grep production_worker → rien`, et corrigée. **Elle est revenue.** Une panne qui revient
après avoir été documentée n'est pas un incident : c'est une absence de structure.

## Constat read-before-code

> Sept constats. **Trois d'entre eux falsifient le cadrage d'origine** consigné au `BACKLOG.md` —
> c'est la raison d'être de cette étape, et ils sont écrits ici avant les décisions qu'ils
> commandent.

### 1. 🔴 La moitié « dev » de la décision d'origine est DÉJÀ FAITE

Le `BACKLOG.md` demandait *« en dev, un démarrage qui ne dépende plus d'une commande à taper — c'est
ce qui a fait revenir la panne »*.

**C'est inexact.** `scripts/dev.sh` lance le worker à l'**étape 4/5**, et un `trap` l'arrête avec le
reste. Le commentaire sur place date de la correction du 2026-08-05 et dit déjà la doctrine :

> *« Un dispositif dont une pièce doit être lancée à la main finit toujours par tourner sans elle. »*

Écrire une décision qui prescrit ce qui existe déjà en ferait une décision sans objet.

### 2. 🔴 Ce qui a contourné le correctif : une SECONDE porte d'entrée

`pnpm dev` lance le worker. Mais le mode de travail réel passe par les **paires** de
`.claude/launch.json` — `backend-dev` :8001 + `papa-dev` :5175, `backend-galaxy` :8003 +
`massimo-galaxy` :5179 — et par `dev:back` / `dev:front` / `dev:massimo` / `dev:papa`. **Aucun de
ces chemins ne passe par `dev.sh`.**

La cause n'est donc pas « il faut taper une commande ». C'est que **le correctif était attaché à une
porte d'entrée, et une deuxième s'est ouverte à côté**. C'est une cause plus précise, et elle
commande un remède différent : ce n'est pas d'automatiser un démarrage de plus, c'est de rendre
l'état du worker **impossible à ignorer quelle que soit la porte**.

### 3. 🔴 Et le même jour, TROIS workers tournaient en même temps

Pids `29543`, `31814`, `32002`, démarrés à 21:09, 21:17 et 21:17 dans trois terminaux distincts. Un
quatrième a failli s'ajouter, parce que le contrôle employé — `pgrep -fl "production_worker\|rq
worker"` — est **faux** : `\|` n'est pas une alternance en ERE, il cherche un `|` littéral. **Le
contrôle censé dire « il en tourne déjà un » répondait « aucun » quoi qu'il arrive.**

C'est interdit par le module lui-même :

> *« **Concurrence 1, et ce n'est pas provisoire** : un seul Ollama, un seul GPU. Deux jobs en
> parallèle ne produiraient pas plus vite — ils se disputeraient la même ressource et ralentiraient
> Massimo. »* (`production_worker.py`, en-tête)

**Zéro worker et trois workers sont le même défaut** : rien, nulle part, ne dit combien il y en a.

### 4. 🔴 Zéro infrastructure de notification dans tout le dépôt

Cherché : `webpush`, `pywebpush`, `apns`, `fcm`, `smtplib`, `sendgrid`, `ntfy`, `pushover`,
`telegram` côté backend ; `serviceWorker`, `PushManager`, `showNotification` côté fronts ; un
manifest PWA ; une dépendance dans `pyproject.toml`. **Rien.** L'unique résultat côté front était un
faux positif.

Et **« Notifications » est en `P4 — extension`** au `BACKLOG.md`, le rang le plus bas.

⚠️ Le commanditaire a maintenu la notification au périmètre **après lecture de ce constat**. Elle
est donc cadrée en entier, en Décision 5 et 6, et non différée.

### 5. Le service de prod est un clone de `backend`, pas de `worker-media`

`worker-media` est le mauvais modèle, et `production_worker.py` le dit déjà : son runtime est
`node:20` + Chromium, et il vit sur un réseau sans egress. Le worker de production a **le runtime et
le code du backend** — il appelle `equipment.equip_notion`, donc les cinq générateurs, donc les
providers.

Il lui faut donc la même image (`infra/docker/backend.Dockerfile`), les mêmes variables, et surtout
le même `extra_hosts: host.docker.internal:host-gateway` — **il appelle Ollama sur l'hôte**.

⚠️ Précision de documentation : le docstring de `production_worker.py` parle du *« réseau Compose
`internal` (sans egress) où vit `worker-media` »*. Ce réseau existe dans `docker-compose.yml`
(dev) ; **`docker-compose.prod.yml` ne déclare aucune clé `networks:`**, tout y est sur le réseau par
défaut.

### 6. 🔴 Réutiliser l'image du backend sans écraser son ENTRYPOINT ferait DEUX migrations concurrentes

`backend-entrypoint.sh` fait, dans cet ordre : `alembic upgrade head`, puis le seed, puis
`exec uvicorn`. L'`ENTRYPOINT` de l'image est câblé dessus.

Un service `worker` qui réutiliserait l'image telle quelle lancerait donc **un second uvicorn** et
surtout **une seconde migration en parallèle de celle du backend**. L'`entrypoint` doit être écrasé.

Mais l'écraser crée aussitôt un besoin : le worker touche la base et ne migre plus lui-même, donc il
doit **attendre que le backend ait migré**. Or `docker-compose.prod.yml` **ne déclare de healthcheck
que sur `postgres`** — `depends_on: backend: { condition: service_healthy }` n'est pas disponible
aujourd'hui. Le nécessaire est pourtant déjà là : `curl` est installé dans l'image *pour le
healthcheck* (commentaire du Dockerfile), et `GET /health` existe (`app/api/health.py:10`).

### 7. Le plancher de l'alerte est de 8 minutes, et c'est mesuré

Un worker **idle** ne rebat qu'à chaque tour de boucle de dequeue. Relevé le 2026-08-08 : battement
à **3,8 min d'ancienneté**, TTL de la clé Redis à **8 min**. Un seuil plus court ferait sonner
l'alarme sur un worker en parfaite santé.

⚠️ **`production_worker_alive()` n'est pas le maillon faible**, et il ne faut pas le « renforcer » au
passage : son docstring consigne deux pannes déjà payées (`Worker.count()` qui ment là où `all()`
dit vrai ; la seconde file non interrogée le 2026-08-06) et il interroge bien **toutes** les files.

## Alternatives considérées

### (a) Un bouton « relancer » sur les lignes du Journal — écartée

Le travail **est** en file ; l'y remettre ne change rien et donne l'illusion d'un geste. Le dépôt a
déjà nommé ce motif — *« bouton cul-de-sac »*. Un bouton qui ne peut pas agir sur la cause est pire
que pas de bouton.

### (b) Un agent qui re-détecte l'absence de worker — écartée

Ce serait une **seconde source de vérité** sur un fait que `production_worker_alive()` mesure déjà,
ce que le dépôt évite partout ailleurs. Le manque n'est pas la détection : c'est son atteignabilité.

### (c) Le watchdog dans le worker lui-même — écartée

On ne demande pas au mort de constater son décès. Le surveillant doit être le processus **qui reste
debout quand le worker tombe** : le backend.

### (d) Web Push (service worker + VAPID + `pywebpush`) — écartée, et c'est un arbitrage à relire

C'était le choix architecturalement « propre » : pas de compte tiers, clés VAPID auto-générées,
charge chiffrée de bout en bout, et ça réveille un onglet fermé.

**Écartée sur un fait de déploiement**, pas de goût : `DEPLOYMENT.md` établit qu'il n'existe **aucun
environnement distant** — les trois options d'accès (WireGuard, VPS reverse proxy, cloud) sont des
propositions, aucune n'est en place. Le Push API exige un contexte sécurisé : il fonctionne sur
`http://localhost`, donc **sur la machine qui fait tourner ZETIS**, et nulle part ailleurs. Papa
recevrait une notification système sur la machine devant laquelle il est **déjà assis** — celle où
il lui suffit de regarder le bandeau.

Une notification qui n'atteint que l'endroit d'où l'on pouvait déjà voir le problème ne corrige pas
le défaut qu'elle vise.

→ **À rouvrir le jour où l'accès distant existe** : Web Push redeviendra alors le meilleur canal, et
cette décision devra être révisée, pas contournée.

### (e) `ntfy`, Pushover, Telegram — écartées

Elles atteignent bien le téléphone, mais elles ajoutent une **dépendance à un service tiers** et un
compte à maintenir, pour un gain nul par rapport à (f). ⚠️ Elles ne heurtent pas la règle de vie
privée — l'alerte ne contient **aucune donnée de Massimo** — mais l'argument qui les sauve ne suffit
pas à les choisir.

### (f) Un e-mail via `smtplib` — **retenue**

Elle atteint le téléphone de Papa **aujourd'hui, sans accès distant**, parce que le message sort du
réseau au lieu d'exiger qu'on y entre. `smtplib` est dans la **bibliothèque standard** : zéro
dépendance ajoutée. Le seul coût est un identifiant SMTP, qui suit la convention existante — clés
API dans le `.env` **de la racine** uniquement.

Moins élégant que (d) ; **le seul des deux qui atteigne quelqu'un qui n'est pas devant la machine**.

## Décision

### 1. Le worker de production devient un service supervisé de `docker-compose.prod.yml`

Un huitième service, `worker`, avec :

- la **même image que `backend`** (`infra/docker/backend.Dockerfile`) — même runtime, même code ;
- `entrypoint` **écrasé** vers `python -m app.production_worker` — sinon migration et uvicorn en
  double (constat 6) ;
- `restart: unless-stopped` — la propriété qui referme le défaut d'origine ;
- **aucun port publié** — il ne sert rien, il consomme ;
- `extra_hosts: host.docker.internal:host-gateway` — il appelle Ollama sur l'hôte (constat 5) ;
- les mêmes variables que `backend`, `ZETIS_DATABASE_URL` **avec son préfixe** compris — un
  `DATABASE_URL` nu est ignoré en silence et le service repart sur `localhost` (`DEPLOYMENT.md`).

### 2. Le backend gagne un healthcheck, et le worker l'attend

`healthcheck: curl -fsS http://localhost:8000/health` sur `backend`, puis
`depends_on: backend: { condition: service_healthy }` sur `worker`.

**Ce n'est pas du confort** : c'est ce qui garantit que les migrations sont passées avant que le
worker touche la base, maintenant qu'il ne migre plus lui-même. `curl` est déjà dans l'image, et la
route existe.

### 3. La concurrence 1 devient une garantie, plus une phrase dans un docstring

- En **prod** : un seul service, jamais de `--scale` — écrit dans la spec, et le fichier compose
  porte le motif en commentaire.
- En **dev** : `dev:worker` et `dev.sh` **refusent de démarrer** si un worker de production tourne
  déjà, et **disent lequel** (pid). Le contrôle est
  `pgrep -f "python -m app.production_worker"` — jamais l'alternance ERE du constat 3.

> Un garde-fou qui échoue en silence est pire que pas de garde-fou : celui-ci doit **écrire ce
> qu'il a trouvé**, pas seulement s'abstenir.

### 4. Le worker suit la porte d'entrée qu'on emprunte vraiment

Les paires de `.claude/launch.json` emportent le worker avec elles. **Une seule fois pour toutes, pas
une par paire** : deux paires lancées ensemble donneraient deux workers, soit exactement le défaut du
constat 3 réintroduit par sa propre correction.

La règle qui en sort, et qui vaut au-delà de ce chantier :

> **Un correctif attaché à une porte d'entrée ne survit pas à l'ouverture d'une seconde.** Quand on
> ajoute un chemin de lancement, on hérite de tout ce que l'ancien garantissait.

#### `[amendement]` 🔴 « Une seule fois pour toutes » était INIMPLÉMENTABLE

> Amendé le 2026-08-08, au read-before-code de la slice B, et **soumis au commanditaire avant toute
> écriture**. La décision d'origine disait : *« une seule fois pour toutes, pas une par paire »*.

Deux faits, vérifiés dans `.claude/launch.json` :

- **chaque entrée exige un `port`** — le fichier n'a aucune forme pour un processus qui n'écoute
  rien ;
- il y a **cinq** entrées backend : `backend` :8000, `backend-dev` :8001, `backend-dev2` :8002,
  `backend-galaxy` :8003, `backend-lan` :8004.

Il n'existe donc **aucun endroit** où poser « le worker, une fois ». Le seul contournement aurait été
une entrée dédiée avec un **port inventé que rien n'écoute** — et qu'il aurait fallu penser à lancer,
c'est-à-dire la commande à taper que ce chantier supprime.

**Ce qui est retenu** : le worker accompagne **chaque** entrée backend, via `scripts/with-worker.sh`.
La garantie « un seul worker » n'est plus portée par l'unicité du point de lancement mais par le
**garde-fou** — ce que le motif de la décision disait déjà : *« le garde-fou doit être ce qui rend
l'item 2 sûr, pas un filet posé à côté »*. La première entrée lancée démarre le worker ; les
suivantes refusent et nomment le pid.

⚠️ **La garantie est inchangée ; seul le moyen l'est.** Vérifié en conditions réelles : un second
appel rend *« ⚠ Un worker de production tourne déjà — pid 29543 (+1 processus : RQ fork son
scheduler) »*, puis laisse la commande enveloppée tourner normalement.

#### `[amendement]` Le garde-fou vit dans le MODULE, pas dans les scripts

Le tableau du périmètre listait `scripts/dev.sh`, `package.json` et `.claude/launch.json`. Le garde-fou
est finalement dans **`apps/backend/app/production_worker.py`**, et c'est la Décision 4 appliquée à
elle-même : en bash, il aurait fallu le recopier dans chaque porte, et **la prochaine porte serait
née sans lui**. Dans le module, il couvre les quatre portes actuelles et celles qui n'existent pas
encore.

Effet de bord favorable : **`scripts/dev.sh` et `package.json` n'ont eu besoin d'aucune
modification**. Ils appellent le module, donc ils héritent du garde-fou.

⚠️ Et il mesure des **processus**, jamais l'enregistrement RQ dans Redis : les deux divergent dans
les deux sens (une clé expire après 8 min sans battement ; un enregistrement survit à un worker tué
sans nettoyage). `production_worker_alive()` répond à *« la file est-elle servie ? »* et reste la
bonne réponse à cette question-là.

### 5. L'absence du worker sort de l'écran — par e-mail, et le motif est un fait de déploiement

Un **watchdog dans le backend** — pas dans le worker (alternative c) — qui envoie un e-mail quand
**les deux** conditions tiennent :

- la file de production porte au moins un travail ;
- et `production_worker_alive()` est faux **depuis plus de N minutes**, avec **N ≥ 8** et
  **N = 15 par défaut** (constat 7 : le plancher mesuré est 8 ; 15 laisse une marge sans rendre
  l'alerte tardive).

Contraintes :

- **une seule alerte par épisode** — un verrou Redis à TTL, levé dès qu'un worker répond à nouveau.
  Une alerte qui se répète toutes les N minutes est une alerte qu'on filtre ;
- **dégradation propre sans configuration SMTP** : pas de crash, pas de 500, une ligne de log au
  démarrage disant que le canal est inerte. Même patron que la dérogation `curriculum_*` sans clé
  (ADR-0009) ;
- destinataire et identifiants dans le **`.env` de la racine**, jamais dans `apps/backend/.env`.

⚠️ **La règle `CLAUDE.md` §gamification sur les « notifications intrusives » ne s'applique pas
ici** : elle protège **Massimo** d'une pression à revenir. Ceci est une alerte d'infrastructure
adressée à **Papa**, sur un fait technique, sans compte de non-fait ni rien à rattraper.

### 6. Ce que l'e-mail dit — et ce qu'il ne dit pas

Il nomme **l'instrument**, jamais une personne, et il ne contient **aucune donnée de Massimo** :

> **Objet** — ZETIS : la production est à l'arrêt
>
> Trois travaux attendent dans la file depuis 21 minutes, et aucun moteur de production ne répond.
> Rien n'est perdu : ils repartiront dès qu'un worker démarrera.
>
> Sur la machine ZETIS : `pnpm dev:worker` (ou `docker compose -f docker-compose.prod.yml up -d
> worker`).

Trois règles :

- **le compte de travaux en attente est un fait, pas un reproche** — il décrit une file, pas un
  retard de quelqu'un ;
- **« rien n'est perdu » est dit à chaque fois.** C'est vrai (RQ conserve), et c'est ce qui
  transforme une alarme en information ;
- **le geste de réparation est dans le message.** Une alerte qui oblige à retrouver la commande
  ailleurs est une alerte à moitié utile.

### 7. Le bouton « abandonner » reste ouvert, et n'entre PAS ici

Un travail bloqué reprendra dès qu'un worker démarrera — des jours plus tard, sans qu'on s'y
attende. Le besoin est réel et il est **consigné, pas traité** : il touche le Journal et l'ADR-0034
§F.4 (« le Journal ne réécrit pas le passé »), donc son propre cadrage.

### 8. Ce qui ne change pas

- **Le bandeau Papa reste la surface de référence** — il mesure déjà, bien, et l'e-mail ne fait que
  le rendre atteignable. Aucune modification de `ProductionStrip.tsx`.
- **Les pourcentages absents sur un lot en file restent absents** (`ProductionStrip.tsx:139`) :
  l'en-tête refuse de chiffrer ce qui n'a pas démarré, et c'est une garde acquise au prix d'un
  défaut réel le 2026-08-07. **Ne pas « réparer ».**
- **`production_worker_alive()` n'est pas touché.**
- **Aucune surface enfant** n'est modifiée, ni informée.

## Périmètre

**Trois slices**, dans cet ordre — B est indépendante de A, C dépend de rien mais est la plus
lourde :

| Slice | Objet | Fichiers attendus |
|---|---|---|
| **A** | Le service supervisé + le healthcheck | `docker-compose.prod.yml`, `docs/devops/worker-production.md` |
| **B** | Le dev ne peut plus démarrer deux fois | `scripts/dev.sh`, `package.json`, `.claude/launch.json` |
| **C** | L'absence vient à toi | module `production` (watchdog), `core/config.py`, `.env.example`, tests |

**Hors périmètre, explicitement** — et rien de tout cela n'entre « tant qu'on y est » :

- le **bouton « abandonner »** (Décision 7) ;
- **Web Push et l'accès distant** — écartés avec motif (alternative d), à rouvrir ensemble ;
- le **bandeau Papa** et `ProductionStrip.tsx` ;
- `production_worker_alive()` et `core/queue.py` ;
- ~~les **quatre défauts** de `docker-compose.prod.yml` qu'on croisera sans les traiter : aucun
  healthcheck sur `redis`/`minio`, aucune limite mémoire sur `backend`, `POSTGRES_PASSWORD` avec un
  défaut de dev en clair, aucune clé `networks:` ;~~ **`[amendement]` FAITS — voir ci-dessous** ;
- toute **surface Massimo** ;
- le **multi-enfant**, le **multi-destinataire**.

### `[amendement]` Les quatre défauts du compose entrent au périmètre

> Décidé par le commanditaire le 2026-08-08, **après** que le constat suivant lui ait été soumis :
> **un seul des quatre est une correction, les trois autres sont des décisions**. Il a tranché
> « tout corriger ». Les valeurs sont **mesurées**, pas inventées, et chaque choix porte son motif
> dans le fichier.

| # | Ce qui est fait | Comment la valeur a été choisie |
|---|---|---|
| 1 | healthchecks `redis` (`redis-cli ping`) et `minio` (`/minio/health/live`), et les `depends_on` passent en `service_healthy` | outils vérifiés présents dans les deux images officielles |
| 2 | `mem_limit: 1g` sur `backend` **et** `worker` | **mesuré** à vide : backend **92 Mio**, worker **41 Mio** (`docker stats`). ~10× de marge pour les pointes non mesurées (extraction PDF du RAG, voix Piper ONNX) |
| 3 | `POSTGRES_PASSWORD` en `${…:?}` — plus de défaut de dev | 🔴 `prod:up` **s'arrête** désormais sans la variable, au lieu de démarrer une base ouverte avec un secret public |
| 4 | deux réseaux : `interne` (`internal: true`) et `externe` | `backend` et `worker` sont sur les deux (Ollama sur l'hôte + Anthropic) ; `worker-media` sur `interne` **seul** — c'est tout son intérêt |

🔴 **Le piège du n°3, qui n'est pas dans le défaut mais dans sa correction** : Postgres ne fixe le
mot de passe qu'à l'**initialisation du volume**. Sur un `zetis-prod_postgres_data` déjà créé,
changer la variable ne change pas le mot de passe — elle produit une **erreur d'authentification**.
Il faut reprendre la valeur d'origine, ou supprimer le volume.

⚠️ **Une limite mémoire trop basse serait pire que pas de limite** : un OOM-kill en pleine
génération ressemblerait exactement à la panne que ce chantier corrige. Elle est récupérable — le
`restart: unless-stopped` relance — mais le travail en cours serait perdu. À relever si un OOM
apparaît, **jamais à baisser sans nouvelle mesure sous charge**.

**Vérifié en conditions réelles**, pile relancée après le changement : les cinq services `healthy` ·
le worker joint l'hôte (`host.docker.internal:11434` → **HTTP 200**) et ses voisins (`minio:9000` →
**200**) · 🔴 **contre-épreuve** : un conteneur attaché à `interne` **seul** n'atteint pas l'hôte
(**HTTP 000**) — le réseau coupe bien l'egress · `mem_limit` appliquée (1 GiB, usage 92/41 Mio) ·
et le **redémarrage automatique tient toujours** après la bascule de topologie (`RestartCount 0 → 1`).

⚠️ **Trouvé sans le corriger** : dans le compose de **dev**, `worker-media` déclare
`networks: [internal]` **seul** alors que `postgres`/`redis`/`minio` sont sur le réseau par défaut —
ils ne peuvent donc pas se joindre. Masqué par `profiles: [render]`, qui fait que le service n'est
presque jamais démarré. **Hors périmètre : c'est l'autre fichier.**

## Conséquences

### Positives

- La panne du 2026-08-05, revenue le 2026-08-08, **ne peut plus se produire en prod** : le service
  redémarre seul.
- Les trois workers concurrents **ne peuvent plus se produire en dev** : le démarrage refuse et dit
  pourquoi.
- L'état du couloir de production cesse d'être une information qu'il faut **aller chercher**.
- Le dépôt gagne son **premier canal sortant**, réutilisable — et le motif de son choix est écrit,
  donc révisable quand la prémisse (pas d'accès distant) tombera.

### Négatives / coûts assumés

- 🔴 **Un canal e-mail est moins bon que Web Push sur le papier**, et le dépôt en garde la trace :
  c'est un choix contraint par l'absence d'accès distant, pas une préférence. Le jour où l'accès
  distant existe, cette décision est à rouvrir.
- **Un identifiant SMTP entre dans le `.env`** — un secret de plus à ne pas committer.
- **La supervision prod ne protège pas le dev**, et le dev est là où le travail se fait. Les slices
  B et C sont ce qui couvre le dev ; A seule ne suffirait pas.
- **Aucune CI ne vérifiera le compose.** Comme tout le reste ici, la preuve est un `prod:up` lancé à
  la main.
- Le watchdog ajoute une tâche de fond au backend — négligeable, mais ce n'est plus un processus
  purement requête/réponse.

## Le signal qui dirait qu'on s'est trompé

- **L'e-mail arrive alors que tout va bien** → N est trop bas, ou le watchdog lit mal. Remonter N,
  **jamais** désactiver l'alerte.
- ~~**L'e-mail n'arrive jamais alors que la panne se reproduit** → le canal est inerte sans qu'on
  l'ait su : il manque une preuve de vie du canal lui-même (un envoi de test déclenchable).~~
  ✅ **CONSTRUIT dans la slice C** — `python -m app.core.mailer`. Ce signal désignait un manque
  réel ; le chantier l'a comblé au lieu d'attendre qu'il se manifeste. La commande **dit** que le
  canal est inerte plutôt que de se taire, et un attrapeur SMTP local (`mailpit`) prouve tout sauf
  la dernière patte — qu'un fournisseur réel délivre. Procédure : `docs/devops/worker-production.md`.
- **Le garde-fou de la slice B gêne** — on veut légitimement un second worker un jour → alors la
  concurrence 1 est à rediscuter dans son ADR, pas à contourner par un `--force` ajouté en douce.
- **Papa reçoit l'alerte et ne peut rien faire** parce qu'il n'est pas devant la machine → c'est
  l'argument qui rouvre l'accès distant, et avec lui Web Push.
- **Le service `worker` redémarre en boucle** sans que personne le voie → il manquerait une limite
  de redémarrage et sa remontée ; `restart: unless-stopped` masque un crash permanent aussi bien
  qu'il répare un crash ponctuel.

## Suivi

- Le prompt de slice : `prompts/claude-code/prompts-claude-code-adr-0046.md`.
- La spec : `docs/devops/worker-production.md`.

### `[amendement]` 🔴 La procédure de vérification écrite ici était FAUSSE — elle rendait un faux négatif

> Corrigé le 2026-08-08, en la jouant. Le texte d'origine disait : *« La vérification est humaine et
> non délégable : `pnpm prod:up`, **tuer le conteneur `worker`**, vérifier qu'il revient. »* Les deux
> moitiés de cette phrase étaient fausses.

**1. `docker compose kill worker` ne simule pas un crash — c'est un arrêt d'opérateur.** Le démon
marque le conteneur comme arrêté à la demande, et `unless-stopped` **exclut ce cas par définition** :
c'est tout le sens du mot *unless*. Mesuré : après un `kill`, `RestartCount = 0`, `State = exited`.

🔴 **Le service était correct et la procédure disait le contraire.** Quiconque aurait suivi la
procédure écrite aurait conclu que le chantier avait échoué. Une procédure de preuve qui rend un
faux négatif est pire qu'une absence de procédure — elle fait défaire ce qui marche.

**La bonne manœuvre** : faire mourir le processus *depuis l'intérieur*, sans que le démon l'ait
demandé. ⚠️ `kill` n'existe pas dans l'image slim et `docker exec` n'a pas de builtin — il faut
passer par `sh`. Et viser **SIGTERM**, que RQ intercepte : la protection du PID 1 empêche la
délivrance des signaux **sans gestionnaire**, donc un `kill -9 1` de l'intérieur ne ferait rien.

```bash
docker exec zetis-prod-worker-1 sh -c 'kill -TERM 1'
```

**Résultat mesuré : `RestartCount 0 → 1`, `StartedAt` changée, et le worker réécoute ses deux
files.** ✅

**2. « non délégable » était faux pour cette moitié.** Un conteneur qui redémarre est **mécaniquement
vérifiable**, et ça a été fait. Ce qui reste humain, c'est la **slice C** — un e-mail qui arrive.

### Ce qui est prouvé, et comment

| Propriété | Preuve |
|---|---|
| La barrière `service_healthy` | séquence de démarrage réelle : `backend … Waiting → Healthy`, **puis** `worker Starting` |
| L'`entrypoint` écrasé | les logs du worker montrent RQ `Listening on production-priority, production`, **pas** uvicorn ; et le backend a migré **seul** |
| Le redémarrage automatique | `RestartCount 0 → 1` après une mort de processus interne |
| 🔴 **Le worker conteneurisé PRODUIT vraiment** | voir ci-dessous — c'était le trou principal |
| Le garde-fou (slice B) | les deux portes refusent worker vivant · **laissent démarrer** sans worker · un second refuse en nommant le nouveau pid |
| Le canal e-mail (slice C) | chaîne complète du watchdog passée par un **vrai SMTP** (attrapeur local) : `trop-tot` → `alerte-envoyee` → `deja-alertee` → `worker-vivant`, **un seul message** |
| L'alerte jusqu'à une vraie boîte | ⬜ **NON PROUVÉ** — demande un identifiant SMTP réel |

#### 🔴 La preuve qui manquait au §Suivi : le worker conteneurisé n'avait jamais exécuté un travail

Il démarrait, écoutait, redémarrait après un crash — mais **aucun job n'était jamais passé par lui**.
Ollama avait été joint par un `curl`, pas par une génération. Piper, la clé Anthropic et les cinq
générateurs n'étaient **exercés par rien**. Le §Suivi d'origine ne le demandait pas : c'est un oubli
du cadrage, et le seul test qui exerçait ce que le chantier construit.

**Joué le 2026-08-08 dans la pile prod**, un `diagnostic_generate` (SVT) enfilé depuis le conteneur
backend :

```
21:25:54  production-priority: run_ai_job(114)
21:27:22  Successfully completed … in 0:01:27
```

Écrit en base : **40 questions sur 8 notions distinctes**, du texte réel (*« Lors d'un tremblement de
terre, comment appelle-t-on le point situé à la surface… »*), et
**`validation_status = pending`, `validated_by = ∅`** — le gate de l'`adr-0043` tient jusque dans la
pile prod. ⚠️ 40 / 8 = **5 questions par notion** : c'est bien le `QUESTIONS_PER_SKILL` relevé de 2 à
5 par l'`adr-0043` qui tourne.

**Ce que ça prouve et qu'aucun test ne pouvait prouver** : Ollama est joignable depuis le conteneur
**en génération réelle**, et le chemin complet backend → Redis → worker conteneurisé → LLM → base
fonctionne.

⚠️ **Jouée sans perturber le dev** : seul MinIO entrait en conflit (9000-9001) et il est paramétrable
(`MINIO_PORT`) ; `up -d --build worker` ne construit que le worker et ses dépendances — **pas
`worker-media`**, donc pas les ~300 Mo de Chromium.
