# CHANGELOG.md — Historique ZETIS

## 0.4.0 — RAG sémantique + sources Papa (étapes 11 → 12)

Date : 2026-06-30

### Ajouté

- **RAG sémantique pgvector** (Étape 11) : modèles `rag_documents` / `rag_chunks` (`vector(768)`) + index ivfflat cosinus (migration `a1b2c3d4e5f6`) ; `OllamaEmbeddingProvider` (`/api/embed`, `nomic-embed-text`) ; module `rag` (chunking, ingestion vectorisée, recherche cosinus, `retrieve_for_skill`) ; endpoints `POST/GET /api/rag/documents`, `POST /api/rag/search`. ELI5 `explain` injecte le contexte récupéré (renvoie `[]` sans appel embeddings si aucune source → contrat intact).
- **Ingestion de fichiers + validation Papa** (Étape 12) : `POST /api/rag/upload` (MD/TXT/PDF, extraction via **pypdf**) → source en statut **`pending`** ; `POST /api/rag/documents/{id}/validate|reject` (synchronise document + chunks). Page Papa **« Sources de cours »** (upload + liste + Valider/Rejeter). Seuls les chunks `validated`/`official` alimentent l'IA (relecture humaine, cf. CLAUDE.md).
- **RAG visible côté Massimo** (Étape 13) : ELI5 `explain` expose `sources_used` dans `output_json` (= nombre de passages de cours injectés) ; le front Massimo affiche le badge **« 📚 D'après ton cours »** quand l'explication s'appuie sur une source validée.

### Décisions

- Embeddings et LLM restent des **providers abstraits** distincts (ollama en local), trace `ai_jobs` conservée.
- Les sources uploadées par Papa ne sont **jamais** utilisées avant validation manuelle.
- Reportés : réponse RAG sourcée dédiée (`/rag/answer`) + citations/confiance, stockage du fichier brut (MinIO), RAG sur les productions de Massimo, import des programmes officiels.

### Dépendances

- Backend : `python-multipart`, `pypdf`.

## 0.3.0 — MVP fonctionnel (étapes 2 → 10)

Date : 2026-06-30

### Ajouté

- **Frontend Massimo** (Étapes 2, 7) : React 19 + Vite + TypeScript strict + Tailwind v4 ; auth, layout + sidebar, pages Accueil, Matières (+ matière dédiée `/subjects/:slug`), Diagnostic, ELI5 (branchée sur l'IA), Mindmaps, Capsules IA, Progression. Données mockées sauf ELI5.
- **Frontend Papa** (Étapes 3, 8) : cockpit analytique — Dashboard (KPIs/alertes/reco), Progression, Lacunes, Missions, Diagnostics, Conseil de classe IA, Cahier de bord IA, Années scolaires, Matières & programmes, Capsules pilotage, Mode focus, Paramètres.
- **Backend FastAPI** (Étapes 4-6) : `/health`, `/health/db`, `/api/version`, CORS, **auth JWT** (rôles papa/massimo), tests pytest.
- **Connexion front ↔ back** (Étape 5) : statut backend affiché dans les deux apps.
- **Base de données** (Étape 9) : PostgreSQL + **SQLAlchemy 2.0** + Alembic + psycopg3 ; 22 tables (+ `ai_jobs`) ; seed de dev idempotent.
- **Boucle IA / mémoire** (Étape 10) : ELI5 explain + reverse via abstraction **`LLMProvider`** + **`OllamaProvider`** (qwen2.5) ; trace **`ai_jobs`** à chaque appel ; écriture `learning_events` + upsert `skill_mastery` + 1 carte de révision espacée (intervalles fixes 1/3/7) ; extension `pgvector` activée.
- **Package partagé `@zetis/auth`** : logique auth + client API factorisée entre les deux frontends.

### Décisions

- ORM : **SQLAlchemy 2.0** (typé) + Alembic + psycopg3.
- IA : **un seul provider** abstrait (ollama / qwen2.5 en local), prompts versionnés (`apps/backend/app/prompts`), trace `ai_jobs` obligatoire, feedback bienveillant.
- Reportés post-MVP : RAG (ingestion/embeddings), capsules vidéo, jobs IA asynchrones, lien auth ↔ utilisateur en base.

## 0.2.0 — Squelette monorepo + outillage

Date : 2026-06-29

### Ajouté

- Squelette du monorepo (Étape 1) : `apps/{frontend-massimo,frontend-papa,backend,worker-ai,worker-media}`, `packages/{ui,types,prompts}`, `infra/{docker,nginx}`, `storage/`, `scripts/` avec un README par dossier.
- Fichiers de configuration racine : `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json` (TypeScript strict), `docker-compose.yml`, `.env.example`.
- `.gitignore` et `.graphifyignore`.
- Outillage Graphify : skill + hook `PreToolUse`, knowledge graph dans `graphify-out/` (local, non versionné).

### Modifié

- Unification de la convention de nommage du monorepo sur `apps/` (frontends, backend et workers), alignée sur le SUIVI ; correction des docs divergentes (`PROJECT_STRUCTURE`, `ARCHITECTURE`, `README`, `CLAUDE.md`, etc.).

## 0.1.0 — Initialisation documentation

Date : 2026-06-29

### Ajouté

- Documentation racine projet.
- Instructions Claude Code.
- Architecture globale.
- Stack technique.
- Roadmap.
- Backlog.
- Spécification produit.
- Modèle de données.
- API spec.
- Sécurité.
- Déploiement.
- Documentation frontend Massimo.
- Documentation frontend Papa.
- Documentation IA/RAG/mémoire/capsules.
- Prompts Claude Code.

### Décisions

- Projet renommé ZETIS.
- Obsidian non obligatoire.
- Deux frontends séparés : Massimo et Papa.
- Backend FastAPI.
- PostgreSQL + pgvector.
- MinIO pour fichiers.
- Docker Compose pour développement.
