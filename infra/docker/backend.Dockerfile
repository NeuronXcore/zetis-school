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
COPY apps/backend /repo/apps/backend
RUN pip install --no-cache-dir -e apps/backend

COPY infra/docker/backend-entrypoint.sh /usr/local/bin/backend-entrypoint.sh
RUN chmod +x /usr/local/bin/backend-entrypoint.sh

# Alembic lit alembic.ini depuis ce dossier ; le seed est `python -m app.db.seed`.
WORKDIR /repo/apps/backend
EXPOSE 8000
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
