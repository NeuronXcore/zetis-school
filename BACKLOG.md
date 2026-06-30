# BACKLOG.md — Backlog fonctionnel ZETIS

## Priorité P0 — indispensable MVP

### Initialisation projet

- Créer monorepo.
- Créer `apps/frontend-massimo`.
- Créer `apps/frontend-papa`.
- Créer `apps/backend`.
- Créer `docker-compose.yml`.
- Ajouter PostgreSQL.
- Ajouter Redis.
- Ajouter MinIO.
- Ajouter healthchecks.
- Ajouter `.env.example`.

### Frontend Massimo

- Dashboard enfant.
- Sidebar avec : Accueil, Matières, Cours, Diagnostic, ELI5, Capsules IA, Missions, Quiz, Progression, Mindmaps, Chat ZETIS.
- Page matières.
- Page matière dédiée.
- Page cours.
- Page quiz.
- Page progression XP.

### Frontend Papa

- Dashboard parent.
- Vue progression Massimo.
- Vue lacunes.
- Vue matières/programmes.
- Vue diagnostics.
- Cahier de bord IA.
- Paramètres.

### Backend

- Modèles users.
- Modèles school years.
- Modèles subjects.
- Modèles lessons.
- Modèles quizzes.
- Modèles attempts.
- Modèles progress.
- Modèles missions.
- Routes health.
- Routes auth simple.
- Routes subjects.
- Routes lessons.
- Routes quizzes.
- Routes progress.

## Priorité P1 — vraie valeur pédagogique

### Diagnostic

- ✅ Diagnostic initial 5e/4e (QCM générés par IA, par notion).
- ✅ Score par notion (+ upsert maîtrise `skill_mastery`).
- ✅ Priorisation lacunes (`gaps` ouvertes, sévérité medium/high).
- ✅ Génération missions de remédiation depuis les lacunes (étape 15 ; complétion → gap résolue + XP).
- ✅ Réutilisation du diagnostic plusieurs fois dans l’année (re-passation marquée `taken`).
- Diagnostic multi-matières en une session + difficulté adaptative.

### ELI5

- Génération explication simple.
- Questions de compréhension.
- Mode reverse écrit.
- Mode reverse vocal.
- Feedback bienveillant.
- Score compréhension.

### Spaced memory

- Cartes par notion.
- Intervalles de révision.
- Prochaine révision.
- Révision automatique dans missions.

## Priorité P2 — IA avancée

### RAG

- ✅ Import PDF (+ MD/TXT) — `POST /api/rag/upload`.
- ✅ Extraction texte (`modules/rag/extract.py`, pypdf).
- ✅ Chunking.
- ✅ Embeddings (ollama `nomic-embed-text`, 768d).
- ✅ Recherche vectorielle (pgvector cosinus).
- ✅ Validation Papa des sources (`validate`/`reject`, page « Sources de cours »).
- Réponse sourcée dédiée (`/rag/answer` + citations/confiance).
- Stockage du fichier brut (MinIO).
- RAG sur productions de Massimo.

### Capsules IA

- Génération script.
- Storyboard.
- Audio TTS.
- Slides.
- Publication.
- Quiz post-capsule.

### Mindmaps

- Mindmap remplie.
- Mindmap à compléter.
- Reproduction par Massimo.
- Export image/JSON.
- Score de restitution.

## Priorité P3 — polish

- Animations gaming sobres.
- Avatar ZETIS.
- Onde vocale.
- Sons de feedback.
- ✅ Badges (étape 16 : XP, niveaux, streak, badges — affichés côté Massimo).
- Mode focus.
- Version iPhone optimisée.

## Priorité P4 — extension

- Accès distant sécurisé.
- Multi-enfant.
- Multi-parent.
- Exports PDF.
- Notifications.
- App iOS native.
- Mode SaaS éventuel.

## Bugs / risques à surveiller

- Trop de pages avant le cycle pédagogique complet.
- Données mockées qui ne sont jamais reliées au backend.
- IA utilisée sans traces ni sources.
- UI Papa trop complexe.
- UI Massimo trop infantilisante ou trop chargée.
- Gamification addictive.
- Capsules trop coûteuses en temps de rendu.
