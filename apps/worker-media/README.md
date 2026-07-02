# worker-media

Rendu MP4 **sandboxé et asynchrone** des capsules IA (ADR-0007 §7). Process séparé du
backend : consomme la file RQ `media` (Redis), rend la composition Remotion `CapsuleVideo`
en MP4 (Chromium headless via un sous-processus Node), embarque les pistes voix Piper, puis
pousse le MP4 dans le stockage objet (MinIO en cible, disque en fallback dev).

## Prérequis

- **Node** installé (le worker lance `node apps/frontend-papa/src/remotion/render.mjs`).
- Dépendances Remotion installées : `pnpm --filter @zetis/frontend-papa install`.
- **Chromium** headless : téléchargé/mis en cache par Remotion au premier rendu
  (`ensureBrowser`). En conteneur sandbox (sans réseau), le pré-bake au build.
- ffmpeg : fourni par `@remotion/renderer` (pas d'install système requise).
- Redis (file) et, si `STORAGE_BACKEND=minio`, MinIO — cf. `docker-compose.yml`.

## Lancer en dev (local, macOS)

Le worker réutilise le package backend (`app.*`). Dans le venv du backend (qui fournit
rq/redis/minio) :

```bash
# depuis la racine du repo
cd apps/backend && pip install -e .            # (une fois) rq/redis/minio + deps
cd ../..

# audio partagé : mêmes chemins que le backend (l'audio reste sur disque au Lot 2)
export AUDIO_STORAGE_DIR="$PWD/apps/backend/storage/generated"
export REDIS_URL="redis://localhost:6379/0"

# ⚠️ STORAGE_BACKEND doit être IDENTIQUE côté backend ET worker, sinon le backend cherche le
# MP4 au mauvais endroit et `GET /api/capsules/{id}/video` renvoie 404 (vidéo injouable).
# En dev local, le plus simple = 'disk' (défaut du backend) : pas de bucket à gérer.
export STORAGE_BACKEND="disk"                   # 'minio' seulement si le backend l'utilise aussi

PYTHONPATH="apps/backend:apps/worker-media" \
  apps/backend/.venv/bin/python -m worker_media.worker
```

Le backend enfile un rendu via `POST /api/capsules/{id}/render` (Papa, capsule **validée**
avec voix synthétisée). Le worker rend, upload et passe la capsule en `published`.

## Tests

```bash
cd apps/worker-media && python -m pytest
```
