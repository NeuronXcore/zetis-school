# ZETIS — Projet éducatif IA pour Massimo

Date de génération : 2026-06-29

ZETIS est une application éducative personnelle, locale-first, pensée pour accompagner Massimo dans son année de 4e et combler progressivement les lacunes accumulées en 5e. Le projet réunit un frontend enfant, un frontend papa, un backend IA, une mémoire pédagogique, un moteur de quiz, des cartes mentales, un mode ELI5, un pipeline RAG et des capsules IA pédagogiques.

L’objectif n’est pas de créer un simple chatbot scolaire. ZETIS doit devenir un compagnon d’apprentissage structuré : il observe, explique, questionne, reformule, diagnostique, mémorise les lacunes, propose des missions, mesure la progression et aide Papa à piloter l’année scolaire sans micro-manager chaque séance.

## Vision courte

ZETIS doit permettre à Massimo de :

- comprendre un cours avec des explications simples ;
- s’entraîner par quiz, missions et cartes mentales ;
- expliquer à son tour ce qu’il a compris ;
- progresser avec un système d’XP et de niveaux ;
- combler ses lacunes de 5e tout en suivant la 4e ;
- utiliser le vocal, l’écrit et les mindmaps ;
- retrouver ses capsules IA et ses fiches de révision.

ZETIS doit permettre à Papa de :

- voir l’état réel des apprentissages ;
- identifier les lacunes prioritaires ;
- suivre les matières, les devoirs, les missions et les progrès ;
- générer ou valider des cours, quiz et capsules ;
- paramétrer l’année scolaire ;
- lancer des diagnostics avant la rentrée et plusieurs fois dans l’année ;
- ajuster le rythme selon la fatigue, les résultats et les périodes scolaires.

## Architecture fonctionnelle

Le projet est organisé autour de quatre blocs :

1. **Frontend Massimo** : interface enfant, gaming, rassurante, orientée action.
2. **Frontend Papa** : interface de pilotage, diagnostic, progression et configuration.
3. **Backend ZETIS** : API, base de données, moteur de progression, sécurité, tâches IA.
4. **Moteur IA** : RAG, agents pédagogiques, génération de quiz, ELI5, capsules, mémoire espacée.

## Stack retenue

Stack recommandée pour le MVP local :

- **Frontend** : React + Vite + TypeScript + Tailwind CSS + shadcn/ui.
- **Backend** : FastAPI + Python.
- **Base relationnelle** : PostgreSQL.
- **Vecteurs / RAG** : pgvector pour commencer.
- **Cache / tâches** : Redis + RQ ou Celery.
- **Fichiers** : MinIO en local.
- **IA cloud** : OpenAI ou Anthropic selon coût/qualité.
- **IA locale optionnelle** : Ollama / llama.cpp pour certaines tâches non critiques.
- **Conteneurs** : Docker Compose.
- **Dev agent** : Claude Code, guidé par `CLAUDE.md` et les prompts du dossier `prompts/`.

## Principe important : sans Obsidian obligatoire

Obsidian peut rester utile pour Papa en tant qu’outil de réflexion ou de notes, mais ZETIS ne doit pas dépendre d’Obsidian. Les données pédagogiques doivent être stockées dans PostgreSQL, les fichiers dans MinIO, les embeddings dans pgvector et les exports Markdown doivent rester optionnels.

## Séparation Massimo / Papa

Il faut séparer les deux frontends au niveau UX, routes et permissions :

- Massimo voit : apprendre, s’entraîner, expliquer, progresser.
- Papa voit : piloter, configurer, diagnostiquer, analyser, valider.

Cette séparation évite de mélanger les responsabilités. Massimo ne doit pas voir les tableaux d’administration ni les diagnostics anxiogènes. Papa ne doit pas devoir naviguer dans une interface enfant pour piloter le système.

## Structure principale du dépôt

```txt
zetis/
├── README.md
├── CLAUDE.md
├── ARCHITECTURE.md
├── TECH_STACK.md
├── ROADMAP.md
├── BACKLOG.md
├── PRODUCT_SPEC.md
├── DATA_MODEL.md
├── API_SPEC.md
├── SECURITY.md
├── DEPLOYMENT.md
├── PROJECT_STRUCTURE.md
├── apps/
│   ├── frontend-massimo/
│   ├── frontend-papa/
│   ├── backend/
│   ├── worker-ai/
│   └── worker-media/
├── packages/
│   ├── auth/        # logique auth + client API partagée (@zetis/auth)
│   ├── ui/
│   ├── types/
│   └── prompts/
├── docs/
├── prompts/
├── infra/
├── scripts/
└── tests/
```

## Ordre de lecture recommandé

1. `README.md`
2. `CLAUDE.md`
3. `PRODUCT_SPEC.md`
4. `ARCHITECTURE.md`
5. `PROJECT_STRUCTURE.md`
6. `TECH_STACK.md`
7. `DATA_MODEL.md`
8. `API_SPEC.md`
9. `ROADMAP.md`
10. `docs/frontend-massimo/README.md`
11. `docs/frontend-papa/README.md`
12. `docs/ai/README.md`
13. `prompts/claude-code/README.md`

## Règle de développement

Claude Code doit lire `CLAUDE.md` avant toute modification. Ensuite, il doit lire le fichier `.md` correspondant à la zone qu’il modifie. Exemple : avant de coder la page ELI5 de Massimo, lire :

- `CLAUDE.md`
- `ARCHITECTURE.md`
- `docs/frontend-massimo/README.md`
- `docs/frontend-massimo/page-eli5.md`
- `docs/ai/eli5-engine.md`
- `docs/design/design-system.md`

## MVP cible

Le MVP ne doit pas tout faire. Il doit livrer un parcours complet minimal :

1. Massimo se connecte.
2. Il arrive sur son dashboard.
3. Il lance un diagnostic court.
4. ZETIS identifie quelques lacunes.
5. Il reçoit une mission.
6. Il lit ou écoute une explication ELI5.
7. Il fait un quiz.
8. Il gagne de l’XP.
9. Papa voit le résultat dans son dashboard.
10. ZETIS planifie la révision espacée.

## Démarrer en local (MVP)

Prérequis : Docker, Node.js LTS + `pnpm`, `uv` (Python 3.12 pour le backend), `ollama` avec le modèle `qwen2.5`.

```bash
# 1. infra (base de données)
docker compose up -d postgres

# 2. backend (API :8000)
cd apps/backend
uv venv --python 3.12 .venv
uv pip install --python .venv -e ".[dev]"
.venv/bin/alembic upgrade head
.venv/bin/python -m app.db.seed
.venv/bin/uvicorn app.main:app --reload

# 3. frontends (depuis la racine, dans deux terminaux)
pnpm install
pnpm --filter @zetis/frontend-massimo dev   # http://localhost:5173
pnpm --filter @zetis/frontend-papa dev      # http://localhost:5174
```

Identifiants de développement : `massimo` / `massimo1234`, `papa` / `papa1234`.

## Statut du document

**MVP livré — étapes 1 → 10** (cf. `SUIVI_DEVELOPPEMENT_ZETIS.md`) : deux frontends séparés, backend FastAPI, PostgreSQL + migrations, auth, et une première boucle pédagogique ELI5 + mémoire espacée. Les sections « vision » et « stack » ci-dessus restent la **cible produit** ; RAG (ingestion), capsules vidéo, jobs IA asynchrones et accès distant sont **post-MVP**.
