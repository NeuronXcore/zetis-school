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

  ### Agenda scolaire (ADR-0025)

- ~~Lot 1 — l'objet~~ : **FAIT (2026-07-29)** — table `agenda_items`, co-édition, bande
  glissante, « ce qui arrive », page Papa, page Massimo. Vérifié à l'écran de bout en bout.
  Deux ajouts non prévus par le cadrage : le frozenset `NON_ACTIVITY_EVENTS` (trois lecteurs de
  `learning_events` n'étaient pas filtrés par `event_type`) et la table `app_settings` (le
  verrou de phase devait être un geste de Papa, pas une variable d'env).
- Lot 1 bis — ouverture de la saisie élève : composer + garde-fou doublon, derrière
  `AGENDA_STUDENT_ENTRY_ENABLED`, + interrupteur côté Papa. *(sur décision, pas sur calendrier —
  revue de la phase 0 à 4 semaines)*
- Lot 3 — l'analyse (ADR-0025 §11) : `chapter_id` + sélection référentiel, panneau d'analyse
  Papa, pont vers le Commander, session de révision sans écriture SRS, quiz blanc.
  *(ne dépend que du Lot 1)*
- ~~Lot 2 — parsing~~ : **supprimé** (ADR-0025 §Périmètre). À rouvrir uniquement si la saisie
  élève est ouverte.

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

**LIVRÉ le 2026-07-28** — branche `feat/galaxy`, PR à ouvrir. ⚠️ **Ne pas ré-implémenter.**
Décisions : **ADR-0024** (amendé 3 fois en cours de chantier). Spec :
`docs/frontend-massimo/zetis-galaxy.md`. Routes : `API_SPEC.md` §ZETIS Galaxy.
Pièges d'exécution : `MEMORY.md` §Chantier ZETIS Galaxy.

Reste à la charge du user, non vérifiable par l'agent. **MacBook vérifié le 2026-07-28** (fluide
au plafond desktop de 150). Restent l'**iPhone** et l'**iPad** (paliers 40/90 provisoires), et
**`prefers-reduced-motion`** — non exercé, l'option étant désactivée sur la machine du user.

Idée : la page de progression de Massimo rendue comme une galaxie qu'on allume. Étoile = `Skill`,
constellation = matière, amas = chapitre, luminosité = `SkillMastery.status`. **Pas de rouge,
jamais de manque** — une notion non vue est une étoile pas encore née, pas un échec.

Décisions prises (détail et justifications dans l'ADR) :

- **Emplacement** — la Galaxy **devient le contenu de `/progression`** (même route, même onglet).
  La section « par matière » **mockée** disparaît.
- **Moteur de rendu** — **`react-force-graph-3d`**, en `lazy()`. Le user a demandé un graphe **3D
  animé, aux nœuds étirables** : `@xyflow/react` (canvas 2D) est techniquement disqualifié. Deux
  moteurs graphe coexistent désormais — React Flow reste celui des mindmaps (ADR-0016, non rouvert).
- **Arêtes** — dérivées de la **structure réelle uniquement** (`Skill ← lesson_skills → Lesson →
  Chapter`). ⚠️ Le read-before-code a montré que **`prerequisite_skill_ids` n'existe pas** et que
  `parent_skill_id` est **NULL partout** : les « liens stellaires » du brouillon n'avaient aucune
  source. Un graphe de prérequis reste possible, mais c'est un chantier pédagogique à part.
- **Contrat API** — `GET /progress/skills` **n'existe pas** et `progress` est Papa-only. Trois
  routes élève neuves sous `/api/student/galaxy`, assises sur `evidence.mastery_by_skill()`.
  Aucune table, **aucune migration**.
- **Clic sur une étoile** → panneau d'actions. ⚠️ Seul ELI5 est notion-adressable par URL
  aujourd'hui, d'où une troisième route dédiée. Une action sans contenu validé **n'est pas
  proposée**.
- **Doctrine** — l'ADR fige rétroactivement : pas de rouge, **aucun score ni pourcentage par
  matière** (un **compte** d'étoiles allumées), **aucun capital perdable** (pas de streak, une
  étoile allumée ne s'éteint pas).

Prompts prêts : `prompts/claude-code/prompt-galaxy-slice-a-backend.md` (backend, zéro migration)
puis `prompt-galaxy-slice-b-frontend.md` (Massimo).

Risques connus, à surveiller : poids de Three.js (~600 Ko-1 Mo, isolé par `lazy()`) et **perf 3D
sur le poste le plus contraint** — Massimo travaille sur **iPhone, iPad et un MacBook dédié à
l'école**, et ce sont les deux derniers qui donnent son sens à une vue 3D. Plafond de nœuds
**adaptatif** (compact 40 / tablette 90 / desktop 150, valeurs **provisoires non mesurées**) et
repli sans WebGL prévus, **à essayer sur les trois appareils réels**.

Reste ouvert (hors v1) : graphe de prérequis, aperçu sur l'Accueil, annonce « +1 étoile » en fin de
mission, animation temps réel, et la **réconciliation de `docs/frontend-massimo/navigation.md`**
(autre brouillon du même stash, qui décrit une nav à 5 verbes contredite par les 12 entrées réelles).

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
- **La bascule en phase 1 n'arrive jamais** : si Papa remplit correctement, personne ne ressent
  le besoin de changer et l'agenda reste une liste imposée (risque produit n°1). Revue à date
  fixée, pas « quand il sera prêt ».
- **Phase 0 : la qualité de l'agenda dépend à 100 % de la régularité de Papa.** Un dimanche
  soir sauté = page vide toute la semaine, aucun filet.
- **Session pré-contrôle (ADR-0025 §11.2)** : le non-scheduling existe (`is_consolidation`,
  même jour seulement) mais il manque un deck `{chapter}` et l'extension hors du même-jour.
  Sans ces deux ajouts, une révision avant contrôle **reprogrammerait** les cartes et
  dégraderait la mesure d'oubli sur des mois. Slice dédiée dans le Lot 3.
- Un compteur d'items non faits réintroduit par l'UI (côté Papa comme côté Massimo) →
  contournerait par l'affichage l'invariant tenu serveur (`agenda_item_missed` n'existe pas).