# DevOps — Le worker de production

> **Créé le 2026-08-08** par l'`adr-0046`. Le worker de production existait depuis des semaines
> sans document : `docs/devops/docker-compose.md` date de l'initialisation du dépôt (2026-06-29) et
> ne le mentionne pas, et `ARCHITECTURE.md:152` se contentait de dire qu'il est *« lancé à part »*.
> C'est précisément ce flou qui a laissé la panne revenir deux fois.

## Ce que c'est

Le processus qui **consomme** la file de production. Le backend n'exécute jamais un lot
(`adr-0031 §3`) : il accepte en `202` et enfile sur Redis. Sans ce processus, ZETIS accepte tout et
ne produit rien.

```
python -m app.production_worker
```

- **Files écoutées, dans cet ordre** : `production-priority`, puis `production`. L'ordre **est** la
  priorité — RQ vide la première avant de regarder la seconde.
- **Runtime** : celui du backend. Ce n'est pas un paquet séparé, et c'est une décision — il appelle
  `equipment.equip_notion`, donc les cinq générateurs, donc les providers et les modèles.
- **Concurrence 1**, non provisoire : un seul Ollama, un seul GPU. `SimpleWorker`, sans fork.

## 🔴 La règle qui prime toutes les autres

> **Il n'y a JAMAIS plus d'un worker de production.**

Zéro worker et trois workers sont le même défaut — les deux ont été mesurés le même jour
(2026-08-08). Avant de lancer quoi que ce soit :

```bash
pgrep -f "python -m app.production_worker"
```

⚠️ **Ne jamais écrire ce contrôle avec une alternance échappée** — `pgrep -fl "a\|b"` cherche un `|`
littéral en ERE et ne rend **jamais** rien. C'est ce faux négatif qui a produit le troisième worker.

## En production

Service `worker` de `docker-compose.prod.yml`. Ce qui le définit :

| Propriété | Valeur | Pourquoi |
|---|---|---|
| image | `infra/docker/backend.Dockerfile` | même runtime et même code que le backend |
| `entrypoint` | **écrasé** → `python -m app.production_worker` | l'entrypoint de l'image fait `alembic upgrade head` + seed + uvicorn : sans écrasement, **deuxième migration concurrente** et deuxième uvicorn |
| environnement | **l'ancre YAML `*generation-env` du backend**, pas une copie | voir ci-dessous |
| `restart` | `unless-stopped` | la propriété qui referme la panne |
| ports | **aucun** | il ne sert rien, il consomme |
| `extra_hosts` | `host.docker.internal:host-gateway` | il appelle **Ollama sur l'hôte** |
| `depends_on` | `backend: { condition: service_healthy }` | il ne migre plus lui-même : il doit attendre que le backend l'ait fait |

### 🔴 `entrypoint:` et non `command:` — le piège du voisin

L'image du backend porte un `ENTRYPOINT` en **forme exec** (`backend-entrypoint.sh`) qui fait
`alembic upgrade head`, le seed, puis `exec uvicorn`, et qui **n'inspecte jamais ses arguments**. Un
`command:` serait donc **silencieusement ignoré** : le service lancerait un second uvicorn avec une
seconde migration concurrente.

⚠️ **L'idiome du voisin mène exactement au mauvais choix** : `worker-media` utilise bien
`CMD ["python", "-m", "worker_media.worker"]` — mais son image **n'a aucun `ENTRYPOINT`**. Ce qui
marche pour lui ne marche pas ici.

### L'environnement est celui du backend, à la variable près

Le service réutilise l'**ancre YAML** `&generation-env` définie sur `backend`. Ce n'est pas de
l'élégance : le worker exécute **exactement les mêmes générateurs**, et deux blocs recopiés
divergeraient au premier ajout — une divergence qui ne se verrait qu'en production, sur un travail
qui échoue.

Deux variables qu'un nettoyage futur croirait inutiles sur un worker, et qui ne le sont pas :

- **`ANTHROPIC_API_KEY` / `CURRICULUM_LLM_PROVIDER`** — les travaux `curriculum_chapters`,
  `curriculum_lessons` et `curriculum_skills_backfill` sont **enfilés** (`curriculum/router.py:84`,
  `:237`, `:255`, `:398`), donc exécutés **ici**, et la dérogation `adr-0009` les route vers
  Anthropic. Sans la clé, la génération du référentiel échoue **dans un worker** — plus discret
  qu'un 503 rendu à Papa ;
