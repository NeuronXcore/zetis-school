# Prompt Claude Code — Bootstrap monorepo

Lis d’abord `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, `TECH_STACK.md` et `PROJECT_STRUCTURE.md`.

Initialise le monorepo ZETIS avec la structure suivante :

- `apps/frontend-massimo` : Vite React TypeScript.
- `apps/frontend-papa` : Vite React TypeScript.
- `apps/backend` : FastAPI Python.
- `apps/worker-ai` : worker Python placeholder.
- `apps/worker-media` : worker Python placeholder.
- `packages/types` : types partagés.
- `packages/ui` : composants partagés placeholder.
- `infra/docker` : fichiers infra.
- `scripts` : scripts utilitaires.

Ajoute :

- `docker-compose.yml` avec postgres, redis, minio.
- `.env.example`.
- healthcheck API `/health`.
- pages placeholder pour les deux frontends.
- README de démarrage.

Contraintes :

- TypeScript strict.
- Pas de Next.js.
- Pas d’Obsidian obligatoire.
- Pas de fonctionnalité IA réelle dans cette étape.

À la fin, donne :

- fichiers créés ;
- commandes à lancer ;
- prochaines étapes.
