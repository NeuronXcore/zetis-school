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
| `restart` | `unless-stopped` | la propriété qui referme la panne |
| ports | **aucun** | il ne sert rien, il consomme |
| `extra_hosts` | `host.docker.internal:host-gateway` | il appelle **Ollama sur l'hôte** |
| `depends_on` | `backend: { condition: service_healthy }` | il ne migre plus lui-même : il doit attendre que le backend l'ait fait |

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
| paires `.claude/launch.json` (`backend-dev`, `backend-galaxy`, …) | ✅ oui, **une seule fois pour toutes** |
| `pnpm dev:back` / `dev:front` / `dev:massimo` / `dev:papa` | ❌ non — ce sont des morceaux, pas une stack |
| `pnpm dev:worker` | ✅ c'est son seul objet |

### Le garde-fou

`dev:worker` et `dev.sh` **refusent de démarrer** si un worker tourne déjà, et **disent lequel** :

```
⚠ Un worker de production tourne déjà (pid 29543). Un seul à la fois — un seul Ollama, un seul GPU.
  Pour le remplacer :  kill 29543 && pnpm dev:worker
```

Un garde-fou qui s'abstient en silence est pire que pas de garde-fou : celui-ci écrit ce qu'il a
trouvé.

## L'alerte quand personne ne consomme

Un **watchdog dans le backend** — pas dans le worker : on ne demande pas au mort de constater son
décès.

Il envoie **un** e-mail quand les deux conditions tiennent :

1. la file de production porte au moins un travail ;
2. `production_worker_alive()` est faux depuis plus de `PRODUCTION_ALERT_AFTER_MINUTES`.

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
| `PRODUCTION_ALERT_AFTER_MINUTES` | `15` | ⚠️ **plancher 8** — voir ci-dessus |
| `ALERT_EMAIL_TO` | *(vide)* | destinataire ; **vide ⇒ canal inerte** |
| `SMTP_HOST` / `SMTP_PORT` | — / `587` | serveur d'envoi |
| `SMTP_USER` / `SMTP_PASSWORD` | *(vide)* | 🔴 secret — `.env` racine uniquement |

**Sans configuration : dégradation propre.** Pas de crash, pas de 500 — une ligne de log au
démarrage disant que le canal est inerte. Même patron que la dérogation `curriculum_*` sans clé
Anthropic (`adr-0009`).

## Vérifier — et pourquoi aucun test ne le fera

**Deux preuves, humaines et non délégables** :

```bash
# 1. La supervision : le service revient tout seul.
pnpm prod:up
docker compose -f docker-compose.prod.yml kill worker
docker compose -f docker-compose.prod.yml ps worker   # doit être remonté
```

```bash
# 2. L'alerte : lancer un lot sans worker, attendre le seuil.
docker compose -f docker-compose.prod.yml stop worker
# … déclencher une production depuis l'app, puis patienter PRODUCTION_ALERT_AFTER_MINUTES …
```

Aucune CI n'existe dans ce dépôt (`DEPLOYMENT.md`), et un test ne peut prouver ni qu'un conteneur
redémarre, ni qu'un e-mail est arrivé.

## Ce que ce document ne couvre pas

- Le **bouton « abandonner »** un travail bloqué — consigné, non cadré (`adr-0046` Décision 7).
- **Web Push et l'accès distant** — écartés avec motif (`adr-0046` alternative d), à rouvrir
  ensemble le jour où l'un des deux existe.
- `worker-media`, qui est un autre service, avec un autre runtime, sur un autre réseau.
