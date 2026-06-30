# PROJECT_STRUCTURE.md — Structure du dépôt ZETIS

---

### 2. `PROJECT_STRUCTURE.md`

Tu mets un texte orienté arborescence :

```md
## Lecture du projet avec Graphify

Claude Code doit utiliser Graphify pour comprendre l’arborescence du projet avant de créer ou modifier des fichiers.

Commande à utiliser à la racine :

```bash
/graphify .
```
## Structure cible

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
├── CONTRIBUTING.md
├── CHANGELOG.md
├── DECISIONS.md
├── GLOSSARY.md
├── .env.example
├── docker-compose.yml
├── apps/
│   ├── frontend-massimo/
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── features/
│   │       ├── hooks/
│   │       ├── routes/
│   │       ├── services/
│   │       └── styles/
│   ├── frontend-papa/
│   │   ├── package.json
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── app/
│   │       ├── components/
│   │       ├── features/
│   │       ├── hooks/
│   │       ├── routes/
│   │       ├── services/
│   │       └── styles/
│   ├── backend/
│   │   ├── pyproject.toml
│   │   ├── alembic.ini
│   │   └── app/
│   │       ├── main.py
│   │       ├── api/
│   │       ├── core/
│   │       ├── db/         # modèles SQLAlchemy + migrations Alembic
│   │       ├── modules/    # auth, ai, eli5, memory
│   │       ├── prompts/    # prompts IA versionnés
│   │       └── tests/
│   ├── worker-ai/
│   └── worker-media/
├── packages/
│   ├── auth/        # @zetis/auth : logique auth + client API partagée
│   ├── ui/
│   ├── types/
│   └── prompts/
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── scripts/
├── docs/
│   ├── frontend-massimo/
│   ├── frontend-papa/
│   ├── ai/
│   ├── backend/
│   ├── school/
│   ├── design/
│   ├── devops/
│   └── decisions/
├── prompts/
│   └── claude-code/
├── scripts/
└── tests/
```

## Racine du projet

### `README.md`

Présentation du projet, objectif, stack, démarrage rapide, ordre de lecture.

### `CLAUDE.md`

Instructions opérationnelles pour Claude Code. C’est le fichier le plus important pour le développement assisté.

### `ARCHITECTURE.md`

Vue globale des services, flux, responsabilités et décisions structurantes.

### `TECH_STACK.md`

Stack technique retenue et justification.

### `ROADMAP.md`

Phases de développement.

### `BACKLOG.md`

Liste des fonctionnalités à construire par priorité.

### `PRODUCT_SPEC.md`

Spécification produit : personas, parcours, modules, critères de succès.

### `DATA_MODEL.md`

Entités principales, relations, règles métier pédagogiques.

### `API_SPEC.md`

Contrats API principaux.

### `SECURITY.md`

Sécurité, rôles, confidentialité, accès distant.

### `DEPLOYMENT.md`

Lancement local, Docker, stratégie VPS éventuelle.

### `CONTRIBUTING.md`

Règles de contribution, style, tests, documentation.

### `CHANGELOG.md`

Historique des changements.

### `DECISIONS.md`

Index des ADR.

### `GLOSSARY.md`

Glossaire commun.

## Dossier `apps/`

Contient toutes les applications déployables : les deux frontends et les services backend.

- `frontend-massimo` : interface enfant (React + Vite).
- `frontend-papa` : interface parent (React + Vite).
- `backend` : API principale FastAPI.
- `worker-ai` : tâches IA.
- `worker-media` : audio/vidéo.

### Pourquoi deux frontends ?

Massimo et Papa n’ont pas les mêmes besoins, pas les mêmes permissions, pas le même langage et pas la même charge cognitive. Deux apps permettent d’éviter une interface hybride confuse.

## Dossier `packages/`

Code partagé.

- `auth` : `@zetis/auth` — logique d'auth + client API partagée entre les deux frontends (créé à la refacto post-Étape 7).
- `ui` : composants communs si nécessaire.
- `types` : types TypeScript générés ou maintenus.
- `prompts` : prompts versionnés (les prompts IA backend vivent dans `apps/backend/app/prompts`).

## Dossier `docs/`

Documentation détaillée. Les fichiers racine donnent la vision et les décisions globales. Les fichiers dans `docs/` détaillent les modules.

## Dossier `prompts/`

Prompts destinés à Claude Code pour coder étape par étape.

## Règle de maintenance

Quand une fonctionnalité change :

1. mettre à jour le code ;
2. mettre à jour le test ;
3. mettre à jour le document module ;
4. mettre à jour l’API spec si nécessaire ;
5. mettre à jour le backlog/roadmap si statut changé.
