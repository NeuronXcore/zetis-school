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
- Sidebar avec : Accueil, Matières, Cours, Révision, Diagnostic, ELI5, Capsules IA, Missions, Quiz, Progression, Mindmaps, Chat ZETIS.
- Page matières.
- Page matière dédiée.
- Page cours. **(FAIT 2026-07-03** : `/subjects/:slug/cours` branchée sur le bouton
  « Cours » de MatiereDetailPage, via les routes élève `GET /api/student/cours/{slug}` et
  `GET /api/student/lessons/{id}/cours` — validé uniquement, filtrage serveur, spec
  `docs/frontend-massimo/page-cours.md`. Reste : XP à la lecture, quiz de fin de cours ;
  notions → skill_mastery.)
- Page quiz.
- Page progression XP.

### Frontend Papa

- Dashboard parent.
- Vue progression Massimo.
- Vue lacunes.
- Vue matières (thèmes/chapitres persistants ; renommée depuis « Matières & programmes » le 2026-07-03).
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

- Cartes par notion (1–3 par skill via `card_type`, validées par Papa). *(à faire —
  chantier dérivé du cours canonique, ADR-0011)*
- Intervalles de révision. **(FAIT 2026-07-04** : moteur MVP, module `memory`.)
- Prochaine révision. **(FAIT 2026-07-04** : replanification `due_at` selon le rating.)
- Révision automatique dans missions. *(à faire)*
- Page Révision Massimo `/revision` : decks circulaires par matière + mélanges
  (spec `docs/frontend-massimo/page-revision.md`, mockup validé 2026-07-04). *(à faire —
  slice UI ; backend prêt : `GET/POST /api/student/reviews/*`)*
- Plafonds de session serveur (mélange 12 / matière 8 / éclair 5) + entrelacement
  des matières côté serveur. **(FAIT 2026-07-04** : `build_session` + helper pur `interleave`.)
- Popups de fin de session à 3 paliers *(à faire — UI)* + re-tour des cartes fragiles
  (1× max, sans effet SRS, XP réduit, détection consolidation côté serveur). **(Backend
  FAIT 2026-07-04** : consolidation détectée serveur, XP +2 ; le « 1× max » reste côté UI.)

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

### ZETIS Galaxy — vue graphe des connaissances (Massimo)

**Chantier dédié**, décidé le 2026-07-28 : trop gros pour être greffé en fin de session.

Spec : `docs/frontend-massimo/zetis-galaxy.md` — ⚠️ **brouillon de fin juin, jamais confronté au
code**, à re-valider avant de s'y fier. Rien n'est implémenté (« galaxy » n'existe nulle part dans
le dépôt).

Idée : la page de progression de Massimo rendue comme une galaxie qu'on allume. Étoile = `Skill`,
constellation = matière, luminosité = `SkillMastery.status`. **Pas de rouge, jamais de manque** —
une notion non vue est une étoile pas encore née, pas un échec. Animation branchée sur les
`learning_events`, jamais sur un timer.

À trancher en ouverture de chantier :

- **Moteur de rendu** — la spec conseille `react-force-graph` / `cytoscape.js`, mais le dépôt a
  déjà `@xyflow/react` + elk (brique mindmap `@zetis/ui/mindmap`). Réutiliser éviterait ~1,6 Mo de
  dépendance en double ; à confirmer, un graphe de connaissances n'a pas les mêmes contraintes
  qu'un arbre de mindmap.
- **Contrat API** — la spec demande `GET /progress/skills` au format `{ nodes, edges }` ; le module
  `progress` expose aujourd'hui `consolidated_skills`, pas ce format. Aucune table nouvelle : tout
  se dérive de `skills` + `skill_mastery`.
- **Sort de `ProgressionPage.tsx`** — la page existe déjà sous une autre forme. Remplacement,
  cohabitation, ou évolution ?
- La spec précède les chantiers Activité, Motivation et Couverture : vérifier qu'elle ne contredit
  pas leurs décisions (notamment la doctrine anti-streak et l'absence de score par matière).

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
