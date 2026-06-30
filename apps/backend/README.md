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
| `GET /api/ai/eli5/skills` | notions disponibles (Étape 10) |
| `POST /api/ai/eli5/explain` | explication ELI5 d'une notion (Étape 10) |
| `POST /api/ai/eli5/reverse-evaluate` | évalue la reformulation + écrit la trace (Étape 10) |
| `GET /api/memory/reviews/due` | cartes de révision dues (Étape 10) |
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
`users` = identité (sans mot de passe) ; l'auth utilise encore les identifiants de config —
le lien auth↔DB viendra ensuite.

## Boucle IA (Étape 10)

Première boucle pédagogique, **tout en synchrone** : ELI5 (explain + reverse) → trace + mémoire espacée.

- **Abstraction LLM** (`app/modules/ai/`) : `LLMProvider.generate(LLMRequest) -> LLMResponse` +
  `OllamaProvider` (qwen2.5). `get_provider()` lit `LLM_PROVIDER` (défaut `ollama`). Un seul
  provider, pas de routing ni de fallback. Prompts versionnés dans `app/prompts/` (jamais en dur).
- **Trace `ai_jobs`** : une ligne écrite à CHAQUE appel IA (input/output/statut/durée) ;
  consultable via `GET /api/ai/jobs/{id}`.
- **Moteur ELI5** (`app/modules/eli5/`) : `explain(context=None)` (couture RAG prête) renvoie
  `{job_id, status}` (contrat API_SPEC) ; l'explication normalisée est dans `ai_jobs.output_json`,
  lue via `GET /api/ai/jobs/{job_id}`. Le `reverse-evaluate` renvoie `{score, feedback, missing_points,
  next_action}`, écrit `LearningEvent`, upsert `SkillMastery`, crée 1 `SpacedReviewCard`.
  Feedback strictement bienveillant (garde-fou).
- **Mémoire espacée** (`app/modules/memory/`) : intervalles FIXES selon le score —
  `<50 → 1 j`, `<75 → 3 j`, sinon `7 j` (pas de SM-2).

```bash
# ollama doit tourner avec le modèle configuré
ollama list | grep qwen2.5
# exemple (avec un token via /api/auth/login) :
curl -X POST localhost:8000/api/ai/eli5/explain \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"skill_id":1,"question":"je ne comprends pas les nombres relatifs"}'
```

RAG (pgvector activé, mais tables/ingestion à faire), jobs IA asynchrones et lien auth↔DB
restent hors périmètre (étapes ultérieures).

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