- **`AUDIO_STORAGE_DIR` + le volume `capsule_audio`** — `capsule_generate`, `capsule_regenerate` et
  `capsule_voice` sont enfilés eux aussi : la voix Piper s'écrit dans le volume partagé, que
  `worker-media` relit pour le rendu MP4.

⚠️ **`ZETIS_DATABASE_URL`, avec son préfixe.** `Settings` déclare `env_prefix="ZETIS_"` et
`database_url` n'a aucun `validation_alias` : un `DATABASE_URL` nu est **ignoré en silence** et le
service repart sur `localhost` avec le mot de passe de dev. C'est le piège déjà payé par
`worker-media`, dont le compose porte le commentaire.

**Jamais de `--scale worker=N`.** La concurrence 1 est une contrainte matérielle, pas un réglage.

### Le healthcheck du backend

Ajouté par le même chantier, et il n'est pas décoratif : c'est lui qui rend
`condition: service_healthy` disponible.

```yaml
healthcheck:
  test: ["CMD-SHELL", "curl -fsS http://localhost:8000/health || exit 1"]
```

`curl` est déjà installé dans l'image *pour cet usage* (commentaire du Dockerfile), et
`GET /health` existe (`app/api/health.py:10`).

## En développement

Deux portes d'entrée, et **c'est l'existence de la seconde qui a fait revenir la panne** — le
correctif de 2026-08-05 n'était attaché qu'à la première.

| Porte | Lance le worker ? |
|---|---|
| `pnpm dev` (`scripts/dev.sh`) | ✅ oui, étape 4/5, avec un `trap` qui l'arrête |
| les **5 entrées backend** de `.claude/launch.json` | ✅ oui, via `scripts/with-worker.sh` |
| `pnpm dev:back` / `dev:front` / `dev:massimo` / `dev:papa` | ❌ non — ce sont des morceaux, pas une stack |
| `pnpm dev:worker` | ✅ c'est son seul objet |

⚠️ **Chaque** entrée backend l'emporte, et non « une seule fois pour toutes » : `launch.json` exige
un `port` sur chaque entrée et n'a donc aucune forme pour un processus qui n'écoute rien. C'est le
**garde-fou** qui tient la garantie, pas l'unicité du point de lancement (`adr-0046` Décision 4,
amendée).

### Le garde-fou

Il vit dans **`app/production_worker.py`**, donc il couvre **toutes** les portes — y compris celles
qui n'existent pas encore. C'est la raison pour laquelle `dev.sh` et `package.json` n'ont eu besoin
d'aucune modification.

```
⚠ Un worker de production tourne déjà — pid 29543 (+1 processus : RQ fork son scheduler).
  Un seul à la fois — un seul Ollama, un seul GPU.
  Pour le remplacer :  kill 29543 29544 && pnpm dev:worker
```

Trois choses que ce message fait exprès :

- **il écrit ce qu'il a trouvé.** Un garde-fou qui s'abstient en silence se lit comme un démarrage
  réussi, et on cherche ensuite pourquoi rien ne produit ;
- **il ne compte pas les processus comme des workers** — RQ fork un scheduler qui porte la même
  ligne de commande. Annoncer « pid 29543, 29544 » ferait croire à deux workers, soit le défaut
  qu'on empêche ;
- **il donne le geste**, avec tous les pids : tuer le worker sans son scheduler laisserait un
  orphelin.

🔴 **Le motif de détection a DEUX façons d'être faux**, rencontrées toutes les deux le 2026-08-08 :

| Direction | Motif | Effet |
|---|---|---|
| sous-détection | `"production_worker\|rq worker"` | `\|` n'est pas une alternance en ERE → ne rend **jamais** rien → **autorise toujours** le démarrage |
| sur-détection | `^(.*/)?python[0-9.]* -m app\.production_worker$` | `(.*/)?` avale `sh -c cd … && .venv/bin/` → attrape **le wrapper qui vient de nous lancer** → blocage permanent |

Le motif retenu, `^[^ ]*python[0-9.]* -m app\.production_worker$`, ferme les deux : un chemin ne
contient pas d'espace, la ligne du wrapper si. Cinq verrous le tiennent
(`test_production_worker_garde.py`), **tous sabotés et rouges**.

