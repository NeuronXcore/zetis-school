# worker-ai

Génération **asynchrone** des cartes de révision (SRS) — ADR-0013. Process séparé du
backend : consomme la file RQ `ai` (Redis), et pour chaque leçon validée (re)génère les
cartes de ses notions via le LLM **local** (Ollama), ancrées sur le cours canonique. Tout le
travail (appel LLM, upsert préservant la planification) vit côté backend
(`run_lesson_card_generation`) ; le worker ne fait que dépiler la file et l'appeler.

Le backend enfile le job à la validation d'une leçon (`POST /api/lessons/{id}/validate`) et
via l'endpoint manuel `POST /api/lessons/{id}/generate-cards`. Enfilement best-effort : si le
worker/Redis est absent, la validation reste un succès (les cartes seront (re)générées au
prochain déclenchement).

## Prérequis

- **Ollama** en marche avec le modèle de génération configuré (`OLLAMA_*`) — sinon les
  tâches échouent (job RQ marqué `failed`, la validation de leçon reste intacte).
- **Redis** (la file). Cf. `docker-compose.yml`.

## Lancer en dev (local, macOS)

Le worker réutilise le package backend (`app.*`). Dans le venv du backend (qui fournit
rq/redis + les providers) :

```bash
# depuis la racine du repo
cd apps/backend && pip install -e .            # (une fois) rq/redis + deps backend
cd ../..

export REDIS_URL="redis://localhost:6379/0"
export CARDS_QUEUE="ai"                          # doit être identique côté backend

PYTHONPATH="apps/backend:apps/worker-ai" \
  apps/backend/.venv/bin/python -m worker_ai.worker
```

## Tests

```bash
# le wrapper est testé en pur (délégation mockée, sans DB ni LLM)
cd apps/worker-ai && PYTHONPATH="../backend:." ../backend/.venv/bin/python -m pytest
```
