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

## Routes

| Route | Réponse |
|---|---|
| `GET /health` | `{"status":"ok","service":"zetis-backend"}` |
| `GET /health/db` | `{"status":"ok","database":"reachable"}` (Étape 9) |
| `GET /api/version` | `{"name":"zetis-backend","version":"0.1.0"}` |
| `POST /api/auth/login` · `GET /api/auth/me` | auth JWT (Étape 6) |
| `GET /docs` | Swagger UI (auto FastAPI) |

## Base de données (Étape 9)

PostgreSQL via Docker Compose, SQLAlchemy 2.0 + Alembic, psycopg3.

```bash
# 1. lancer postgres (depuis la racine du monorepo)
docker compose up -d postgres

# 2. appliquer les migrations
.venv/bin/alembic upgrade head

# 3. seed de développement (idempotent)
.venv/bin/python -m app.db.seed
```

Modèles dans `app/db/models/` (22 tables : users, profils, années, matières, chapitres,
skills, quiz, maîtrise, lacunes, missions, mémoire espacée, capsules, mindmaps…).
RAG/pgvector + jobs IA arrivent à l'Étape 10. `users` = identité (sans mot de passe) ;
l'auth utilise encore les identifiants de config — le lien auth↔DB viendra ensuite.

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