## L'alerte quand personne ne consomme

Un **watchdog dans le backend** — pas dans le worker : on ne demande pas au mort de constater son
décès.

Il envoie **un** e-mail quand les deux conditions tiennent :

1. la file de production porte au moins un travail ;
2. `production_worker_alive()` est faux depuis plus de `PRODUCTION_ALERT_AFTER_MINUTES`.

⚠️ **Il ne re-détecte rien, et il n'interroge pas Redis pour la condition 1.** C'est
`activity.porte_un_travail_en_file()` qui répond — **la même fonction que la route d'activité**, et
elle a été extraite pour ce chantier précisément pour qu'il n'y en ait qu'une. Le dépôt s'est déjà
fait prendre par des définitions recopiées (`OPEN_GAP_STATUSES` a vécu en quatre exemplaires) : deux
lecteurs d'une même question doivent lire la même fonction, sinon l'écran et l'alerte finiront par
se contredire sur l'état du couloir.

🔴 **L'état vit dans Redis, jamais en mémoire** — deux clés : l'instant de la première observation,
et le verrou d'unicité. Ce n'est pas un détail : en développement, **jusqu'à cinq backends tournent
en parallèle** (les paires de `launch.json`). Avec un état en mémoire, chacun enverrait son e-mail —
cinq alertes pour une panne, soit le défaut des trois workers transposé à la surveillance.

### 🔴 Le plancher de 8 minutes, mesuré

Un worker **idle** ne rebat qu'à chaque tour de boucle de dequeue. Relevé le 2026-08-08 : battement
à **3,8 min d'ancienneté**, TTL de clé Redis à **8 min**.

**Un seuil sous 8 minutes ferait sonner l'alarme sur un worker en parfaite santé.** Défaut : **15**.

### Une seule alerte par épisode

Verrou Redis à TTL, levé dès qu'un worker répond à nouveau. Une alerte qui se répète toutes les 15
minutes est une alerte qu'on filtre — et un filtre, une fois posé, couvre aussi la vraie panne
suivante.

### Ce que le message dit

Il nomme **l'instrument**, jamais une personne, et ne contient **aucune donnée de Massimo**.

> **ZETIS : la production est à l'arrêt**
>
> Trois travaux attendent dans la file depuis 21 minutes, et aucun moteur de production ne répond.
> Rien n'est perdu : ils repartiront dès qu'un worker démarrera.
>
> Sur la machine ZETIS : `pnpm dev:worker`
> (ou `docker compose -f docker-compose.prod.yml up -d worker`).

- le compte de travaux est **un fait, pas un reproche** ;
- **« rien n'est perdu » à chaque fois** — c'est vrai, RQ conserve, et c'est ce qui fait d'une
  alarme une information ;
- **le geste de réparation est dans le message.**

### Configuration

Dans le `.env` **de la racine** — jamais dans `apps/backend/.env`, convention du dépôt pour tout
identifiant.

| Variable | Défaut | Rôle |
|---|---|---|
| `PRODUCTION_ALERT_AFTER_MINUTES` | `15` | ⚠️ **plancher 8** — une valeur plus basse est **relevée** avec un avertissement, jamais refusée |
| `ALERT_EMAIL_TO` | *(vide)* | destinataire ; **vide ⇒ canal inerte** |
| `ALERT_EMAIL_FROM` | *(vide)* | expéditeur ; défaut `SMTP_USER` |
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | serveur d'envoi ; STARTTLS si annoncé |
| `SMTP_USER` / `SMTP_PASSWORD` | *(vide)* | 🔴 secret — `.env` racine uniquement |

**Sans configuration : dégradation propre.** Pas de crash, pas de 500 — une ligne de log au
démarrage disant que le canal est inerte. Même patron que la dérogation `curriculum_*` sans clé
Anthropic (`adr-0009`).

## Vérifier — et pourquoi aucun test ne le fera

### 🔴 `docker compose kill worker` NE PROUVE RIEN — et rend un faux négatif

C'est un **arrêt d'opérateur** : le démon marque le conteneur comme arrêté à la demande, et
`unless-stopped` **exclut ce cas par définition** — c'est le sens du mot *unless*. Mesuré le
2026-08-08 : après un `kill`, `RestartCount = 0`, `State = exited`, sur un service parfaitement
configuré.

