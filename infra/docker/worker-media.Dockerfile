# worker-media — rendu MP4 sandboxé des capsules (ADR-0007 §7).
#
# Cible PROD (le dev tourne en local, cf. apps/worker-media/README.md). Image Node + Python :
# Node lance le renderer Remotion (Chromium headless), Python porte la file RQ et la DB.
# Chromium est *pré-baké* au build (ensureBrowser) pour que le conteneur tourne SANS accès
# internet en prod (réseau compose `internal`). ffmpeg est fourni par @remotion/renderer.
#
# Build depuis la racine du repo :
#   docker build -f infra/docker/worker-media.Dockerfile -t zetis-worker-media .
FROM node:20-bookworm-slim

# Dépendances système de Chrome headless + Python.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-venv python3-pip \
      libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
      libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
      libpango-1.0-0 libcairo2 fonts-liberation ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /repo
COPY . /repo

# Deps Node (workspace) : le renderer vit dans apps/frontend-papa.
RUN pnpm install --frozen-lockfile

# Deps Python : backend (fournit app.* + rq/redis/minio) puis worker-media.
RUN python3 -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -e apps/backend -e apps/worker-media

# Pré-bake du Chromium Remotion (aucun téléchargement au runtime → réseau interne only).
RUN node -e "require('@remotion/renderer').ensureBrowser()" \
    || echo "ensureBrowser: à réessayer au premier rendu si le build n'a pas de réseau"

ENV PATH="/venv/bin:$PATH" \
    PYTHONPATH="/repo/apps/backend:/repo/apps/worker-media" \
    STORAGE_BACKEND=minio

CMD ["python", "-m", "worker_media.worker"]
