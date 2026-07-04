# Prompt Claude Code — ELI5 Massimo (complet)

Construis la fonctionnalité **ELI5** de bout en bout : la page enfant `apps/frontend-massimo`,
sa voix, sa dictée, et les endpoints backend qui l'alimentent. ELI5 est un module CENTRAL :
1) ZETIS explique une notion simplement ; 2) Massimo réexplique pour vérifier sa compréhension
(**mode reverse OBLIGATOIRE** — cf. CLAUDE.md). C'est la seule page où **Massimo initie** :
le champ libre est l'action principale ; les leçons n'entrent que par **suggestion** (chips)
ou deep-link mission, jamais par contrainte.

## À lire AVANT d'écrire du code
1. `docs/frontend-massimo/page-eli5.md` (spec de la page — source de vérité de l'UI).
2. Les contrats réels (ils PRIMENT sur la spec) : `apps/frontend-massimo/src/lib/eli5.ts`,
   `src/hooks/useEli5.ts`, `src/pages/Eli5Page.tsx`. Ne suppose JAMAIS la forme d'une API.
3. Substrat canonique + ELI5 v2 (ADR-0011) : le badge « 📚 D'après ta leçon … » / « D'après
   ton cours » et les champs `lesson_id?`/`lesson_title?`/`sources_used?` existent déjà — RÉUTILISE.
4. Primitives de style : `components/glass.tsx` (verre + halos néon), `@zetis/ui`
   (Button/Card/Badge/Spinner/EmptyState + `isSoundEnabled`/`SoundToggle`), thème indigo.
5. ADR pertinents : ADR-0007 (voix Piper des capsules), ADR-0009/0011 (référentiel + cours
   canonique), **ADR-0012** (STT Whisper local — à créer si absent).

Si un type réel contredit la spec : **STOP, signale, ne contourne pas.**

## À implémenter — FRONTEND (`apps/frontend-massimo`)

### 1. Hook `useEli5` — toute la logique (aucune logique métier dans les composants)
- Machine à états `idle → generating → explained → evaluating → feedback` ; sections
  accumulées (montées puis conservées), reset propre sur nouvelle question ; **gardes
  anti-course** (`runId`) sur explain / reverse / dictée.
- Une SEULE source `fetchSkills()`, mutualisée entre la résolution du champ et les libellés
  de chips.
- **Résolution du champ au clic** (le backend n'accepte que des `skill_id`) : match casse-
  insensible du texte contre les skills réels. Match → `explain(skill_id)` ; aucun match →
  état vide bienveillant (voir §4). Jamais de requête sans `skill_id`.

### 2. Page « la boucle » (présentation pure, style login/Matières)
- Conversation empilée qui grandit vers le bas, **rail vertical dégradé indigo→cyan**.
- États : champ + chips → onde « ZETIS prépare… » → carte explication (badge 2 variantes,
  blocs analogie/exemple/mini-question teintés, bouton « 🔄 Je réexplique autrement ») →
  « À toi d'expliquer » → carte retour.
- En-tête : **duo d'avatars** ELI5 (agrandi, `assets/app/ELI5.png`) ↔ **vrai avatar ZETIS**
  (`assets/app/zetis-avatar.png`) avec bulles animées d'ELI5 vers ZETIS ; icône ELI5 aussi
  en sidebar. `motion-safe:` partout, `prefers-reduced-motion` respecté (onde, toast, scroll).
- Auto-scroll `scrollIntoView` à chaque section ; jamais pendant la saisie du textarea.

### 3. Chips de suggestion (≤ 4, suggestion jamais injonction)
- Chips « 📖 Ta leçon » = **notions RÉELLES des leçons en cours** via
  `GET /api/student/lesson-suggestions` (≤ 2). **Repli** sur `skills[0]` (mock) seulement si
  l'endpoint ne renvoie rien.
- Chips « 🔁 à réviser » = **réelles** via `fetchDueReviews()` (SRS) ; libellé résolu via
  skills, repli `stripMarkdown(front_markdown)`. Dédup `skill_id`.
- **Chaque chip porte un `skill_id` réel** → clic = explain + badge « D'après ta leçon ».
- Deep-link `/eli5?skill={id}` pré-remplit et lance.

### 4. État vide hors-programme → « Dis à Papa »
- Notion tapée absente du programme → message bienveillant + bouton **« 📨 Dis à Papa
  d'ajouter « {texte} » »** → `POST /api/ai/eli5/request-notion` → confirmation « C'est noté ! ».
  (Ne PAS expliquer hors-programme : casserait la boucle reverse. Ne pas deviner par embeddings.)

### 5. Voix de ZETIS (TTS) — même voix que les capsules
- Pendant les ondes, ZETIS **parle** via `POST /api/ai/tts` (moteur Piper des capsules,
  ADR-0007), lecture audio dans `src/lib/speech.ts`, **gardé par `isSoundEnabled()`** (toggle
  son dans l'en-tête ; jamais d'autoplay si coupé). Phrase generating affichée
  « Massimo, je prépare ton ELI5… », **prononcée** en phonétique (voix FR → sonne anglais).

### 6. Dictée STT (Whisper LOCAL) + mode vocal — « soit il écrit, soit il parle »
- Mode Écrire (défaut) / Parler (toggle) dans « À toi d'expliquer ». Mode Parler : capture
  `MediaRecorder` (`src/lib/dictation.ts`) + **onde canvas réactive au micro** (AnalyserNode) ;
  Stop → `POST /api/ai/eli5/transcribe` (Whisper local) → bascule auto en Écrire, texte
  ÉDITABLE. Erreurs visibles (micro refusé / rien entendu / serveur KO), jamais silencieuses.
- **Web Speech navigateur INTERDITE pour le STT** (envoie l'audio de l'enfant à un tiers) :
  Whisper local uniquement (vie privée, CLAUDE.md + ADR-0012).

### 7. Feedback bienveillant (mapping UI ≠ contrat API)
- Anneau « X % compris » (`ProgressRing`), colonne verte (feedback) AVANT ambre
  (`missing_points`), `missing_points` vide → « 🎉 Tu n'as rien oublié ! », encart mini-mission.
- **Jamais** « échec », « manquant », « lacune », « nul » à l'écran.

## À implémenter — BACKEND (`apps/backend`)
Endpoints requis par le frontend (auth : enfant sauf mention Papa) :
- `POST /api/ai/tts` — synthèse voix (réutilise `get_tts` / Piper), 503 propre sans voix.
- `POST /api/ai/eli5/transcribe` — STT Whisper local (module `stt/`, `faster-whisper`, extra
  `[stt]`, `vad_filter=False`, tracé `ai_jobs`), 503 sans le paquet → le front masque le micro.
- `POST /api/ai/eli5/request-notion` (enfant, dédup) + `GET`/`PATCH /api/notion-requests`
  (Papa, `require_parent`) — modèle `NotionRequest` + migration + module `notions/`.
- `GET /api/student/lesson-suggestions` — notions des leçons validées de l'année active, ordre
  du curriculum, priorité aux notions non maîtrisées (`SkillMastery`) ; aucune migration.
- Côté Papa : panneau `NotionRequestsPanel` dans `ProgrammePage` (liste + triage).

## Contraintes
- Vie privée de Massimo : STT/TTS **100 % local** (Whisper + Piper), aucun tiers.
- Aucune donnée pédagogique durable côté front. Types partagés dès qu'un contrat change.
- Réutilise `@zetis/ui` + `glass.tsx` ; aucune dépendance/CSS dupliqué inutile.
- `prefers-reduced-motion` respecté partout ; responsive (colonnes feedback empilées < 620 px).
- Ne casse pas le contrat existant : la page doit fonctionner avec le backend tel quel
  (dégradations propres si TTS/STT/suggestions indisponibles).

## Tests
- Vitest hook `useEli5` : transitions, reset, accumulation, mapping badge (3 cas), résolution
  du champ (match/no-match), chips (suggestions réelles + repli mock, `skill_id` réels),
  requestNotion, mode Écrire/Parler. Rendu : le feedback n'affiche jamais les mots interdits.
- Pytest backend : transcribe (200/400/503), tts (200/400), request-notion (création/dédup/
  Papa/403), lesson-suggestions (ordre, dédup, non-maîtrisées, `[]` propre).
- `tsc -b` + suites existantes vertes.

## À la fin
- Liste des fichiers créés/modifiés, endpoints ajoutés, migrations.
- Étape one-time STT : `uv sync --all-extras` (installe `faster-whisper`) — modèle Whisper
  téléchargé au 1er usage.
- Signale tout écart spec/type réel rencontré.
