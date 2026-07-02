# TECH_STACK.md — Stack technique ZETIS

## Objectif

Définir une stack réaliste pour développer ZETIS localement, rapidement, sans dépendance inutile, mais capable d’évoluer vers un accès distant et des fonctionnalités IA avancées.

## Graphify

Graphify est utilisé comme outil de développement pour Claude Code.

Il sert à cartographier le projet ZETIS et à aider Claude Code à comprendre les relations entre les fichiers, les dossiers, les frontends, le backend, les docs et les prompts.

Graphify n’est pas une dépendance runtime de ZETIS.

Il doit être utilisé à la racine du projet avec :

```bash
/graphify .
```

## Frontend

### Choix retenu

- React
- Vite
- TypeScript
- Tailwind CSS
- shadcn/ui
- React Router
- TanStack Query
- Zustand ou Jotai pour états locaux simples
- React Hook Form + Zod pour formulaires

### Justification

React + Vite est rapide, simple et parfaitement adapté à deux frontends séparés. shadcn/ui permet de construire vite une interface propre sans verrouiller le projet dans une librairie lourde.

### Alternatives non retenues au MVP

- Next.js : puissant, mais inutile si l’API est séparée et si l’app est locale-first.
- Vue/Nuxt : possible, mais React est plus standard avec shadcn/ui.
- Angular : trop lourd pour ce projet.

## Backend

### Choix retenu

- Python
- FastAPI
- Pydantic
- SQLAlchemy ou SQLModel
- Alembic
- Uvicorn

### Justification

FastAPI est adapté aux API typées et aux intégrations IA Python. Il permet d’avoir une documentation OpenAPI automatiquement générée.

## Base de données

### Choix retenu

- PostgreSQL
- pgvector

### Justification

PostgreSQL sert de source de vérité robuste. pgvector permet d’éviter un service vectoriel supplémentaire dans le MVP.

## Cache et jobs

### Choix retenu

- Redis
- RQ ou Celery

### RQ vs Celery

Pour commencer, RQ est plus simple. Celery est plus puissant si les workflows deviennent complexes.

Recommandation MVP : RQ.

## Stockage fichiers

### Choix retenu

- MinIO local

### Fichiers stockés

- PDFs ;
- audios ;
- vidéos ;
- images ;
- exports ;
- mindmaps ;
- documents sources.

## IA

### Providers possibles

- OpenAI pour qualité générale, multimodalité et écosystème.
- Anthropic pour raisonnement, rédaction longue et Claude Code.
- Ollama pour tâches locales simples ou confidentialité accrue.

### Abstraction obligatoire

Créer une interface provider :

```python
class LLMProvider:
    def generate(self, request: LLMRequest) -> LLMResponse:
        ...
```

Ne jamais appeler un provider directement depuis les routes frontend ou les composants React.

## RAG

### Composants

- ingestion documents ;
- extraction texte ;
- chunking ;
- embeddings ;
- stockage pgvector ;
- retrieval ;
- génération avec contexte ;
- traces de sources.

### Outils Python possibles

- PyMuPDF pour PDFs ;
- unstructured optionnel ;
- tiktoken selon provider ;
- sentence-transformers si embeddings locaux ;
- OpenAI embeddings si cloud.

## STT / TTS / audio

### STT

- Web Speech API pour prototype navigateur ;
- Whisper API ou local pour meilleure qualité ;
- enregistrement audio côté frontend + traitement worker si nécessaire.

### TTS

- TTS provider cloud pour voix de qualité ;
- Piper/Coqui optionnel local ;
- stockage audio dans MinIO.

## Vidéo / capsules IA

Moteur retenu (ADR-0007) : **Remotion** (React). La capsule = **spec typé** joué par des
composants Remotion que nous écrivons.

- **Lot 1** : aperçu in-browser (`@remotion/player`), voix **Piper** (TTS par scène).
- **Lot 2** : rendu **MP4** sandboxé dans **worker-media** (RQ + `@remotion/renderer`, Chromium +
  ffmpeg), stockage **MinIO** (repli disque).
- Différé : inserts **Manim**, génération d'images IA, avatar animé ZETIS, sous-titres, quiz
  intégré.

## Authentification

MVP local :

- login simple ;
- JWT court ;
- refresh token ;
- rôles `child`, `parent`, `admin`.

V2 :

- passkeys ;
- 2FA Papa ;
- accès distant sécurisé.

## DevOps

### Docker Compose

Services :

- postgres ;
- redis ;
- minio ;
- api ;
- worker-ai ;
- worker-media ;
- frontend-massimo ;
- frontend-papa.

### CI optionnelle

- lint frontend ;
- typecheck ;
- tests backend ;
- migrations check.

## Tests

### Frontend

- Vitest ;
- Testing Library ;
- Playwright pour parcours clés.

### Backend

- pytest ;
- httpx test client ;
- fixtures DB ;
- tests services IA avec mocks.

## Qualité

- Ruff pour Python.
- Black ou Ruff formatter.
- ESLint pour TypeScript.
- Prettier.
- mypy optionnel.

## Variables d’environnement

Voir `.env.example`.

## Commandes attendues

```bash
# Démarrage infra
docker compose up -d postgres redis minio

# Backend
cd apps/backend
uvicorn app.main:app --reload

# Frontend Massimo
cd apps/frontend-massimo
npm install
npm run dev

# Frontend Papa
cd apps/frontend-papa
npm install
npm run dev
```

## Règle de sobriété

Ne pas ajouter un outil parce qu’il est populaire. Ajouter un outil seulement s’il résout un problème réel du projet.
