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

**Ports miroir du dev** (`8000` / `5173` / `5174`) → lancer **SOIT `pnpm dev` SOIT `pnpm prod:up`**,
jamais les deux en même temps. Les données prod vivent dans des volumes séparés (`zetis-prod_*`).

### Prérequis & limites

- Ollama sur l'hôte avec le modèle pull (`qwen3.6:35b-a3b`) et `nomic-embed-text` (RAG).
- **Voix Piper (TTS)** : `piper-tts` (extra `[tts]`) + le modèle FR `fr_FR-siwis-medium` sont **bakés
  dans l'image backend** → la narration des capsules fonctionne en conteneur (piper-tts embarque la
  phonémisation, pas besoin d'`espeak-ng` système). Modèle téléchargé au build depuis `rhasspy/piper-voices`.
- Le 1er `up` construit les images (long : worker-media télécharge Chromium ~300 Mo). Si un build
  timeoute (`DeadlineExceeded` de BuildKit), pré-puller l'image de base une fois
  (`docker pull python:3.11-slim-bookworm`, `node:20-bookworm-slim`, `nginx:1.27-alpine`) puis relancer.
- macOS : `host.docker.internal` est fourni par Docker Desktop ; sur Linux, `extra_hosts` le mappe.
