# Archive de session — ELI5 : refonte + voix + STT + notions demandées + suggestions leçons

> **Date** : 2026-07-04 · **Branche** : `feat/eli5-redesign` (créée depuis `main`)
> **Commits** : `143ac25` (backend) · `f0a6906` (massimo) · `c84e3ff` (papa)
> **Base** : substrat canonique + ELI5 v2 (ADR-0011) déjà mergé sur `main`.
> Cette session prolonge la refonte ELI5 Lot B (spec consolidée : `prompt-eli5.md`) et déborde
> volontairement du périmètre « pur frontend » d'origine (à la demande explicite de l'utilisateur).

Vérifs finales : **backend 191 tests · Massimo 36 · Papa 75**, tsc verts partout,
plusieurs e2e live prouvés sur le backend dev `:8001`.

---

## 1. Refonte page ELI5 « la boucle » (Lot B, frontend Massimo)

Point de départ : la page ELI5 en **flow empilé** (conversation qui grandit vers le bas,
rail dégradé indigo→cyan, style glass du login/Matières).

- Hook `useEli5` = machine à états `idle → generating → explained → evaluating → feedback`,
  sections accumulées, auto-scroll + `prefers-reduced-motion`.
- **Décisions tranchées avec l'utilisateur (A/B)** :
  - Colonne verte du feedback = `feedback` (prose) — titrée « Le retour de ZETIS » (le
    contrat n'a pas de liste de points justes) ; ambre = `missing_points` ; `missing_points`
    vide → « 🎉 Tu n'as rien oublié ! ».
  - Chip « à réviser » : libellé résolu par jointure `skill_id → fetchSkills()`, repli
    `stripMarkdown(front_markdown)` ; **le `skill_id` reste toujours réel**.
- Réutilise le badge 2 variantes ELI5 v2 (« 📚 D'après ta leçon … » / « D'après ton cours »).

## 2. Marque ELI5 (icône + duo d'avatars)

- Icône `ELI5.png` dans la **sidebar** (entrée `/eli5`) et en **en-tête de page** (flottante,
  halo indigo, keyframe `eli5-float`).
- **Duo d'avatars** en en-tête : ELI5 (agrandi) ↔ **vrai avatar ZETIS** (`assets/app/zetis-avatar.png`,
  emblème circulaire), avec des **bulles d'explication** qui filent d'ELI5 vers ZETIS
  (« comme si Massimo expliquait à ZETIS », keyframe `eli5-talk`). `motion-safe:` partout.

## 3. Voix de ZETIS (TTS)

- « Quand ZETIS prépare l'explication, il parle. » D'abord voix **navigateur**
  (`speechSynthesis`), puis bascule sur **la même voix que les capsules** = **Piper backend**
  (ADR-0007) via nouvel endpoint `POST /api/ai/tts` (réutilise `get_tts`, 503 propre).
  `src/lib/speech.ts` récupère + joue l'audio, gardé par le réglage son (`isSoundEnabled`).
