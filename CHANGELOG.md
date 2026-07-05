# CHANGELOG.md — Historique ZETIS

## 0.17.0 — Fiches de révision (ADR-0015) : backend + viewer Massimo + pilotage Papa

Date : 2026-07-05

### Ajouté

- **Backend — module `fiches`** — `FicheSpec` à budgets (const `FICHE_BUDGETS` : `essentiel` ≤ 600,
  `definitions` ≤ 4, `points_cles` ≤ 5, `erreurs_a_eviter` ≤ 3, `mini_exemple` ≤ 400) + miroir
  Pydantic strict ; prompt versionné `app/prompts/fiche.py` (`v1`) ; service `generate_fiche`
  **leçon-centré** dérivé du **cours canonique** (ADR-0011, force le cours de la leçon + complément
  RAG, comme le quiz de fin de cours) ; migration `d3e4f5a6b7c8` (tables `fiches` + `fiche_views`) ;
  trace `ai_jobs` `fiche_generate`.
- **Endpoints** — Papa (`require_parent`) `/api/fiches/*` (generate, `PUT` revalide→`pending`,
  regenerate, validate, delete, `lessons/{id}`, `pilotage/{subject_id}` = arbre matière→leçons→fiches,
  miroir quiz-pilotage) ; Massimo (`/api/student/fiches/*`, gate `validated`, 404 sinon) :
  `summary` (decks), `subjects/{slug}/fiches`, `{id}`, `{id}/seen`.
- **Briques `@zetis/ui` factorisées** — `GenerationProgress` (variant `bar`|`ring` +
  `useEstimatedProgress` déplacé de frontend-papa), `ContentLifecycleActions` (quatuor
  Générer · Régénérer · Éditer · Supprimer) et `ContentStatusBadge`. `ProgressBar.tsx` (Papa)
  ré-exporte `GenerationProgress` → **capsules intactes** (preuve de réutilisation). Réutilisées
  ensuite par les mindmaps (ADR-0016).
