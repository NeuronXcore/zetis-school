# infra/docker — lancer ZETIS

Dockerfiles et compose par service. Deux façons de lancer l'app. **Ollama tourne TOUJOURS sur
l'hôte** (GPU Metal, impossible en conteneur sur Mac) : `ollama serve` + `ollama pull qwen3.6:35b-a3b`
(cf. ADR-0008).

## 1. Dev natif (quotidien, recommandé) — `pnpm dev`

Infra en Docker (postgres/redis/minio) ; **backend + frontends en natif** (HMR instantané, reload
rapide, accès direct à Ollama). Lance : infra → migrations+seed → backend `:8000` → Massimo `:5173`
→ Papa `:5174`. `Ctrl+C` arrête proprement. Le rendu vidéo (worker-media) se lance à part si besoin
(cf. `apps/worker-media/README.md`).

Pourquoi pas les frontends/backend en Docker pour le dev : le file-watching Vite est lent/instable à
travers la VM Docker sur macOS, et le backend a besoin de joindre Ollama sur l'hôte.

## 2. Prod-like « tout containerisé » — `pnpm prod:up`

Toute l'app en conteneurs, **une commande** (`docker-compose.prod.yml`) :

```bash
pnpm prod:up      # build + up (postgres, redis, minio, backend, worker, worker-media, 2 fronts nginx)
pnpm prod:logs    # suivre les logs
pnpm prod:down    # tout arrêter
```

- **backend** (`backend.Dockerfile`) : uvicorn + entrypoint (migrations Alembic + seed). Joint Ollama
  via `host.docker.internal:11434`.
- **frontends** (`frontend.Dockerfile`, ARG `APP`) : build Vite → servis en statique par **nginx**.
- **worker** (même image que le backend, `entrypoint` écrasé) : consomme les files RQ
  `production-priority` puis `production` — tout ce qui passe par `travaux.enfiler` (cours, fiche,
  cartes SRS, mindmap, quiz, capsule, curriculum, diagnostic). `restart: unless-stopped`, aucun port.
  🔴 **Jamais de `--scale`** : concurrence 1, un seul Ollama, un seul GPU. Détail : `docs/devops/worker-production.md`.
- **worker-media** (`worker-media.Dockerfile`) : rendu MP4 Remotion (Chromium pré-baké), file RQ `media`.
- Vidéos → **MinIO** ; audio partagé backend↔worker via le volume `capsule_audio`.
- **Réseaux** (ADR-0046) : `interne` (`internal: true`, aucun egress) porte toutes les
  communications entre services ; `externe` n'est joint que par **backend** et **worker**, qui
  appellent Ollama sur l'hôte et l'API Anthropic. `worker-media` est sur `interne` **seul** —
  Chromium ne doit pas pouvoir sortir. Vérifié : un conteneur sur `interne` seul n'atteint pas
  l'hôte.
- **Limites mémoire** : `backend` et `worker` à `1g` (mesuré à vide : 92 et 41 Mio),
  `worker-media` à `2g` (Chromium).

**Ports miroir du dev** (`8000` / `5173` / `5174`) → lancer **SOIT `pnpm dev` SOIT `pnpm prod:up`**,
jamais les deux en même temps. Les données prod vivent dans des volumes séparés (`zetis-prod_*`).

### La prod se relève seule — et les deux conditions hôte

Depuis le 2026-08-17, **les huit services** portent `restart: unless-stopped` — application de
l'ADR-0046 §1 à tout le dispositif, et non au seul `worker` : après un arrêt du Mac, une base et un
backend qui ne reviennent pas laissaient le worker se relever dans le vide. Verrouillé par
`app/tests/test_compose_prod_restart.py`, qui tient la règle pour le **9e service**.

⚠️ La propriété est **inerte sans deux conditions hôte**, et elles ne sont pas dans ce dépôt :

1. 🔴 **Docker Desktop doit démarrer à l'ouverture de session** — *Settings → General → « Start
   Docker Desktop when you sign in »*. Mesuré le 2026-08-17 sur le Mac Studio : `AutoStart = False`.
   Sans le démon, aucune politique de redémarrage ne s'applique : la prod reste éteinte.
2. 🔴 **Le disque externe doit être monté avant le démon.** `Docker.raw` vit sur
   `/Volumes/NX-Projects` (réglage `DataFolder`) et les modèles Ollama sur `/Volumes/NX-Models`.
   Disque absent au boot = Docker ne démarre pas, ou démarre sur un disque vide.

**Vérifier que ça marche** — et surtout pas avec `docker compose kill`, qui rend un **faux négatif**
(un arrêt d'opérateur est exclu par définition du mot *unless* ; mesuré le 2026-08-08). Il faut tuer
le processus depuis l'intérieur :

```bash
docker exec zetis-prod-backend-1 sh -c 'kill -TERM 1'
docker inspect zetis-prod-backend-1 --format '{{.RestartCount}} {{.State.Status}}'   # → 1 running
```

Procédure complète et motif : `docs/devops/worker-production.md`.

### Prérequis & limites

- 🔴 **`POSTGRES_PASSWORD` dans le `.env` de la racine** — obligatoire depuis l'ADR-0046 : le
  compose de prod n'a plus de défaut de développement, et `prod:up` s'arrête sans elle.
  ⚠️ Sur un volume déjà initialisé, il faut **reprendre la valeur d'origine** : Postgres ne fixe
  le mot de passe qu'à la création du volume.
- Ollama sur l'hôte avec le modèle pull (`qwen3.6:35b-a3b`) et `nomic-embed-text` (RAG).
- **Voix Piper (TTS)** : `piper-tts` (extra `[tts]`) + le modèle FR `fr_FR-siwis-medium` sont **bakés
  dans l'image backend** → la narration des capsules fonctionne en conteneur (piper-tts embarque la
  phonémisation, pas besoin d'`espeak-ng` système). Modèle téléchargé au build depuis `rhasspy/piper-voices`.
- Le 1er `up` construit les images (long : worker-media télécharge Chromium ~300 Mo). Si un build
  timeoute (`DeadlineExceeded` de BuildKit), pré-puller l'image de base une fois
  (`docker pull python:3.11-slim-bookworm`, `node:20-bookworm-slim`, `nginx:1.27-alpine`) puis relancer.
- macOS : `host.docker.internal` est fourni par Docker Desktop ; sur Linux, `extra_hosts` le mappe.