- Phrase affichée « Massimo, je prépare ton ELI5… » ; **prononcée** en phonétique pour que la
  voix FR sonne « anglais » : `ELI5_PREPARING_SAY = "Massimo, je prépare ton i èl aïe faille-ve"`
  (choisie à l'oreille parmi des candidats générés).

## 4. Dictée STT locale (ADR-0012) + mode vocal

- « Soit Massimo écrit, soit il parle. » **Web Speech navigateur REJETÉE** (envoie l'audio de
  l'enfant à un tiers) → **Whisper LOCAL** via `faster-whisper` (100 % local, vie privée).
- Backend : module `app/modules/stt/` (`FasterWhisperProvider`, `SttUnavailable`), endpoint
  `POST /api/ai/eli5/transcribe` (multipart → texte, tracé `ai_jobs`), settings
  `STT_PROVIDER`/`WHISPER_MODEL` (=`small`, rapide sur CPU Mac ; medium/large-v3 dispo), extra
  `[stt]`, dégradation 503. **`vad_filter=False`** (le VAD Silero jetait l'audio Opus réel du
  micro → transcript vide ; diagnostiqué via `bytes`/`duration` dans `ai_jobs`).
- Frontend : `src/lib/dictation.ts` (MediaRecorder + AnalyserNode). **Mode vocal** dans
  « À toi d'expliquer » : toggle ✍️ Écrire / 🎤 Parler (défaut Écrire), **onde canvas réactive
  au micro** pendant la capture, puis Stop → transcription → bascule auto en Écrire, texte
  éditable. Durci par **revue adversariale multi-agents (7 findings corrigés)** : garde
  anti-course `runId`, garde anti double-démarrage, `roundRect` feature-detect (iOS<16.4),
  DPR canvas, `stop()` résilient, toggle `aria-pressed`, `role=status` ciblé.

## 5. Notion hors-programme → « Dis à Papa » (plan mode, AskUserQuestion)

Quand l'enfant tape une notion absente de son programme (« pythagore »), l'état vide devient
un **signal utile pour Papa** (décision : ne pas expliquer hors-programme — casserait la
boucle reverse ; ne pas deviner par embeddings — la notion est vraiment absente).

- Backend : modèle `NotionRequest` (table `notion_requests`, migration `f2a3b4c5d6e7`),
  module `app/modules/notions/`, `POST /api/ai/eli5/request-notion` (enfant, dédup idempotente),
  `GET/PATCH /api/notion-requests` (Papa, `require_parent`).
- Massimo : bouton « 📨 Dis à Papa d'ajouter « … » » → « C'est noté ! ».
- Papa : `NotionRequestsPanel` dans `ProgrammePage` (liste pending, « ✓ Ajoutée » / « Ignorer » ;
  Papa ajoute via le skills-backfill existant).

## 6. Suggestions « d'après tes leçons en cours » (plan mode, AskUserQuestion)

La chip « 📖 Ta leçon » (auparavant **mockée** `skills[0]`) devient **réelle**.

- **Décisions** : « leçon en cours » = leçons validées de l'année active, **ordre du
  curriculum** ; notions = **priorité aux non-maîtrisées** (`SkillMastery`).
- Backend : `lesson_suggestions(db, student_id, limit=3)` (curriculum/service.py), endpoint
  `GET /api/student/lesson-suggestions`, schéma `LessonSuggestionOut`. Aucune migration.
- Massimo : `fetchLessonSuggestions` + `buildChips(skills, dueReviews, suggestions)` (repli
  mock si vide). E2E live : renvoie 3 notions réelles (« Narrateur », « Schéma narratif »,
  « Personnage principal » ← « Lire et comprendre un texte narratif »).

---

## Endpoints backend ajoutés cette session
- `POST /api/ai/tts` — voix ZETIS (Piper, même moteur que les capsules).
- `POST /api/ai/eli5/transcribe` — dictée STT Whisper local.
- `POST /api/ai/eli5/request-notion` — notion hors-programme demandée (enfant).
- `GET /api/notion-requests`, `PATCH /api/notion-requests/{id}` — triage Papa.
- `GET /api/student/lesson-suggestions` — notions des leçons en cours (chips ELI5).

## Setup dev à retenir
- Backend en **venv local** (uvicorn `:8001 --reload`), PAS en Docker en dev. Les conteneurs
  `zetis-prod-*` (5173/5174/8000) sont des builds figés → ne pas tester dessus (hard-refresh
  requis si le navigateur a mis en cache l'ancien build).
- Fronts dev pointés sur `:8001` (Massimo via `.env.local` gitignoré ; Papa via `VITE_API_URL`).
- STT réel : projet géré par **`uv`** → `uv sync --all-extras` (installe `faster-whisper`),
  le modèle Whisper se télécharge au 1er usage dans `~/.cache/huggingface`. Sans le paquet :
  503 + micro masqué.

## Reporté / TODO
- « C'est parti » de la mini-mission : deep-link mission (non-navigant en V1).
- STT temps réel (streaming) — actuel = « parle → Stop → texte ».
- Ajout en un clic depuis une demande de notion (pré-remplir le skills-backfill).
- Vrai pointeur « leçon courante » (suivi de progression de leçon).
- Synchro de la doc `docs/frontend-massimo/page-eli5.md` avec la voix (TTS/STT activés).