**Cette procédure a été écrite fausse dans la première version de l'ADR et de ce document.**
Quiconque l'aurait suivie aurait conclu que le chantier avait échoué, et serait allé « réparer » ce
qui marchait.

**La supervision — le service revient tout seul** ✅ *vérifié le 2026-08-08*

Il faut faire mourir le processus **depuis l'intérieur**, sans que le démon l'ait demandé :

```bash
pnpm prod:up
# ⚠️ `kill` n'est pas dans l'image slim et `docker exec` n'a pas de builtin → passer par `sh`.
# ⚠️ Viser SIGTERM, que RQ intercepte : la protection du PID 1 bloque les signaux SANS
#    gestionnaire, donc un `kill -9 1` de l'intérieur ne ferait rien.
docker exec zetis-prod-worker-1 sh -c 'kill -TERM 1'
sleep 15
docker inspect zetis-prod-worker-1 --format '{{.RestartCount}} {{.State.Status}}'   # → 1 running
```

💡 **Pour rejouer sans démonter le dev** : seul MinIO entre en conflit, et il est paramétrable.
`up -d --build worker` ne construit que le worker et ses dépendances — pas `worker-media`, donc pas
les ~300 Mo de Chromium.

```bash
MINIO_PORT=9010 MINIO_CONSOLE_PORT=9011 docker compose -f docker-compose.prod.yml up -d --build worker
```

### La preuve de vie du canal — `python -m app.core.mailer`

🔴 **Un canal d'alerte qu'on croit armé et qui ne l'est pas est pire qu'un canal absent** : on cesse
de surveiller en comptant sur lui. Sans cette commande, la seule façon de savoir si l'e-mail part
serait d'attendre une vraie panne — c'est-à-dire de découvrir la défaillance du détecteur au moment
précis où on en a besoin.

```bash
cd apps/backend && .venv/bin/python -m app.core.mailer
```

Sans configuration, elle **dit** que le canal est inerte et sort en `1`. Configurée, elle envoie et
sort en `0`.

#### Tout prouver sans compte SMTP réel

Un attrapeur local prouve **tout sauf la dernière patte** (qu'un fournisseur délivre) :

```bash
docker run -d --rm --name mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit
cd apps/backend && SMTP_HOST=localhost SMTP_PORT=1025 ALERT_EMAIL_TO=papa@test \
  .venv/bin/python -m app.core.mailer
# le message reçu : http://localhost:8025   (ou l'API : /api/v1/messages)
docker rm -f mailpit
```

✅ **Joué le 2026-08-08**, y compris la **chaîne complète** du watchdog contre ce vrai SMTP —
`trop-tot` à t+0 et t+7, `alerte-envoyee` à t+21, `deja-alertee` à t+40, `worker-vivant` au retour du
worker, **un seul message** reçu, au bon destinataire, avec le bon texte.

**L'alerte de bout en bout — jusqu'à une vraie boîte** ⬜ *demande un identifiant SMTP réel*

```bash
# Ici `stop` est le bon geste : on VEUT un arrêt d'opérateur, pour que rien ne le relance.
docker compose -f docker-compose.prod.yml stop worker
# … déclencher une production depuis l'app, puis patienter PRODUCTION_ALERT_AFTER_MINUTES …
```

🔴 **Celle-ci est vraiment humaine** : aucune CI n'existe dans ce dépôt (`DEPLOYMENT.md`), et rien
ne peut constater à ma place qu'un e-mail est arrivé dans une boîte.

> ⚠️ **La distinction vaut d'être retenue** : `stop` et `kill` sont tous deux des arrêts
> d'opérateur, donc tous deux **inaptes** à prouver un redémarrage — et tous deux **exactement ce
> qu'il faut** pour maintenir le worker éteint pendant qu'on teste l'alerte. Le même geste sert une
> preuve et sabote l'autre.

## Ce que ce document ne couvre pas

- Le **bouton « abandonner »** un travail bloqué — consigné, non cadré (`adr-0046` Décision 7).
- **Web Push et l'accès distant** — écartés avec motif (`adr-0046` alternative d), à rouvrir
  ensemble le jour où l'un des deux existe.
- `worker-media`, qui est un autre service, avec un autre runtime, sur un autre réseau.
