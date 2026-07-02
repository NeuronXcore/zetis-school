# Backend FastAPI — image PROD-LIKE (le dev quotidien tourne en natif, cf. scripts/dev.sh).
# Build depuis la racine du repo :
#   docker build -f infra/docker/backend.Dockerfile -t zetis-backend .
FROM python:3.11-slim-bookworm

# curl : healthcheck. psycopg[binary] embarque libpq (pas de lib système requise).
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/repo/apps/backend

WORKDIR /repo
# Le backend fournit app.* + alembic + le seed. Installé en editable (comme le dev).
# Extra [tts] = piper-tts : fournit le binaire `piper` + onnxruntime pour la voix des capsules
# (piper-tts embarque la phonémisation, pas besoin d'espeak-ng système). Cf. ADR-0007.
COPY apps/backend /repo/apps/backend
RUN pip install --no-cache-dir -e 'apps/backend[tts]'

# Modèle de voix FR (siwis medium) baké dans l'image (storage/ est git-ignoré + .dockerignore).
# Chemin attendu par défaut : storage/models/piper/fr_FR-siwis-medium.onnx (cf. core/config.py).
ARG PIPER_VOICE_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium
RUN mkdir -p /repo/apps/backend/storage/models/piper \
    && curl -sL -o /repo/apps/backend/storage/models/piper/fr_FR-siwis-medium.onnx \
         "${PIPER_VOICE_BASE}/fr_FR-siwis-medium.onnx" \
    && curl -sL -o /repo/apps/backend/storage/models/piper/fr_FR-siwis-medium.onnx.json \
         "${PIPER_VOICE_BASE}/fr_FR-siwis-medium.onnx.json"

COPY infra/docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

# Alembic lit alembic.ini depuis ce dossier ; le seed est `python -m app.db.seed`.
WORKDIR /repo/apps/backend
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
