# Backend FastAPI — image PROD-LIKE (le dev quotidien tourne en natif, cf. scripts/dev.sh).
# Build depuis la racine du repo :
#   docker build -f infra/docker/backend.Dockerfile -t zetis-backend .
FROM python:3.11-slim-bookworm

# curl : healthcheck. psycopg[binary] embarque libpq (pas de lib système requise).
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# pg_dump / psql / pg_restore : la sauvegarde (ADR-0065) dumpe — et restaurera à blanc (slice 2) —
# depuis CE conteneur. Bookworm ne porte que pg15 : le client vient du dépôt PGDG, majeure
# ÉPINGLÉE sur celle du serveur (`pgvector/pgvector:pg16` de docker-compose.prod.yml) — un
# pg_dump plus vieux que son serveur refuse de servir. Le jour où le serveur passe en pg17,
# cette ligne suit (test-verrou : test_dockerfile_backend_pgclient.py, qui compare les deux).
# Recette VÉRIFIÉE en conteneur d'essai le 2026-08-19 : paquet `postgresql-client-16`,
# version 16.15-1.pgdg12+2 = la 16.15 du serveur mesurée au cadrage.
RUN apt-get update && apt-get install -y --no-install-recommends gnupg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y --auto-remove gnupg \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/repo/apps/backend

WORKDIR /repo
# Le backend fournit app.* + alembic + le seed. Installé en editable (comme le dev).
# Extras :
#   [tts] = piper-tts : binaire `piper` + onnxruntime pour la voix des capsules (embarque la
#           phonémisation, pas besoin d'espeak-ng système). Cf. ADR-0007.
#   [stt] = faster-whisper : dictée du chat / ELI5, 100 % local (ADR-0012). SANS lui, /transcribe
#           répond 503 et Massimo voit « La dictée n'est pas dispo pour l'instant ». C'était le cas
#           en prod jusqu'au 2026-08-18 : l'image n'installait que [tts] — la voix marchait, la
#           dictée non.
COPY apps/backend /repo/apps/backend
RUN pip install --no-cache-dir -e 'apps/backend[tts,stt]'

# Modèle de voix FR (siwis medium) baké dans l'image (storage/ est git-ignoré + .dockerignore).
# Chemin attendu par défaut : storage/models/piper/fr_FR-siwis-medium.onnx (cf. core/config.py).
ARG PIPER_VOICE_BASE=https://huggingface.co/rhasspy/piper-voices/resolve/main/fr/fr_FR/siwis/medium
RUN mkdir -p /repo/apps/backend/storage/models/piper \
    && curl -sL -o /repo/apps/backend/storage/models/piper/fr_FR-siwis-medium.onnx \
         "${PIPER_VOICE_BASE}/fr_FR-siwis-medium.onnx" \
    && curl -sL -o /repo/apps/backend/storage/models/piper/fr_FR-siwis-medium.onnx.json \
         "${PIPER_VOICE_BASE}/fr_FR-siwis-medium.onnx.json"

# Modèle STT (faster-whisper 'small', ADR-0012) baké comme la voix Piper ci-dessus : une dictée
# fiable et hors-ligne, sans téléchargement de ~150 Mo au premier appui-micro de Massimo. HF_HOME
# persistant → le warm-up de build ET le runtime lisent le même cache (storage/ n'est pas monté en
# volume, donc le modèle baké survit à la recréation du conteneur). Doit rester aligné sur le défaut
# WHISPER_MODEL / WHISPER_COMPUTE_TYPE de core/config.py ('small' / int8).
ENV HF_HOME=/repo/apps/backend/storage/models/whisper
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('small', device='cpu', compute_type='int8')"

COPY infra/docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

# Alembic lit alembic.ini depuis ce dossier ; le seed est `python -m app.db.seed`.
WORKDIR /repo/apps/backend
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
