# Prompt Claude Code — Capsules IA · Lot 2 (rendu MP4)

Reprends la branche **`feat/capsules-ia-remotion`** (déjà poussée). Lis d'abord `CLAUDE.md`,
`docs/decisions/adr-0007-capsules-ia-remotion.md`, `docs/ai/capsules-ia.md`, puis la mémoire
projet capsules. Lance `graphify update .` et oriente-toi avec Graphify avant de coder.

## Déjà fait (Slice A + Lot 1, sur cette branche)

- `CapsuleSpec` typé (`packages/types` + Pydantic strict) ; génération ollama (prompt v3,
  sortie structurée) ; CRUD Papa (`app/modules/capsules`), page pilotage + aperçu
  `@remotion/player`.
- Scènes animées : `title`, `bullet`, `definition`, `numberline`, `barmodel`. Contrôles de
  génération (visuel + durée).
- **Narration vocale** : `app/modules/tts` (Piper neural, voix « Pierre » = `fr_FR-upmc-medium`
  speaker 1 ; `SayProvider` macOS en secours). « La voix pilote la durée ». Audio par scène
  écrit sur **disque** (`apps/backend/storage/`, gitignoré) et servi par `GET /api/capsules/{id}/audio/{i}?token=`.

## Objectif Lot 2 — rendu MP4 (suivre l'ADR-0007)

1. **Export MP4** de la composition Remotion (`CapsuleVideo`) via `@remotion/renderer`,
   **sandboxé et asynchrone dans `worker-media`** — jamais dans le process backend. Déclarer
   `licenseKey: "free-license"`. La composition et les scènes se réutilisent telles quelles.
2. **Intégrer l'audio** des scènes (pistes voix Pierre) dans la vidéo rendue.
3. **MinIO** à la place du stockage disque actuel, derrière une petite interface de stockage
   (le disque reste un fallback dev) ; endpoint **`publish`** ; champ `video_url` de `Capsule`
   à alimenter.
4. **Lecture côté Massimo** une fois la capsule `validated` (frontend `frontend-massimo`).
5. **Inserts Manim** (optionnel) : rendu Manim → clip MP4 → `<OffthreadVideo>` dans la
   composition (cf. ADR §4).

## Garde-fous

- Rendu **sandboxé** (`worker-media` dédié, sans réseau, timeouts, limites CPU/RAM), asynchrone
  (file Redis/RQ). Aucune exécution de rendu dans le backend.
- Prérequis local : Piper installé dans le venv backend + `apps/backend/.env` avec
  `TTS_PROVIDER=piper` (voir mémoire). ffmpeg requis par `@remotion/renderer`.
- Types partagés à jour, tests sur la logique métier, `graphify update .` à la fin.

Propose un plan court (worker-media d'abord, puis MinIO, puis publish + lecture Massimo), puis
implémente par étapes avec tests.
