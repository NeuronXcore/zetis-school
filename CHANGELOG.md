# CHANGELOG.md — Historique ZETIS

## 0.12.0 — `zetis-clip` Lot 2 : transcription vidéo → RAG (Papa) — étape 20

Date : 2026-07-01

> Note de versionnage : le prompt étape 20 visait « 0.11.0 », déjà pris par le Lot 1 ; on
> publie donc le Lot 2 en `0.12.0` (minor additif). Cf. ADR-0006 addendum.

### Ajouté

- **Backend `POST /api/rag/clip-url`** : importe la **transcription** d'une vidéo →
  `ingest_document(validation_status="pending", source_type="video_transcript")` (pipeline
  étape 12 réutilisé). Fetch sortant **borné à une allowlist** (`youtube.com`,
  `www.youtube.com`, `youtu.be`), URL validée avant tout appel réseau. Langue d'origine
  conservée (transcription humaine préférée à l'auto-générée, jamais de traduction).
  `400` structuré `{code, message}` : `unsupported_url` / `transcript_unavailable`.
- **`app/modules/rag/transcript.py`** : `validate_video_url`, abstraction `TranscriptFetcher`
  (mockable — `FakeTranscriptFetcher` en tests offline), impl réelle `YouTubeTranscriptFetcher`
  (import paresseux de `youtube-transcript-api`). Dépendance backend ajoutée.
- **Extension (Lot 2)** :
  - Popup : détection d'onglet vidéo (allowlist locale) → « Vidéo détectée — importer la
    transcription », matière/chapitre/niveau, titre éditable (nettoyé), envoi + feedback
    « Importé en attente ». Cas « transcription indisponible » géré (message + repli).
  - Orchestration **hybride** : `POST /clip-url` (serveur) d'abord ; si `transcript_unavailable`,
    **repli DOM** — le content script scrape le panneau « Transcription » de l'onglet actif
    (`activeTab`, action utilisateur) puis `POST /clip`.
  - Menu contextuel « Importer la transcription de cette vidéo » (restreint aux pages YouTube).
  - `api.ts` : `postClipUrl` + `ApiError.code` (detail structuré) pour piloter le repli.
- Tests backend : `clip-url` → `pending` (récupérateur mocké), `400 unsupported_url` (hôte hors
  allowlist), `400 transcript_unavailable`, + unit `validate_video_url`.

### Décisions

- ADR-0006 **addendum étape 20** : exception SSRF bornée (fetch serveur limité aux hôtes vidéo
  allowlistés, URL validée avant appel), architecture hybride serveur→repli client, ingestion
  `pending`, dépendance `youtube-transcript-api`.
- Aucune nouvelle `host_permissions` large (repli via `activeTab`) ; token toujours dans
  `chrome.storage.local` ; contrats `/rag/documents` et `/rag/clip` inchangés.
- Reporté (étapes 21+) : OCR image, audio/podcast, file d'attente offline, multi-onglets,
  autres plateformes vidéo.

## 0.11.0 — Extension navigateur `zetis-clip` : capture de sources RAG (Papa) — étape 19 (Lot 1)

Date : 2026-07-01

> Note de versionnage : la version `0.10.0` / le libellé « étape 19 » étant déjà pris par la
> refonte Matières, cette livraison (décrite dans le prompt comme « étape 19 — zetis-clip »)
> est publiée en `0.11.0`. Cf. ADR-0006.

### Ajouté

- **Nouvelle app `apps/extension-zetis-clip`** (Manifest V3, Vite + `@crxjs/vite-plugin`, TS strict, Tailwind v4) — outil **Papa** de capture de sources vers le RAG. Réutilise `@zetis/ui` et la logique d'auth de `@zetis/auth`. Tout arrive en statut **`pending`** (relecture obligatoire dans « Sources de cours »).
  - **Popup** : type détecté (page / sélection / PDF), aperçu éditable du texte, titre, sélecteur de matière (`GET /subjects`), chapitre en texte libre autocomplété, niveau optionnel, envoi + feedback « Importé en attente ».
  - **Content script** : extraction `@mozilla/readability` (anti-SSRF : pas de fetch backend d'URL arbitraire), capture de la sélection, détection PDF.
  - **Service worker** : menus contextuels « Envoyer la sélection / la page à ZETIS », client API, `POST /api/rag/clip` (texte) ou `POST /api/rag/upload` (PDF), feedback par badge.
  - **Page Options** : URL backend (+ permission d'hôte à la volée) et connexion Papa.
  - Token JWT dans `chrome.storage.local` (jamais `localStorage`).
- **Backend `POST /api/rag/clip`** : endpoint mince qui réutilise `ingest_document(validation_status="pending")` (pipeline étape 12, inchangé). `400` si texte vide. Provenance (`source_url`) conservée dans le contenu — aucune migration. Tests : `test_clip_lands_pending_and_keeps_provenance`, `test_clip_rejects_empty_text`.

### Décisions

- ADR-0006 (Accepté) : nouvelle app + dépendances `@crxjs/vite-plugin` et `@mozilla/readability`, capture côté Papa, ingestion `pending`, extraction client (anti-SSRF), token en `chrome.storage.local`.
- Aucune auto-validation : le contrat de `POST /api/rag/documents` (= `validated`) n'est pas modifié. Pas de nouvelle table, pas de worker, pas de modification du CORS backend.
- Reporté (étape 20+) : transcript vidéo, OCR image, audio, file d'attente offline, import multi-onglets.

## 0.10.0 — Refonte page Matières + header global animé Massimo (étape 19)

Date : 2026-06-30

### Ajouté

- **Page Matières refondue** dans le style du login (glassmorphique / néon) : bandeau « Progression globale » (niveau, XP, barre vers le niveau suivant, lien Progression), carte « Capsule IA dispo », grille des 8 matières, bande « Cette semaine » (série, objectifs, meilleure matière). Logique sortie du composant dans le hook **`useMatieres`** (gamification live + mock typé avec repli pour `subjects` / objectifs de semaine / capsule recommandée).
- **Header global animé** (`MassimoBannerHeader`, monté dans `MassimoLayout`) sur **toutes** les pages : emblème ZETIS (cercle + livre) cadré depuis la bannière, **cubes neuronaux** montant du livre (`NeuralCubes`), **réseau de connexions** cercle → bords avec impulsions (`NeuralLinks`), halo pulsant, et avatar Massimo + niveau·XP **live** (gamification, repli `PROFILE`) + Déconnexion. Remplace l'ancienne barre du haut (corrige l'incohérence mock vs live).
- **Primitives & assets** : `glass.tsx` (surfaces/halos/dégradés extraits du `LoginScreen`), `SubjectTile` (carte matière, **cadre teinté par la couleur de la matière**), `lib/subjectIcons.ts` (icônes PNG via `import.meta.glob`), `headerFx.css`, icônes matières `src/assets/subjects/`, `public/zetis-banner.png`.

### Décisions

- Réutilisation stricte des tokens/classes du `LoginScreen` (verre, halos indigo/cyan/fuchsia, dégradés, `LogoZetis`, avatar) — pas de CSS dupliqué hors `headerFx.css` (effets dédiés).
- Animations en CSS + SVG/SMIL, responsive (ResizeObserver pour le réseau neuronal), **`prefers-reduced-motion` respecté**.
- Liens câblés vers les **routes existantes uniquement** (`/progression`, `/subjects/:slug`, `/capsules`) ; pas de route lecture-capsule → repli propre vers `/capsules`. Aucune route ni fuite vers l'interface Papa.
- Endpoints `/subjects`, objectifs de la semaine et capsule recommandée encore **mockés** (repli typé isolé dans `useMatieres`, `TODO(api)`), à brancher ensuite. Aucune donnée pédagogique durable stockée côté front.

### Retiré

- `SubjectCard` (remplacé par `SubjectTile`) et les composants d'itération visuelle `BannerWave` / `HeaderOscilloscope` / `KnowledgeSparks` (remplacés par `NeuralCubes` + `NeuralLinks`).

## 0.9.0 — Page de login / démarrage ZETIS unifiée (étape 18)

Date : 2026-06-30

### Ajouté

- **`LoginScreen` partagé** (`@zetis/auth`) : page d'accueil + connexion soignée — panneau de marque (animation de marque ZETIS jouée à l'arrivée, fondu final vers le logo) + carte glassmorphique (identifiant, mot de passe avec œil, « se souvenir de moi », bouton dégradé, séparateur « ou », bouton Apple *bientôt*, lien d'aide) + avatars Massimo/Papa dans le sélecteur de profil.
- **Sélecteur de profil Massimo / Papa** avec **redirection croisée** : le profil de l'app active se connecte sur place, l'autre profil renvoie vers son frontend (`VITE_PAPA_URL` / `VITE_MASSIMO_URL`, défauts `localhost:5174` / `5173`). L'auth reste par app (chaque app n'accepte que son rôle).
- **Composant `LogoZetis`** (wordmark néon Syncopate) + setup Vitest/Testing Library. Les `LoginPage` des deux apps se réduisent à `<LoginScreen role=… otherAppUrl=… />` ; `@source packages/auth` ajouté aux thèmes Tailwind.

### Décisions

- Design unifié (même look dans les deux apps), réutilisant la palette par défaut Tailwind (indigo/cyan/fuchsia) indépendamment du thème d'app.
- Reportés : « Mot de passe oublié » réel, Sign in with Apple, mutualisation de `LogoZetis` dans `packages/ui`.

## 0.8.0 — Design system partagé `@zetis/ui` (étape 17)

Date : 2026-06-30

### Ajouté

- **Package `@zetis/ui`** : design system partagé (shadcn-style) — `Button`, `Card`, `Badge`, `Spinner`, `EmptyState` + util `cn` (clsx + tailwind-merge, `class-variance-authority`). Consommé en source TS comme `@zetis/auth`.
- **Théming par tokens sémantiques** : `primary`, `card`, `border`, `muted`, `foreground`… définis dans le `@theme` de chaque app et mappés sur sa palette (Massimo indigo `#6366f1` / Papa émeraude `#10b981`). `@source` ajouté pour que Tailwind v4 scanne `packages/ui`.
- **Première adoption** : `MissionsPage` (Massimo + Papa) refondues sur les primitives.
- **Feuille de route frontend** : `FRONTEND_ROADMAP.md` (état des pages, lots priorisés, quick wins).

### Décisions

- Base **shadcn/ui** (cva + Tailwind, tokens CSS) plutôt que primitives ad hoc ; **un seul composant, deux thèmes** via tokens sémantiques par app.
- Vérifié au runtime : `bg-primary` rend la bonne couleur dans chaque app.
- Reportés : généraliser aux pages live (Lot B), composants Radix (Dialog/Select), dark/light, mobile Massimo.

## 0.7.0 — Gamification : XP, niveaux, streak, badges (étape 16)

Date : 2026-06-30

### Ajouté

- **Module gamification** (`app/modules/gamification`) : `GET /api/gamification/summary` → total XP, **niveau** (100 XP/niveau), barre vers le niveau suivant, **streak** (jours consécutifs, tolérance d'un jour), **badges** déterministes, activité récente. Aucune migration (lit/écrit `xp_events`).
- **Crédit d'XP** via helper partagé `award_xp` : mission terminée (+20, déjà en place), **verbalisation ELI5 reverse** (+10), **diagnostic passé** (+15).
- **Frontend Massimo** : `ProgressionPage` branchée (niveau, barre XP, streak, badges, activité récente) ; section « par matière » laissée indicative.

### Décisions

- Gamification au service de l'apprentissage (CLAUDE.md) : pas de loot box, pas de classement social, streak raisonnable.
- Reportés : vue Papa de la régularité/XP, niveaux nommés, XP par matière, garde-fou anti-spam d'XP.

## 0.6.0 — Remédiation : lacunes → missions (étape 15)

Date : 2026-06-30

### Ajouté

- **Moteur de remédiation** (`app/modules/missions`) : `generate-remediation` transforme chaque **lacune ouverte** (`gaps`) du diagnostic en **mission de remédiation** (3 étapes : expliquer → réexpliquer → quiz, priorité ∝ sévérité). Idempotent. Aucune migration (réutilise `missions`/`mission_steps`/`gaps`/`xp_events`).
- **Complétion** : `POST /api/missions/{id}/complete` → mission `completed`, étapes `done`, **lacune liée résolue**, **XP crédité** (`xp_events`).
- **Endpoints** : `POST /api/missions/generate-remediation` (Papa), `GET /api/missions`, `GET /api/missions/today` (Massimo), `POST /api/missions/{id}/complete`.
- **Frontend Papa** : `MissionsPage` branchée — bouton « Générer la remédiation », liste statut/priorité/étapes.
- **Frontend Massimo** : `MissionsPage` (remplace le placeholder) — missions du jour + « J'ai terminé » (message + XP).

### Décisions

- Étapes de mission **déterministes** (template pédagogique), pas d'appel IA — robustes et testables.
- Vocabulaire bienveillant (CLAUDE.md) : « renforcer », « consolidation », jamais d'échec.
- Reportés : étapes reliées à ELI5/quiz réels, niveaux/streak XP, missions manuelles Papa.

## 0.5.0 — Diagnostic complet (étape 14, Phase 4)

Date : 2026-06-30

### Ajouté

- **Moteur de diagnostic** (`app/modules/diagnostics`) : QCM générés par IA par notion (prompt versionné `app/prompts/diagnostic.py`, via `LLMProvider`, trace `ai_jobs`), correction automatique, **score par notion**, upsert `skill_mastery` et ouverture de **lacunes** (`gaps`) pour les notions < 70 %. Aucune migration (réutilise `quizzes`/`quiz_questions`/`quiz_attempts`/`quiz_answers`).
- **Endpoints** : `GET /api/diagnostics/subjects`, `POST /api/diagnostics/generate` (Papa), `GET /api/diagnostics/quizzes`, `GET /api/diagnostics/quizzes/{id}`, `POST /api/diagnostics/quizzes/{id}/submit` (Massimo), `GET /api/diagnostics/results` (Papa).
- **Frontend Massimo** : `DiagnosticPage` branchée (liste → QCM → forces + prochaines étapes, ton bienveillant). Les bonnes réponses ne sont jamais exposées à l'enfant.
- **Frontend Papa** : `DiagnosticsPapaPage` — lancer un diagnostic par matière, suivre le score par notion (barres) et les lacunes.

### Décisions

- Questions **générées par IA** (pas de banque figée) ; le `FakeLLMProvider` renvoie aussi des QCM pour des tests offline déterministes.
- Vocabulaire bienveillant (CLAUDE.md) : « notion à renforcer », jamais d'échec.
- Reportés : génération de missions de remédiation depuis les lacunes, diagnostic multi-matières en une session, difficulté adaptative.

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