- **Viewer Massimo** (`/fiches`, `/fiches/:slug`) — decks `SubjectDeckGrid` (badge « ✨ nouveau »),
  `FicheCard` (⭐/📖/🔑/⚠️/💡 + badge « 📚 D'après ton cours »), bouton **« 📖 Voir le cours »**
  (panneau du cours source **à côté** de la fiche, même page ; réutilise
  `/api/student/lessons/{id}/cours` + `react-markdown`), **export A5** « 🖼️ Image A5 » (PNG) et
  « 🖨️ Imprimer » (document A5 autonome) via `html-to-image` — corrige la page blanche de
  l'impression du shell.
- **Pilotage Papa** (`/fiches`, émeraude) — arbre matière→leçons→fiches, génération par leçon +
  célébration, `ContentLifecycleActions` par fiche, **éditeur structuré** `FicheEditorModal`
  (formulaire + compteurs de budget) remplaçant l'édition du `spec_json` brut.

### Décisions

- La fiche est un **objet leçon** (« 1 leçon = 1 page », budgets = contrat structurel), distinct de
  la flashcard SRS (qui porte une *notion*) ; pont SRS différé ; génération par Massimo différée.

304 tests backend + 104 (Papa) + 73 (Massimo) verts ; `tsc -b` et `vite build` verts ; migration
appliquée sur le Postgres de dev. Dépendance ajoutée : `html-to-image` (frontend-massimo).

## 0.16.0 — ELI5 v2 : entrée par decks matières + composant partagé + emblème animé

Date : 2026-07-05

### Ajouté

- **Routes élève « notions validées »** (module `curriculum`, lecture seule, aucune migration)
  — `GET /api/student/notions/summary` (compteurs par matière de l'année active, une requête
  agrégée) et `GET /api/student/subjects/{slug}/notions` (notions dédupliquées par `skill_id`,
  `chapter_title` de la leçon la plus récente ; 404 hors année, `[]` si rien de validé). Même
  chaîne de filtrage que les cours élève (chapitre `validated` → leçon `validated` → `Skill`).
  Types dans `packages/types/src/curriculum.ts`.
- **Refonte ELI5 en 3 écrans** (frontend Massimo, `/eli5`) : écran 1 **decks matières**
  (compteurs de notions, matière vide = « bientôt », deck « ✨ Question libre » en tête) → écran 2
  **chips de notions** (nom + `chapter_title`) + champ « pose ta question » → écran 3 = **la
  session ELI5 existante, inchangée** (explain → reverse, badge « D'après ta leçon »). Chip →
  `explain` avec `skill_id` réel (badge leçon déterministe) ; question libre → résolution client
  (le moteur n'accepte que `skill_id`). Deep-link `?subject=slug`. Le moteur ELI5 n'est pas touché.
- **Composant partagé `SubjectDeckGrid`** — extrait de la grille « Par matière » de la page
  Révision (enveloppe `DeckDisc`), **Révision migrée dessus à l'identique** (parité visuelle
  préservée) ; les Mélanges restent locaux à Révision. `DeckDisc` gagne des options
  rétro-compatibles (deck atténué mais cliquable, `soonHint`, `hideBadge`).
- **Badge « ✨ new » sur les decks ELI5** — `new_count` par matière dans `/notions/summary` :
  notions dont une leçon validée porteuse a été créée dans les 7 derniers jours (récence de
  création, signal global ; `Lesson.created_at` faute d'horodatage sur `Skill`/`Chapter`).
- **Emblème animé ELI5** dans l'en-tête de l'écran decks — symboles de complexité (❓🔢🧩🌀) en
  orbite autour de l'ampoule 💡 qui s'illumine par à-coups (« aha ! ») en projetant des
  étincelles ; 4 `@keyframes` en `motion-safe:` (figé sous `prefers-reduced-motion`).

## 0.15.0 — Moteur de quiz unifié (ADR-0014, Lot 1) : backend + pilotage Papa + client Massimo

Date : 2026-07-05

### Ajouté

- **Moteur de quiz unifié** (ADR-0014, module `quizzes`) — quiz de fin de cours en premier
  client, **deuxième client du substrat canonique** (ADR-0011). Génération **locale** depuis le
  cours validé d'une leçon (formats choisis par le modèle), **auto-vérification à l'aveugle**
  (question dont le modèle ne retrouve pas sa clé → écartée), **correction déterministe serveur**
  (7 formats : `mcq`, `mcq_multi`, `true_false`, `cloze`, `numeric`, `ordering`, `matching`),
  **scoring pondéré** (`mission` = signal faible, **n'ouvre jamais de lacune**). XP = base
  d'effort + bonus score (0 %→10, 100 %→30).
- **Page Papa « Quiz — pilotage »** (`/quiz`, endpoints `/api/quiz-pilotage/*` + `/api/quizzes/*`)
  : inventaire par matière, génération par leçon (popover volume/difficulté + barre de progression),
  inspection avec clés, édition (→ `manual`)/ajout manuel/retrait, régénération (préserve les
  `manual`), suppression (hard/archivage), KPI + santé de l'auto-vérification par matière.
- **Client Massimo** (`/quiz`, `/quiz/session`, endpoints `/api/student/quiz*`) : grille des
  matières (grisée si aucun quiz) → lecteur question par question (7 formats), **feedback immédiat
  bienveillant** (jamais la clé), résumé de fin (XP + forces / « à revoir bientôt ») ; bouton
  « 🎯 Quiz » sur la page Cours quand un quiz existe ; hero animé sur la page Quiz.
- **Migration `b1c2d3e4f5a6`** : `quizzes.lesson_id`, `quiz_questions.source` + `.status`
  (`question_type` reste `varchar` → extension des formats sans DDL).
- **Lot 2 — format `open` (jugement LLM)** — clôt l'ADR-0014. Réponse écrite libre **jugée par
  le moteur local** contre des critères (opt-in manuel Papa, hors mix auto-généré) : évaluation
  **critère par critère** (persistée dans `quiz_answers.ai_evaluation_json`, migration
  `c2d3e4f5a6b7`), **bénéfice du doute** si le juge n'est pas sûr (élève crédité, ambiguïté
  remontée à Papa), feedback toujours bienveillant. Player Massimo (zone de texte) + authoring
  Papa (bascule QCM / Réponse ouverte + critères). Vérifié live (Ollama réel).

### UI Massimo (retouches)

- En-tête sidebar refondu (logo `zetis-avatar.png` + halo animé + wordmark `zetis-texte.png`),
  aligné sur l'avatar du header ; header : profil Massimo à gauche ; fond sidebar = fond header
  (`#000010`) ; icônes agrandies.

## 0.14.0 — Cartes SRS : génération page-driven + pilotage Papa + refonte UI Révision Massimo

Date : 2026-07-05

### Ajouté

- **Génération des cartes SRS** (ADR-0013, module `memory`) : contenu dérivé du **cours
  validé** de chaque notion, 100 % local (Ollama), upsert réconciliateur à 3 branches
  (A régénère en préservant la planif / B crée / C suspend les orphelines, réactivables).
  Page Papa **« Cartes de révision »** (`/cartes-revision`) : arbre matière→chapitre→notion,
  KPI, aperçu recto/verso, génération par matière.
- **Pilotage Papa — évolutions** (endpoints `/api/memory/cards/*`, `require_parent`) :
  - Bouton **« ↻ Régénérer »** par matière, même quand rien n'est « à générer »
    (réconciliation non destructive) ; **barre de progression estimée (%)** pendant la
    génération (patron partagé `ProgressBar` + `useEstimatedProgress`).
  - **Édition d'une carte** en place (`PATCH /api/memory/cards/{card_id}`, recto/verso,
    planification préservée) et **suppression d'une carte** unitaire
    (`DELETE /api/memory/cards/{card_id}`), avec `ConfirmDialog` — distinctes du retrait de
    toute une notion (`DELETE /skills/{id}`).
- **Surface Massimo** : `GET /api/student/reviews/summary` renvoie **toutes** les matières
  avec un booléen `has_cards`.
- **Refonte UI page Révision Massimo** (`/revision`) :
  - « Par matière » affiche **toutes** les matières ; celles sans carte apparaissent
    **grisées** avec leur **emoji** (« à venir » / « pas encore de cartes »), non lançables.
  - Decks = **simples cercles** avec l'icône/emoji de la matière (suppression de l'effet
    pile et de l'anneau conique coloré / « halo »).
  - Bannière motivante **« SRS · Révision espacée »** (`SpacedMemoryHero`) : illustration
    `SRS-cards.png` animée + courbe SVG de mémoire (points espacés 1j→3j→7j→14j).
  - `FlipCard` recto/verso **color-codés** : recto bleu « Question », verso émeraude
    « Réponse ».
  - Icône de la sidebar « Révision » = `SRS-cards.png` (au lieu de l'emoji 🗂️).

### Décisions

- Contrat `summary` étendu : `has_cards` distingue « aucune carte active » de « cartes
  présentes » (grisé vs « à jour ✓ ») — cf. ADR-0013 (addendum).
- L'édition d'une carte ne touche **jamais** la planification (`interval_days`,
  `ease_factor`, `due_at`) : seul le contenu change (invariant ADR-0013 §3).
- La régénération d'une matière est **non destructive** (réécrit le contenu, préserve
  l'historique de révision de Massimo).

## 0.13.0 — Référentiel : rattrapage « skills-only » + verrous du cours canonique

Date : 2026-07-03

### Ajouté

- **Génération « skills-only » pour un niveau antérieur** (rattrapage, `docs/decisions/adr-0010-generation-skills-only-rattrapage.md`) :
  Papa peut alimenter le référentiel de notions (`Skill`) d'un niveau du même cycle
  (ex. français 5e) sans créer d'année scolaire rétroactive. Flux **stateless** en deux
  temps : `POST /api/curriculum/skills-backfill/generate` enchaîne les passes 1 et 2
  **en mémoire** (chapitres et leçons ne servent que d'échafaudage et ne sont **jamais
  persistés**) et renvoie une prévisualisation des notions groupées + dédupliquées ;
  après revue, `POST /api/curriculum/skills-backfill/confirm` upserte les notions en
  `Skill` au niveau cible (réutilise l'upsert de la passe 2 — aucune leçon ni liaison
  créée). Garde parent, niveau borné au cycle 4 (5e/4e/3e → sinon 400), trace `ai_jobs`
  `curriculum_skills_backfill`, invariant vie privée testé. Miroir de types dans
  `packages/types`.

### Décisions

- **Cours validé = source canonique des dérivés** (addendum `docs/decisions/adr-0009-addendum-cours-canonique.md`) :
  un `Lesson.content_markdown` **validé** devient le contexte prioritaire des dérivés
  (ELI5, capsule, quiz…), avant le RAG brut et la connaissance du modèle ; le lien
  `Lesson ↔ Skill` est la table N-N `lesson_skills`.
- **Passe 1 strictement mono-niveau** (précision ADR-0010) : le débordement du few-shot
  SVT est corrigé et `CURRICULUM_PROMPT_VERSION` passe à `v2`.

### Corrigé / verrouillé

- **Gate du cours canonique** : `POST /api/lessons/{id}/generate-content` remet désormais
  la leçon en `draft` après une (re)génération réussie (même si elle était `validated`) —
  un cours réécrit non relu ne doit plus alimenter les dérivés ni Massimo avant
  revalidation par Papa. (`archived` reste 409 ; l'édition manuelle du cours par Papa,
  `PATCH /lessons/{id}`, ne touche pas le statut : Papa est l'autorité de validation.)
- **Index `ix_lesson_skills_skill`** sur `lesson_skills(skill_id)` (migration
  `e1f2a3b4c5d6`) : la PK composite `(lesson_id, skill_id)` ne couvre pas la résolution
  du cours canonique par notion (filtre `skill_id`).

## 0.12.0 — Moteur LLM (MoE), lancement prod-like « tout Docker » + UX capsules (étape 21)

Date : 2026-07-03

### Ajouté

- **Lancement prod-like « tout containerisé »** (`pnpm prod:up`, `docker-compose.prod.yml`) : backend,
  worker-media et les **2 frontends servis par nginx**, en une commande, à côté du dev natif
  (`pnpm dev`, inchangé). **Ollama reste sur l'hôte** (GPU Metal) ; le backend le joint via
  `host.docker.internal`. Cf. `infra/docker/README.md`.
- **Voix Piper (TTS) dans l'image backend** : `piper-tts` + modèle FR `fr_FR-siwis-medium` bakés →
  la narration des capsules fonctionne en conteneur.
- **Célébration « mini-victoire »** (brique partagée `@zetis/ui`, réutilisable) : petit surgissement
  joyeux (halo néon + particules, CSS) + **carillon doux synthétisé** (Web Audio, aucun asset
  binaire), **désactivable** via un `SoundToggle` persistant. Papa : à la génération réussie
  (« Capsule créée ! ») ; Massimo : quand une **nouvelle capsule** apparaît (dédup une-fois-par-capsule).
  Respecte `prefers-reduced-motion`.
- **Compteur de visionnages de Massimo** sur les 2 frontends : `CapsuleStats.view_count` (somme des
  visionnages, répétitions incluses) ; badge « 🎬 N visionnages ».

### Décisions

- **Moteur d'inférence LLM** (`docs/decisions/adr-0008-inference-mlx-vs-ollama.md`) : benchmark sur les
  vrais prompts ZETIS (vitesse + qualité + % JSON valide) → **MLX rejeté** (plus lent qu'Ollama sur
  M3 Max) ; **adopté `qwen3.6:35b-a3b`** (MoE : qualité ≈ 72b à la vitesse la plus rapide ;
  `OllamaProvider` passe `think:false` pour les modèles Qwen3). Référence cloud (GPT-4o, Claude
  Sonnet 5) : le local égale/dépasse → **production 100 % locale** confirmée (vie privée de Massimo).
- **Embeddings découplés** de la génération (`EMBED_PROVIDER`, défaut `ollama`) → changer de modèle de
  génération ne casse pas le RAG (zéro migration pgvector).

### Corrigé

- **Rendu MP4 en conteneur** : le worker-media lisait la DB via le défaut `localhost:5432`
  (connection refused) → clé d'env corrigée en **`ZETIS_DATABASE_URL`** (préfixe attendu par la
  config) ; sans ça la capsule restait `rendering` (invisible côté Massimo). Ajout de `shm_size: 1gb`
  (fiabilité Chromium/Remotion sur capsules longues).

## 0.11.0 — Capsules IA : Remotion + rendu MP4 + voix Piper (étape 20)

Date : 2026-07-01

### Ajouté

- **Rendu MP4 sandboxé** (ADR-0007) : le **worker-media** consomme une file **RQ** et rend chaque capsule en vidéo via **Remotion/Node** (Chromium + ffmpeg), isolé du backend. La vidéo est stockée sur **MinIO** (repli disque) et **lue côté Massimo**.
- **Voix off Piper par scène** : synthèse vocale locale (abstraction TTS, provider Piper) — la **narration pilote la durée de chaque scène**.
- **Vocabulaire de scènes étendu à 9 types** : ajout de `barmodel`, `geometry`, `steps`, `timeline`, `diagram`.
- **Regroupement matière → chapitre** de la bibliothèque de capsules (Massimo), avec **recherche** et **icônes de matière**.
- **Difficulté** (facile / moyen / difficile) et option de **durée ≈ 1 min** pilotant la génération (**prompt v5**).
- **Suivi des visionnages** Massimo : marquage vu / nouvelles capsules / **compteur de répétitions**.
- **Pilotage Papa** : modale de création (badge **capsule-AI**), **édition JSON** du spec, **barres de progression live** (génération / voix / rendu) et **rendu automatique à la validation**.

### Décisions

- Capsule = **spec typé** (JSON versionné) rendu par un **moteur Remotion** : Player à l'écran (Lot 1) puis rendu **MP4** hors-ligne (Lot 2), cf. `docs/decisions/adr-0007-capsules-ia-remotion.md`.
- Rendu vidéo **sandboxé** dans le worker-media (RQ), jamais dans le process backend ; artefacts sur MinIO.
- Routes capsules **réservées à Papa** ; Massimo ne consulte que la bibliothèque validée et enregistre ses visionnages.

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
