# Ports — qui écoute quoi sur la machine

Source unique des ports de ZETIS. Elle remplace la table « Ports recommandés en développement »
de `DEPLOYMENT.md`, qui donnait 8000/5173/5174 comme ports **de dev** alors que c'est la **prod**
qui les tient en permanence, et qui ignorait les six paires de `.claude/launch.json`.

> **Pour lire l'état réel de la machine plutôt que cette page** : `pnpm ports`. Le script dérive
> ses libellés de `launch.json` et des deux compose — il ne peut pas mentir sur les noms, là où
> cette page, écrite à la main, le peut. C'est pourquoi un verrou la garde
> (`apps/backend/app/tests/test_carte_des_ports.py`).

## Prod — en service en permanence

Les **ports canoniques**, ceux dont Massimo garde l'adresse. Les huit conteneurs portent
`restart: unless-stopped` : la pile se relève seule après un arrêt, aux deux conditions hôte
décrites dans `infra/docker/README.md`.

| Port | Service | Adresse |
|---:|---|---|
| **5173** | `frontend-massimo` | <http://localhost:5173> |
| **5174** | `frontend-papa` | <http://localhost:5174> |
| **8000** | `backend` | <http://localhost:8000> |

⚠️ **`8000` répond `404` sur `/`** : l'API n'a pas de route racine. Ce n'est pas une panne — la
sonde de santé du conteneur est ailleurs.

**Postgres et Redis ne publient rien** : ils sont sur le seul réseau `interne`. La base de Massimo
n'est joignable que depuis les conteneurs — c'est ce qui rend la cohabitation avec le dev possible
(et ce qui oblige à passer par le réseau du compose pour toute opération d'administration, cf.
`scripts/README.md`).

🔴 **`9002` et `9003` (console MinIO) sont DÉCLARÉS mais INERTES.** `minio` n'étant que sur
`interne`, Docker n'attache **aucune liaison hôte** — mesuré le 2026-08-18, `docker port` rend
« aucune liaison ». **La console d'admin n'est pas joignable depuis le Mac**, et on ne le corrige
pas en ajoutant `externe` : ça donnerait un egress au magasin de données pour le seul confort
d'une console. Les déclarations restent pour réserver les ports. Le verrou
`test_compose_ports_cohabitent.py` nomme `minio` en exception assumée — sans quoi il effacerait
ce choix en silence.

## Dev — à la demande

### La voie canonique : `pnpm dev`

Elle vise les **mêmes ports que la prod** (8000 / 5173 / 5174) et **refuse donc de démarrer tant
que la prod tourne**. Ce n'est pas un défaut à réparer : c'est le garde-fou qui empêche deux piles
de se disputer l'adresse de Massimo. Sur une machine qui héberge la prod, on passe par une paire.

### Les paires de `.claude/launch.json`

Chaque frontend est câblé sur **son** backend : `VITE_API_URL` est figé à la ligne, et le backend
n'accepte que **ses** origines en CORS. Mélanger deux paires ne marche pas.

| Paire | Backend | Frontends |
|---|---:|---|
| principale | **8001** `backend-dev` | **5175** `papa-dev` · **5176** `massimo-dev` |
| seconde | **8002** `backend-dev2` | **5177** `massimo-dev2` · **5178** `papa-dev2` |
| galaxy | **8003** `backend-galaxy` | **5179** `massimo-galaxy` |
| LAN | **8004** `backend-lan` | **5180** `massimo-lan` |
| restauration | **8005** `backend-restauration` | **5181** `papa-restauration` |

⚠️ **Un port par entrée, et `--strictPort` partout** : une entrée dont le port est déjà pris
**échoue** au lieu de glisser sur le port voisin. Le verrou `test_carte_des_ports.py` exige que
toute entrée en double soit avertie ici — au 2026-08-21 il n'y en a aucune.

⚠️ **La paire LAN est la seule joignable depuis un vrai iPhone.** Toutes les autres lient
`127.0.0.1` : le téléphone ne les atteint pas, quelle que soit l'URL tapée. Quatre choses doivent
changer ensemble (`--host 0.0.0.0` des deux côtés, `VITE_API_URL` sur l'IP du Mac, origine LAN
dans le CORS) et l'IP se résout au lancement — elle bouge au gré du DHCP. Piège nommé dans
`launch.json` : **`en0` est le Wi-Fi**, et le Mac a aussi une route par défaut sur `en10`
(filaire) — c'est cette adresse-là qu'on relève par réflexe, et le téléphone ne la joint pas.

⚠️ **La paire `restauration` porte un mensonge d'essai assumé** (`SUPERVISED=true` alors que rien
ne supervise ce worker) et une cible de sauvegarde séparée. Elle sert à jouer le geste de
restauration en dev, pas à développer.

### L'infra de dev — `docker-compose.yml`

Conteneurs distincts de ceux de la prod (`name: zetis-prod` cloisonne les volumes) : lancer le dev
ne touche jamais la base de Massimo.

| Port | Service |
|---:|---|
| **5432** | `postgres` |
| **6379** | `redis` |
| **9000** | `minio` |
| **9001** | `minio` — console |

Ici la console MinIO répond vraiment, contrairement à celle de la prod.

> **Aucun port hôte n'est commun aux deux piles**, et aucune variable d'environnement de port non
> plus — les deux compose lisant le même `.env` de la racine, des défauts distincts ne suffiraient
> pas. Les deux propriétés sont tenues par `test_compose_ports_cohabitent.py`.

## Commandes

```bash
pnpm ports                    # l'état réel : démon, conteneurs, ports nommés, HTTP, journal du boot
```

```bash
lsof -i :5175                 # qui tient un port qui devrait être libre
```

```bash
docker ps --filter name=zetis-prod --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

```bash
pnpm prod:logs                # suivre la prod ; prod:down pour arrêter, prod:up pour rebâtir
```

```bash
pnpm dev                      # voie canonique — refuse si la prod tient 8000/5173/5174
```

```bash
pnpm infra:up                 # l'infra de dev seule (postgres, redis, minio)
```

Les paires ne se lancent pas au terminal : ce sont des entrées de `.claude/launch.json`, démarrées
depuis Claude Code.

## Ce qui n'est pas dans ce dépôt

Le démarrage de la pile au boot du Mac dépend de **deux conditions hôte** non versionnables
(Docker Desktop lancé à l'ouverture de session, disque externe monté avant le démon). Elles sont
décrites dans `infra/docker/README.md`, et le piège qui les a fait échouer le 2026-08-21 — une
case cochée que macOS neutralise — dans `TROUBLESHOOTING.md`. `pnpm ports` en rend les trois
dernières lignes de journal.
