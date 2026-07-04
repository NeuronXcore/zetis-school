# worker-ai — génération asynchrone des cartes de révision (SRS), ADR-0013.
#
# Cible PROD (le dev tourne en local, cf. apps/worker-ai/README.md). Image Python PURE
# (contrairement à worker-media : pas de Node ni Chromium) : porte la file RQ et appelle le
# backend `run_lesson_card_generation`, qui interroge Ollama en HTTP. Doit donc pouvoir
# joindre Ollama (pas de réseau `internal` sans egress).
#
# Build depuis la racine du repo :
#   docker build -f infra/docker/worker-ai.Dockerfile -t zetis-worker-ai .
FROM python:3.12-slim-bookworm

WORKDIR /repo
COPY . /repo

# Deps Python : backend (fournit app.* + rq/redis + providers) puis worker-ai.
RUN python -m venv /venv \
    && /venv/bin/pip install --no-cache-dir -e apps/backend -e apps/worker-ai

ENV PATH="/venv/bin:$PATH" \
    PYTHONPATH="/repo/apps/backend:/repo/apps/worker-ai"

CMD ["python", "-m", "worker_ai.worker"]
