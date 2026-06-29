# apps/backend

API **FastAPI** (Python). Source de vérité du système ZETIS.

État : **Étape 4** — backend minimal avec healthcheck. Pas encore de base de données, ni de modules métier, ni d'IA.

> Le système n'a que Python 3.9. Le projet exige **Python 3.11+** → on utilise **uv** (déjà installé) pour fournir un interpréteur isolé. Un `pyproject.toml` standard permet aussi `pip install -e .` pour quiconque a déjà Python 3.11+.

## Démarrer (uv)

```bash
cd apps/backend
uv venv --python 3.12 .venv          # crée un venv Python 3.12 isolé
uv pip install --python .venv -e ".[dev]"
.venv/bin/uvicorn app.main:app --reload   # http://localhost:8000
```

Alternative pip (si Python 3.11+ déjà présent) :

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

## Routes (Étape 4)

| Route | Réponse |
|---|---|
| `GET /health` | `{"status":"ok","service":"zetis-backend"}` |
| `GET /api/version` | `{"name":"zetis-backend","version":"0.1.0"}` |
| `GET /docs` | Swagger UI (auto FastAPI) |

## Tests

```bash
.venv/bin/pytest
```

## Structure

```
app/
├── main.py          # app FastAPI + CORS (frontends 5173/5174)
├── core/config.py   # configuration (pydantic-settings)
├── api/health.py    # routes /health et /api/version
└── tests/test_health.py
```

DB (PostgreSQL + Alembic), modules métier et IA arrivent aux étapes suivantes.
